import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as THREE from 'three';
maplibregl.setWorkerUrl(workerUrl);

/** Land colours are shared with the dashboard legend. Heights in the Three.js
 * layer are schematic selection slabs, never surveyed terrain/building heights. */
export const LAND_COLORS = {
  arable: '#86a5c0', grass: '#b5c6d6', forest: '#426583', water: '#416b82',
  building: '#d7e3ec', garden: '#9eb5c9', other: '#6b8399',
};
export const INTEREST_COLORS = {
  confirmed: '#ef945b', considering: '#9cb4c8', conditional: '#b49baf', lease: '#71bacd',
  multiple: '#c4a3d2', none: '#607788',
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
    canvasContextAttributes: { antialias: true, alpha: true },
    style: {
      version: 8,
      // Without a glyphs URL, MapLibre renders labels from the local Roboto font.
      sources: {
        osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
        ortho: { type: 'raster', tiles: [ORTHO], tileSize: 256, maxzoom: 20, attribution: 'Ortofoto © <a href="https://geoportal.cuzk.gov.cz/" target="_blank" rel="noopener">ČÚZK</a>' },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#10171d', 'background-opacity': 0.22 } },
        { id: 'basemap-osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-saturation': -1, 'raster-brightness-max': 0.36, 'raster-opacity': 0, 'raster-fade-duration': 180 } },
        { id: 'basemap-ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.38, 'raster-brightness-max': 0.72, 'raster-fade-duration': 180 } },
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
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 12), new THREE.LineBasicMaterial({ color: '#d7e7f3', transparent: true, opacity: 0.78, depthTest: true }));
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
      contextBuildingMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#b4c6d4', transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
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
          object.material.color.set(selected ? '#f0925b' : meshColour(object.userData.properties));
          object.material.opacity = selected ? 0.98 : 0.86;
        } else object.material.color.set(selected ? '#ffc99b' : '#d3e4f1');
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
    if (width <= 700) return { top: 365, right: 20, bottom: 130, left: 20 };
    // Reserve space for the open property card so a fitted parcel remains in
    // the uncovered map. Smaller screens provide a closeable full-width card.
    const right = withDetail && width > 720 ? Math.min(400, Math.round(width * 0.38)) : width > 720 ? 70 : 30;
    const left = width > 1000 ? 280 : width > 720 ? 245 : 30;
    return { top: width > 720 ? 110 : 75, right, bottom: 90, left };
  }

  function fit(ids, options = {}) {
    const idSet = ids ? new Set(ids.map(String)) : visibleIds;
    const features = idSet ? collection.features.filter((f) => idSet.has(String(f.properties.id))) : collection.features;
    const wholePortfolio = collection.features.length > 0 && (!idSet || collection.features.every((f) => idSet.has(String(f.properties.id))));
    const bounds = boundsOf(wholePortfolio && context.zones?.features?.length ? context.zones.features : features);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: cameraPadding(), maxZoom: features.length === 1 ? 17 : 15.4, duration: 850, ...options });
  }

  map.on('load', () => {
    if (destroyed) return;
    for (const [key, data] of Object.entries(context)) map.addSource(`context-${key}`, { type: 'geojson', data: data || EMPTY, tolerance: key === 'parcels' ? 0.2 : 0.05 });
    map.addLayer({ id: 'context-parcels-fill', type: 'fill', source: 'context-parcels', paint: {
      'fill-color': ['match', ['get', 'landType'], 'Forest', '#34536a', 'WaterArea', '#2c586e', 'ArableGround', '#63849d', 'Grassland', '#829aac', 'Garden', '#748ea4', 'BuiltUpArea', '#c0cfdb', '#566b7b'],
      'fill-opacity': ['match', ['get', 'landType'], 'Forest', 0.34, 'WaterArea', 0.5, 'BuiltUpArea', 0.28, 0.2],
    } });
    map.addLayer({ id: 'context-parcels-line', type: 'line', source: 'context-parcels', minzoom: 9, paint: { 'line-color': '#a5bfd0', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.25, 15, 0.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 14, 0.22] } });
    map.addLayer({ id: 'context-zones-line', type: 'line', source: 'context-zones', paint: { 'line-color': '#9fb7c9', 'line-width': 0.9, 'line-dasharray': [7, 5], 'line-opacity': 0.5 } });
    map.addLayer({ id: 'context-buildings-fill', type: 'fill', source: 'context-buildings', minzoom: 13.5, paint: { 'fill-color': '#bacddc', 'fill-opacity': 0.65, 'fill-outline-color': '#d5e2ec' } });
    map.addLayer({ id: 'context-place-labels', type: 'symbol', source: 'context-places', minzoom: 13, filter: ['==', ['get', 'type'], 'MunicipalityName'], layout: {
      'text-field': ['coalesce', ['get', 'name'], ''], 'text-font': ['Roboto'], 'text-size': ['match', ['get', 'type'], 'MunicipalityName', 12, 10], 'text-padding': 20,
    }, paint: { 'text-color': '#d9e5ed', 'text-halo-color': '#10171d', 'text-halo-width': 1.5, 'text-opacity': 0.95 } });
    map.addSource(SOURCE, { type: 'geojson', data: collection, promoteId: 'id', tolerance: 0 });
    map.addLayer({ id: IDS.fill, type: 'fill', source: SOURCE, paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ef945b', colourExpression(colourMode)],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.86, ['boolean', ['feature-state', 'hover'], false], 0.96, 0.83],
    } });
    map.addLayer({ id: IDS.line, type: 'line', source: SOURCE, paint: {
      'line-color': '#e2edf5',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 15, 1.1, 19, 1.6], 'line-opacity': 0.85,
    } });
    map.addLayer({ id: IDS.interest, type: 'line', source: SOURCE, paint: {
      'line-color': colourExpression('interest'), 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 16, 2.3], 'line-opacity': 0.98,
    } });
    map.addLayer(customLayer);
    map.addLayer({ id: IDS.selected, type: 'line', source: SOURCE, filter: ['==', ['get', 'id'], '__none__'], paint: { 'line-color': '#ffc49b', 'line-width': 3, 'line-opacity': 1 } });
    map.addLayer({ id: IDS.labels, type: 'symbol', source: SOURCE, minzoom: 13.1, layout: {
      'text-field': ['coalesce', ['get', 'number'], ''], 'text-font': ['Roboto'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 12], 'text-padding': 6,
    }, paint: { 'text-color': '#f2f6f9', 'text-halo-color': '#152b3c', 'text-halo-width': 1.5, 'text-halo-blur': 0.3 } });
    map.addSource('parcel-relations', { type: 'geojson', data: relations, promoteId: 'id', tolerance: 0 });
    map.addLayer({ id: 'relation-fill', type: 'fill', source: 'parcel-relations', paint: { 'fill-color': '#71bacd', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'relation-line', type: 'line', source: 'parcel-relations', paint: { 'line-color': '#8bcfe0', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 1 } });
    map.addLayer({ id: 'relation-label', type: 'symbol', source: 'parcel-relations', minzoom: 13.3, layout: {
      'text-field': ['concat', ['get', 'number'], ' · pacht'], 'text-font': ['Roboto'], 'text-size': 11, 'text-padding': 8,
    }, paint: { 'text-color': '#c2eaf2', 'text-halo-color': '#15232c', 'text-halo-width': 1.7 } });
    map.addLayer({ id: 'context-zone-labels', type: 'symbol', source: 'context-zones', minzoom: 9, maxzoom: 13.2, layout: {
      'text-field': ['coalesce', ['get', 'ku'], ''], 'text-font': ['Roboto'], 'text-size': 12, 'text-letter-spacing': 0.06, 'text-transform': 'uppercase', 'text-padding': 20,
    }, paint: { 'text-color': '#cad8e2', 'text-halo-color': '#111a21', 'text-halo-width': 1.8, 'text-opacity': 0.86 } });
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
    if (ready) for (const layer of ['context-parcels-fill', 'context-parcels-line', 'context-zones-line', 'context-buildings-fill', 'context-zone-labels', 'context-place-labels']) {
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
      const firstZones = Boolean(data.zones?.features?.length && !context.zones?.features?.length);
      context = { ...context, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value?.type === 'FeatureCollection')) };
      if (ready) {
        for (const [key, data] of Object.entries(context)) map.getSource(`context-${key}`)?.setData(data || EMPTY);
        rebuildContextMeshes();
        const wholePortfolio = collection.features.length > 0 && (!visibleIds || collection.features.every((f) => visibleIds.has(String(f.properties.id))));
        if (firstZones && !selectedId && wholePortfolio) fit(undefined, { duration: 0 });
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
      map.setLayoutProperty('basemap-osm', 'visibility', 'none');
      map.setLayoutProperty('basemap-ortho', 'visibility', basemap === 'ortho' ? 'visible' : 'none');
    },
    set3D(value) {
      is3D = Boolean(value);
      map.easeTo({ pitch: is3D ? 52 : 0, bearing: is3D ? -15 : 0, duration: 850 });
      refreshMeshes();
    },
    setColorMode(mode) {
      colourMode = mode === 'interest' ? 'interest' : 'land';
      if (ready) map.setPaintProperty(IDS.fill, 'fill-color', ['case', ['boolean', ['feature-state', 'selected'], false], '#ef945b', colourExpression(colourMode)]);
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
