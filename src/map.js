import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as THREE from 'three';
maplibregl.setWorkerUrl(workerUrl);

/** Land colours are shared with the dashboard legend. Heights in the Three.js
 * layer are schematic selection slabs, never surveyed terrain/building heights. */
export const LAND_COLORS = {
  arable: '#c7b35d', grass: '#91b37c', forest: '#427562', water: '#67a9be',
  building: '#c8876a', garden: '#a3ba75', other: '#9e9d92',
};
export const INTEREST_COLORS = {
  confirmed: '#d39547', considering: '#c4b17b', conditional: '#b57669', lease: '#719ba8',
  multiple: '#a777af', none: '#b7beb1',
};

const EMPTY = { type: 'FeatureCollection', features: [] };
const ORTHO = 'https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=0&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg&STYLES=';
const SOURCE = 'docekal-parcels';
const IDS = { fill: 'parcel-fill', line: 'parcel-boundary', interest: 'parcel-interest', selected: 'parcel-selected', labels: 'parcel-labels', three: 'parcel-three' };

function colourExpression(mode) {
  const colours = mode === 'interest' ? INTEREST_COLORS : LAND_COLORS;
  return ['match', ['coalesce', ['get', mode === 'interest' ? 'interestStatus' : 'kind'], 'other'],
    ...Object.entries(colours).flat(), mode === 'interest' ? INTEREST_COLORS.none : LAND_COLORS.other];
}

function visitCoordinates(geometry, visit) {
  if (!geometry) return;
  const walk = (coords) => typeof coords?.[0] === 'number' ? visit(coords) : coords?.forEach(walk);
  walk(geometry.coordinates);
}

function boundsOf(features) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((f) => visitCoordinates(f.geometry, (coordinate) => {
    if (Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) bounds.extend(coordinate);
  }));
  return bounds.isEmpty() ? null : bounds;
}

/** createParcelMap(container, {onSelect(id, feature), onReady(), onError(error)}) */
export function createParcelMap(container, { onSelect = () => {}, onRelationSelect = () => {}, onReady = () => {}, onError = () => {} } = {}) {
  let collection = EMPTY;
  let relations = EMPTY;
  let relationsVisible = true;
  let visibleIds = null;
  let selectedId = null;
  let hoveredId = null;
  let ready = false;
  let firstFit = true;
  let is3D = false;
  let colourMode = 'land';
  let destroyed = false;
  let basemap = 'map';
  let context = { parcels: EMPTY, buildings: EMPTY, zones: EMPTY, places: EMPTY };
  let contextVisible = true;
  let contextBuildingMesh;
  const meshes = new Map();
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  let renderer;
  let origin = maplibregl.MercatorCoordinate.fromLngLat([15.2, 49.15]);
  let metre = origin.meterInMercatorCoordinateUnits();
  const map = new maplibregl.Map({
    container,
    center: [15.203, 49.15],
    zoom: 11.8,
    minZoom: 5,
    maxZoom: 20,
    maxPitch: 70,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    renderWorldCopies: false,
    canvasContextAttributes: { antialias: true },
    style: {
      version: 8,
      // Local, validated PBFs include Latin and Czech glyphs. The former public
      // OpenMapTiles endpoint currently returns an HTML page with HTTP 200.
      glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
      sources: {
        osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
        ortho: { type: 'raster', tiles: [ORTHO], tileSize: 256, maxzoom: 20, attribution: 'Ortofoto © <a href="https://geoportal.cuzk.gov.cz/" target="_blank" rel="noopener">ČÚZK</a>' },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#e9e8dd' } },
        { id: 'basemap-osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.65, 'raster-contrast': -0.07, 'raster-opacity': 0.88, 'raster-fade-duration': 180 } },
        { id: 'basemap-ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.18, 'raster-fade-duration': 180 } },
      ],
    },
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Parcely © ČÚZK, INSPIRE CP' }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

  function disposeMeshes() {
    for (const objects of meshes.values()) for (const object of objects) {
      scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    meshes.clear();
  }

  function meshColour(properties) {
    return (colourMode === 'interest' ? INTEREST_COLORS[properties.interestStatus] : LAND_COLORS[properties.kind]) || LAND_COLORS.other;
  }

  function rebuildMeshes() {
    disposeMeshes();
    const bounds = boundsOf(collection.features);
    if (!bounds) { rebuildContextMeshes(); return; }
    origin = maplibregl.MercatorCoordinate.fromLngLat(bounds.getCenter());
    metre = origin.meterInMercatorCoordinateUnits();
    for (const feature of collection.features) {
      const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      const objects = [];
      const id = String(feature.properties.id);
      for (const rings of polygons) {
        if (!rings[0] || rings[0].length < 4) continue;
        const paths = rings.map((ring) => ring.map(([lng, lat]) => {
          const point = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
          return new THREE.Vector2((point.x - origin.x) / metre, (point.y - origin.y) / metre);
        }));
        const shape = new THREE.Shape(paths[0]);
        for (const hole of paths.slice(1)) shape.holes.push(new THREE.Path(hole));
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 });
        const material = new THREE.MeshBasicMaterial({ color: meshColour(feature.properties), transparent: true, opacity: 0.87, side: THREE.DoubleSide, depthTest: true, depthWrite: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.position.z = 0.25;
        mesh.userData = { id, properties: feature.properties, slab: true };
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 12), new THREE.LineBasicMaterial({ color: '#526553', transparent: true, opacity: 0.88, depthTest: true }));
        edge.frustumCulled = false;
        edge.position.z = 0.25;
        edge.userData = { id, edge: true };
        objects.push(mesh, edge);
        scene.add(mesh, edge);
      }
      meshes.set(id, objects);
    }
    rebuildContextMeshes();
    refreshMeshes();
  }

  function rebuildContextMeshes() {
    if (contextBuildingMesh) {
      scene.remove(contextBuildingMesh);
      contextBuildingMesh.geometry.dispose();
      contextBuildingMesh.material.dispose();
      contextBuildingMesh = null;
    }
    const shapes = [];
    for (const feature of context.buildings?.features || []) {
      const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      for (const rings of polygons) {
        if (!rings[0] || rings[0].length < 4) continue;
        const paths = rings.map((ring) => ring.map(([lng, lat]) => {
          const point = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
          return new THREE.Vector2((point.x - origin.x) / metre, (point.y - origin.y) / metre);
        }));
        const shape = new THREE.Shape(paths[0]);
        for (const hole of paths.slice(1)) shape.holes.push(new THREE.Path(hole));
        shapes.push(shape);
      }
    }
    if (shapes.length) {
      // One merged geometry keeps thousands of genuine building footprints cheap.
      // Seven metres is a diagrammatic height only; no surveyed height is implied.
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 7, bevelEnabled: false, steps: 1, curveSegments: 1 });
      contextBuildingMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#bc9b84', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      contextBuildingMesh.position.z = 0.1;
      contextBuildingMesh.frustumCulled = false;
      contextBuildingMesh.visible = contextVisible && is3D;
      scene.add(contextBuildingMesh);
    }
  }

  function refreshMeshes() {
    if (contextBuildingMesh) contextBuildingMesh.visible = contextVisible && is3D;
    for (const [id, objects] of meshes) {
      const selected = id === selectedId;
      const visible = is3D && (!visibleIds || visibleIds.has(id));
      for (const object of objects) {
        object.visible = visible;
        // Schematic raised surfaces clarify parcel selection, not physical height.
        object.scale.z = selected ? 16 : 2;
        if (object.userData.slab) {
          object.material.color.set(selected ? '#f1c86b' : meshColour(object.userData.properties));
          object.material.opacity = selected ? 0.98 : 0.86;
        } else object.material.color.set(selected ? '#5b4622' : '#53654e');
      }
    }
    if (ready && !destroyed) map.triggerRepaint();
  }

  const customLayer = {
    id: IDS.three,
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: _map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },
    render(_gl, input) {
      if (!is3D || !renderer || (!meshes.size && !contextBuildingMesh)) return;
      // MapLibre 5+ supplies projection data; older releases supplied the matrix.
      const matrix = input?.defaultProjectionData?.mainMatrix || input?.modelViewProjectionMatrix || input;
      if (!matrix || matrix.length !== 16) return;
      const world = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(metre, metre, metre));
      camera.projectionMatrix.fromArray(matrix).multiply(world);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
    },
    onRemove() {
      disposeMeshes();
      if (contextBuildingMesh) {
        contextBuildingMesh.geometry.dispose();
        contextBuildingMesh.material.dispose();
      }
      renderer?.dispose();
      renderer = undefined;
    },
  };

  function updateFilters() {
    if (!ready) return;
    const filter = visibleIds ? ['in', ['get', 'id'], ['literal', [...visibleIds]]] : null;
    for (const layer of [IDS.fill, IDS.line, IDS.labels]) map.setFilter(layer, filter);
    map.setFilter(IDS.interest, ['all', ...(filter ? [filter] : []), ['!=', ['coalesce', ['get', 'interestStatus'], 'none'], 'none']]);
    map.setFilter(IDS.selected, ['all', ...(filter ? [filter] : []), ['==', ['get', 'id'], selectedId ?? '__none__']]);
    refreshMeshes();
  }

  function applyData() {
    if (!ready) return;
    map.getSource(SOURCE).setData(collection);
    rebuildMeshes();
    updateFilters();
    if (firstFit && collection.features.length) {
      firstFit = false;
      fit(undefined, { duration: 0 });
    }
  }

  function cameraPadding(withDetail = Boolean(selectedId)) {
    const width = map.getContainer().clientWidth;
    // Reserve space for the open property card so a fitted parcel remains in
    // the uncovered map. Smaller screens provide a closeable full-width card.
    const right = withDetail && width > 720 ? Math.min(400, Math.round(width * 0.5)) : 80;
    return { top: 85, right, bottom: 90, left: 80 };
  }

  function fit(ids, options = {}) {
    const idSet = ids ? new Set(ids.map(String)) : visibleIds;
    const features = idSet ? collection.features.filter((f) => idSet.has(String(f.properties.id))) : collection.features;
    const bounds = boundsOf(features);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: cameraPadding(), maxZoom: features.length === 1 ? 17 : 15.4, duration: 850, ...options });
  }

  map.on('load', () => {
    if (destroyed) return;
    for (const [key, data] of Object.entries(context)) map.addSource(`context-${key}`, { type: 'geojson', data: data || EMPTY, tolerance: key === 'parcels' ? 0.2 : 0.05 });
    map.addLayer({ id: 'context-parcels-fill', type: 'fill', source: 'context-parcels', paint: {
      'fill-color': ['match', ['get', 'landType'], 'Forest', '#426d55', 'WaterArea', '#79b5cc', 'ArableGround', '#d5c995', 'Grassland', '#a8bb8e', 'Garden', '#acbe80', 'BuiltUpArea', '#c8a88c', '#dfdccf'],
      'fill-opacity': ['match', ['get', 'landType'], 'Forest', 0.2, 'WaterArea', 0.33, 0.08],
    } });
    map.addLayer({ id: 'context-zones-line', type: 'line', source: 'context-zones', paint: { 'line-color': '#77877a', 'line-width': 1.6, 'line-dasharray': [4, 4], 'line-opacity': 0.65 } });
    map.addLayer({ id: 'context-buildings-fill', type: 'fill', source: 'context-buildings', minzoom: 13.5, paint: { 'fill-color': '#ac927e', 'fill-opacity': 0.6, 'fill-outline-color': '#8f7968' } });
    map.addSource(SOURCE, { type: 'geojson', data: collection, promoteId: 'id', tolerance: 0 });
    map.addLayer({ id: IDS.fill, type: 'fill', source: SOURCE, paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#eac16d', colourExpression(colourMode)],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.78, ['boolean', ['feature-state', 'hover'], false], 0.7, 0.49],
    } });
    map.addLayer({ id: IDS.line, type: 'line', source: SOURCE, paint: {
      'line-color': ['match', ['get', 'kind'], 'forest', '#365d4e', 'water', '#367c99', 'building', '#925d49', '#677354'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 1.8, 19, 2.4], 'line-opacity': 0.9,
    } });
    map.addLayer({ id: IDS.interest, type: 'line', source: SOURCE, paint: {
      'line-color': colourExpression('interest'), 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.2, 16, 3.4], 'line-opacity': 0.98,
    } });
    map.addLayer(customLayer);
    map.addLayer({ id: IDS.selected, type: 'line', source: SOURCE, filter: ['==', ['get', 'id'], '__none__'], paint: { 'line-color': '#c27d27', 'line-width': 4, 'line-opacity': 1 } });
    map.addLayer({ id: IDS.labels, type: 'symbol', source: SOURCE, minzoom: 13.1, layout: {
      'text-field': ['coalesce', ['get', 'number'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 12], 'text-padding': 6,
    }, paint: { 'text-color': '#283d32', 'text-halo-color': '#faf8ef', 'text-halo-width': 1.6, 'text-halo-blur': 0.5 } });
    map.addSource('parcel-relations', { type: 'geojson', data: relations, promoteId: 'id', tolerance: 0 });
    map.addLayer({ id: 'relation-fill', type: 'fill', source: 'parcel-relations', paint: { 'fill-color': '#438fbc', 'fill-opacity': 0.16 } });
    map.addLayer({ id: 'relation-line', type: 'line', source: 'parcel-relations', paint: { 'line-color': '#337ea8', 'line-width': 2.8, 'line-dasharray': [3, 2], 'line-opacity': 1 } });
    map.addLayer({ id: 'relation-label', type: 'symbol', source: 'parcel-relations', minzoom: 13.3, layout: {
      'text-field': ['concat', ['get', 'number'], ' · pacht'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-padding': 8,
    }, paint: { 'text-color': '#28658c', 'text-halo-color': '#f7fbfc', 'text-halo-width': 1.7 } });
    map.addLayer({ id: 'context-zone-labels', type: 'symbol', source: 'context-zones', minzoom: 9, maxzoom: 13.2, layout: {
      'text-field': ['coalesce', ['get', 'ku'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-letter-spacing': 0.06, 'text-transform': 'uppercase', 'text-padding': 20,
    }, paint: { 'text-color': '#526454', 'text-halo-color': '#f7f5ed', 'text-halo-width': 2 } });
    ready = true;
    applyData();
    setContextVisibility();
    setRelationsVisibility();
    onReady();
  });

  map.on('click', (event) => {
    if (!ready) return;
    if (relationsVisible) {
      const relation = map.queryRenderedFeatures(event.point, { layers: ['relation-fill'] })[0];
      if (relation) {
        const id = String(relation.properties.id);
        onRelationSelect(id, relations.features.find((f) => String(f.properties.id) === id));
        return;
      }
    }
    const hits = map.queryRenderedFeatures(event.point, { layers: [IDS.fill] });
    const hit = hits[0];
    if (hit) {
      const id = String(hit.properties.id);
      select(id);
      onSelect(id, collection.features.find((f) => String(f.properties.id) === id));
    }
  });
  map.on('mousemove', (event) => {
    if (!ready) return;
    const hit = map.queryRenderedFeatures(event.point, { layers: [IDS.fill] })[0];
    const relationHit = relationsVisible && map.queryRenderedFeatures(event.point, { layers: ['relation-fill'] })[0];
    const id = hit ? String(hit.properties.id) : null;
    map.getCanvas().style.cursor = hit || relationHit ? 'pointer' : '';
    if (hoveredId === id) return;
    if (hoveredId !== null) map.setFeatureState({ source: SOURCE, id: hoveredId }, { hover: false });
    hoveredId = id;
    if (id !== null) map.setFeatureState({ source: SOURCE, id }, { hover: true });
  });
  map.on('error', (event) => onError(event.error));

  function select(id) {
    if (ready && selectedId !== null) map.setFeatureState({ source: SOURCE, id: selectedId }, { selected: false });
    selectedId = id == null ? null : String(id);
    if (ready && selectedId !== null) map.setFeatureState({ source: SOURCE, id: selectedId }, { selected: true });
    updateFilters();
  }

  function setContextVisibility() {
    if (ready) for (const layer of ['context-parcels-fill', 'context-zones-line', 'context-buildings-fill', 'context-zone-labels']) {
      map.setLayoutProperty(layer, 'visibility', contextVisible ? 'visible' : 'none');
    }
    refreshMeshes();
  }

  function setRelationsVisibility() {
    if (ready) for (const layer of ['relation-fill', 'relation-line', 'relation-label']) map.setLayoutProperty(layer, 'visibility', relationsVisible ? 'visible' : 'none');
  }

  const observer = new ResizeObserver(() => { if (!destroyed) map.resize(); });
  observer.observe(typeof container === 'string' ? document.getElementById(container) : container);

  return {
    setRelations(data) {
      relations = { type: 'FeatureCollection', features: (data?.features || []).filter(f => f.geometry && f.properties?.id != null).map(f => ({ ...f, id: String(f.properties.id), properties: { ...f.properties, id: String(f.properties.id) } })) };
      if (ready) map.getSource('parcel-relations').setData(relations);
    },
    setRelationsVisible(value) { relationsVisible = Boolean(value); setRelationsVisibility(); },
    fitRelations(ids) {
      const set = ids ? new Set(ids.map(String)) : null;
      const bounds = boundsOf(set ? relations.features.filter(f => set.has(String(f.properties.id))) : relations.features);
      if (bounds) map.fitBounds(bounds, { padding: cameraPadding(true), maxZoom: 16.5, duration: 850 });
    },
    setContext(data = {}) {
      context = { ...context, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value?.type === 'FeatureCollection')) };
      if (ready) {
        for (const [key, data] of Object.entries(context)) map.getSource(`context-${key}`)?.setData(data || EMPTY);
        rebuildContextMeshes();
        map.triggerRepaint();
      }
    },
    setContextVisible(value) { contextVisible = Boolean(value); setContextVisibility(); },
    setData(data) {
      collection = { type: 'FeatureCollection', features: (data?.features || []).filter((f) => f.geometry && f.properties?.id != null).map((f) => ({ ...f, id: String(f.properties.id), properties: { ...f.properties, id: String(f.properties.id) } })) };
      applyData();
    },
    setFilter(ids) { visibleIds = ids == null ? null : new Set(ids.map(String)); updateFilters(); },
    select,
    fit,
    setBasemap(mode) {
      basemap = mode === 'satellite' || mode === 'ortho' || mode === 'orthophoto' ? 'ortho' : 'map';
      if (!ready) { map.once('load', () => this.setBasemap(mode)); return; }
      map.setLayoutProperty('basemap-osm', 'visibility', basemap === 'map' ? 'visible' : 'none');
      map.setLayoutProperty('basemap-ortho', 'visibility', basemap === 'ortho' ? 'visible' : 'none');
    },
    set3D(value) {
      is3D = Boolean(value);
      map.easeTo({ pitch: is3D ? 52 : 0, bearing: is3D ? -15 : 0, duration: 850 });
      refreshMeshes();
    },
    setColorMode(mode) {
      colourMode = mode === 'interest' ? 'interest' : 'land';
      if (ready) map.setPaintProperty(IDS.fill, 'fill-color', ['case', ['boolean', ['feature-state', 'selected'], false], '#eac16d', colourExpression(colourMode)]);
      refreshMeshes();
    },
    zoomIn() { map.zoomIn({ duration: 250 }); },
    zoomOut() { map.zoomOut({ duration: 250 }); },
    resetNorth() { map.easeTo({ bearing: 0, duration: 400 }); },
    resize() { map.resize(); },
    getMap() { return map; },
    destroy() { destroyed = true; observer.disconnect(); map.remove(); },
  };
}
