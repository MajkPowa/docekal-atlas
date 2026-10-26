import { createIcons, Images, ArrowUpRight, Bookmark, Box, ChartNoAxesCombined, ChevronRight, CircleHelp, Compass, Download, Expand, ExternalLink, FileText, Files, FolderOpen, GitCompareArrows, Handshake, House, Info, Landmark, Layers2, Layers3, ListFilter, LockKeyhole, Mail, Map as MapIcon, MapPin, MapPinCheck, MapPinOff, MapPinned, Minus, MousePointer2, Plus, Route, Scan, Search, SquareDashed, UsersRound, X } from 'lucide';
const icons = {Images, ArrowUpRight, Bookmark, Box, ChartNoAxesCombined, ChevronRight, CircleHelp, Compass, Download, Expand, ExternalLink, FileText, Files, FolderOpen, GitCompareArrows, Handshake, House, Info, Landmark, Layers2, Layers3, ListFilter, LockKeyhole, Mail, Map:MapIcon, MapPin, MapPinCheck, MapPinOff, MapPinned, Minus, MousePointer2, Plus, Route, Scan, Search, SquareDashed, UsersRound, X};
import { createParcelMap, LAND_COLORS, INTEREST_COLORS } from './map.js';
import { buyers, getInterests, statusLabels, interestRecords, normalizeArea } from './interests.js';
import { createAssetLibrary } from './assets.js';
import { assetUrl } from './paths.js';
import { createQuickSearch } from './quick-search.js';
import { matchesPropertyQuery } from './parcel-search.js';
import { createBulkInterest } from './bulk-interest.js';
import { customInterestsFor, addInterestBatch, removeCustomInterest, customBuyerKey } from './interest-store.js';
import './roboto.css';
import './style.css';
import './buildings.css';
import './reference.css';
import './typography.css';
import './quick-search.css';
import './bulk-interest.css';
import './workflows.css';

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const icon=(n)=>`<i data-lucide="${n}"></i>`;
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,d=0)=>new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n??0);
const ha=(n)=>num(n/10000,2);
const money=(n)=>n==null?'Neuvedeno samostatně':`${num(n)} Kč`;
const landNames={arable:'Orná půda',grass:'Louky a pastviny',forest:'Lesní pozemky',water:'Vodní plochy',building:'Zastavěné plochy',garden:'Zahrady',other:'Ostatní plochy'};
const landIcons={arable:'wheat',grass:'sprout',forest:'trees',water:'waves',building:'house',garden:'flower-2',other:'shapes'};
const categoryKind={meadow:'grass',grassland:'grass',pasture:'grass',arable:'arable',forest:'forest',water:'water',building:'building',built:'building',garden:'garden',other:'other'};
const state={area:'all',query:'',status:'all',buyer:'all',kind:'all',bookmarked:false,selected:null,view:'atlas',color:'land',mode3d:false,basemap:'map',context:true,sort:'default',scopeIds:null};
let inventory,properties=[],features=[],relations=[],geometryStatus,parcelMap,assets,quickSearch,bulkInterests,lastInterestBatch;
const bulkSelection=new Set();
let local={notes:{},bookmarks:[],interests:{}};
try {local={...local,...JSON.parse(localStorage.getItem('docekal-atlas-v1')||'{}')}}catch{}
if(!local.interests||typeof local.interests!=='object'||Array.isArray(local.interests))local.interests={};
if(!local.notes||typeof local.notes!=='object')local.notes={};
if(!Array.isArray(local.bookmarks))local.bookmarks=[];
function persist(){try{localStorage.setItem('docekal-atlas-v1',JSON.stringify(local));return true}catch{toast('Prohlížeč nepovolil ukládání. Exportujte si výběr.');return false}}
function kindOf(p){const t=p.landType?.toLowerCase()||'';if(t.includes('zastav'))return'building';if(t.includes('orná'))return'arable';if(t.includes('les'))return'forest';if(t.includes('vod'))return'water';if(t.includes('trav'))return'grass';if(t.includes('zahr'))return'garden';if(t.includes('ostatní'))return'other';return categoryKind[p.category]||'other'}
function interestsOf(p){return [...getInterests(p),...customInterestsFor(local.interests[p.id])];}
function partyKey(i){return customBuyerKey(buyers[i.buyer]?.name||i.name||'');}
function partyCount(p){return new Set(p.interests.map(partyKey)).size;}
function statusOf(p){const a=interestsOf(p);if(new Set(a.map(partyKey)).size>1)return'multiple';return a[0]?.status||'none'}
function refreshDerived(){properties.forEach(p=>{p.kind=kindOf(p);p.interests=interestsOf(p);p.interestStatus=statusOf(p);p.interested=!!p.interests.length});features.forEach(f=>{const p=properties.find(x=>x.id===f.properties.id);if(p)Object.assign(f.properties,{kind:p.kind,number:p.parcelNumber,cadastre:p.cadastralArea,interested:p.interested,interestStatus:p.interestStatus})})}
function iconsNow(){createIcons({icons,attrs:{'aria-hidden':'true'}})}
function toast(message){$('.toast')?.remove();const div=document.createElement('div');div.className='toast';div.setAttribute('role','status');div.textContent=message;document.body.append(div);setTimeout(()=>div.remove(),3500)}
const publicHosting=import.meta.env.VITE_PUBLIC_HOSTING==='true';
const loader=`<div class="loader"><div class="loader-box"><div class="brand">${icon('layers-3')}</div><strong>Dočekal <span style="color:#95a088;font-weight:400">/ Atlas majetku</span></strong><p>Propojuji parcely a jejich souvislosti…</p></div></div>`;
$('#app').innerHTML=loader;iconsNow();

async function init(){
  const [source,portfolio,gs]=await Promise.all([fetch(assetUrl('/data/properties.json')).then(r=>{if(!r.ok)throw Error('Soupis majetku není dostupný');return r.json()}),fetch(assetUrl('/data/portfolio.geojson')).then(r=>r.json()),fetch(assetUrl('/data/geometry-status.json')).then(r=>r.json())]);
  inventory=source;properties=source.properties;features=portfolio.features;geometryStatus=gs;
  const [photoCatalog,parcelMedia,buildingDetails]=await Promise.all(['photo-catalog.json','parcel-media.json','building-details.json'].map(file=>fetch(assetUrl('/data/'+file)).then(r=>{if(!r.ok)throw Error('Obrazová dokumentace není dostupná: '+file);return r.json()})));
  refreshDerived();renderShell();
  assets=createAssetLibrary({inventory,properties,features,photoCatalog,parcelMedia,buildingDetails,buyers,statusLabels,onMap:({propertyIds,primaryId})=>{navigate('atlas');resetFilters();selectProperty(primaryId);parcelMap.fit(propertyIds);}});
  parcelMap=createParcelMap('map',{onSelect:id=>selectProperty(id),onRelationSelect:(id,f)=>selectRelation(f),onReady:()=>{$('#map-state').textContent='Přesné hranice ČÚZK';},onError:e=>{console.warn('Map source',e);$('#map-state').textContent='Některé mapové podklady se nenačetly';}});
  parcelMap.setData({type:'FeatureCollection',features});
  setupWorkflows();applyFilters(false);bindEvents();renderBuildings();fetch(assetUrl('/data/relations.geojson')).then(r=>r.json()).then(fc=>{relations=fc.features;parcelMap.setRelations(fc)}).catch(console.warn);
  Promise.all(['cadastre.geojson','buildings.geojson','zones.geojson','place-names.geojson'].map(f=>fetch(assetUrl(`/data/${f}`)).then(r=>r.json()))).then(([parcels,buildings,zones,places])=>parcelMap.setContext({parcels,buildings,zones,places})).catch(()=>{$('#map-state').textContent='Okolní vrstvy se nepodařilo načíst';});
  window.atlas={state,properties,inventory,geometryStatus,map:parcelMap,getFiltered:filtered};
}
function renderShell(){
  const nInterest=properties.filter(p=>p.interested).length;
  const mapped=new Set(features.map(f=>f.properties.id));
  const unmapped=properties.filter(p=>!mapped.has(p.id)).length;
  const weighted=properties.reduce((s,p)=>{let[a,b]=p.ownershipShare.split('/').map(Number);return s+p.areaM2*a/b},0);
  $('#app').innerHTML=`<div class="shell">
    <aside class="rail" aria-label="Hlavní navigace"><div class="brand" title="Atlas majetku">${icon('layers-3')}</div><nav class="rail-nav"><button class="rail-btn active" data-view="atlas">${icon('map')}<span>Atlas</span></button><button class="rail-btn" data-view="photos">${icon('images')}<span>Fotografie</span></button><button class="rail-btn" data-view="buyers">${icon('users-round')}<span>Zájemci</span></button><button class="rail-btn" data-view="overview">${icon('chart-no-axes-combined')}<span>Přehled</span></button></nav><div class="rail-bottom"><button title="Zdroje a přesnost dat" data-action="sources">${icon('circle-help')}</button><div class="avatar" title="${publicHosting?'Atlas majetku':'Soukromý atlas'}">PD</div></div></aside>
    <div class="workspace"><header class="topbar"><div class="breadcrumb">${icon('folder-open')}<span>Majetkové soubory</span>${icon('chevron-right')}<strong>Pavel Dočekal</strong></div><div class="top-right"><span class="source-date"><i></i> Katastr načten 26. 10. 2026</span><button class="btn" data-action="sources">${icon('files')} Zdroje dat</button><button class="btn primary" data-action="export">${icon('download')} Exportovat</button></div></header>
    <main class="main"><div class="page-heading"><div><div class="eyebrow">KSCB 46 INS 12953/2024</div><h1>Majetek Dočekal<span> / Atlas</span></h1><p class="subtitle">Každá parcela. Každý zájem. Všechny souvislosti na jednom místě.</p></div><div class="heading-badge">${icon(publicHosting?'landmark':'lock-keyhole')} ${publicHosting?'Přehled majetku':'Soukromý přehled majetku'}</div></div>
    <section class="metrics" aria-label="Souhrn majetku"><article class="metric"><div class="metric-label">${icon('scan')} Celková výměra parcel</div><div class="metric-value">${ha(inventory.summary.areaM2)}<small>ha</small></div><div class="metric-note">${num(properties.length)} parcel · po podílech ${ha(weighted)} ha</div><div class="metric-icon">${icon('square-dashed')}</div></article><article class="metric"><div class="metric-label">${icon('landmark')} Ocenění souboru</div><div class="metric-value">${num(inventory.summary.marketValueCzk/1e6,2)}<small>mil. Kč</small></div><div class="metric-note">Dle závěru posudku · 17. 10. 2025</div></article><article class="metric metric-accent"><div class="metric-label">${icon('users-round')} Parcely se zájmem</div><div class="metric-value" id="metric-interest">${nInterest}<small>/ ${properties.length}</small></div><div class="metric-note">4 zájemci · zájem, zvažování a podmíněný zájem</div><div class="metric-icon">${icon('handshake')}</div></article><article class="metric"><div class="metric-label">${icon('map-pinned')} Katastrální území</div><div class="metric-value">5<small>lokalit</small></div><div class="metric-note">${features.length} parcel v mapě · ${unmapped} k ověření</div><div class="metric-icon">${icon('route')}</div></article></section>
    <section id="atlas-view"><section class="map-section"><div class="section-top"><div class="section-title">${icon('map')}<h2>Mapa majetku</h2><span class="count-pill" id="visible-count">${properties.length} parcel</span></div><div class="section-actions"><div class="segmented" aria-label="Barevné vrstvy"><button data-color="land" class="active">${icon('layers-2')} Druh pozemku</button><button data-color="interest">${icon('users-round')} Zájemci</button></div><button class="btn small" data-action="fit" aria-label="Zobrazit celek">${icon('expand')}<span>Zobrazit celek</span></button></div></div>
    <div class="map-body"><aside class="explorer"><div class="search">${icon('search')}<input id="search" type="search" placeholder="Parcela, lokalita nebo LV…" aria-label="Hledat parcelu, lokalitu nebo LV" autocomplete="off"></div><div id="search-results" class="result-search hidden"></div><div class="explorer-title">Lokality <button data-action="reset">Zrušit filtry</button></div><div class="area-list" id="area-list">${renderAreas()}</div><div class="filter-group"><div class="explorer-title">Zájem o parcely</div><div class="filter-chips"><button class="chip amber" data-status="interested">${icon('handshake')} Se zájmem</button><button class="chip" data-status="multiple">${icon('git-compare-arrows')} Překryvy</button><button class="chip" data-status="unmapped">${icon('map-pin-off')} K ověření</button><button class="chip" data-action="bookmarks">${icon('bookmark')} Můj výběr</button></div></div><div class="filter-group"><div class="explorer-title">Podrobné filtry</div><select class="select-field" id="buyer-filter" aria-label="Filtr zájemce"><option value="all">Všichni zájemci</option>${Object.entries(buyers).map(([id,b])=>`<option value="${id}">${esc(b.name)}</option>`).join('')}</select><select class="select-field" id="land-filter" aria-label="Druh pozemku" style="margin-top:7px"><option value="all">Všechny druhy pozemků</option><option value="forest-use">Les a remízky dle posudku</option>${Object.entries(landNames).map(([id,n])=>`<option value="${id}">${n}</option>`).join('')}</select><label class="context-toggle">Okolní krajina a stavby <input type="checkbox" id="context-toggle" checked></label></div><div class="explorer-bottom">${icon('mouse-pointer-2')}<span>Kliknutím na parcelu otevřete detail.<br>Tažením otáčejte mapu v režimu 3D.</span></div></aside>
    <div class="map-wrap"><div id="map" class="map-canvas" role="region" aria-label="Interaktivní mapa přesných katastrálních parcel"></div><div class="map-tools"><div class="segmented"><button data-basemap="map" class="active">Mapa</button><button data-basemap="satellite">Ortofoto</button></div><div class="segmented"><button data-mode="2d" class="active">2D</button><button data-mode="3d">${icon('box')} 3D</button></div></div><div class="map-compass"><button class="map-control" data-action="north" title="Sever nahoru">${icon('compass')}</button><div class="zoom-controls"><button class="map-control" data-action="zoom-in" title="Přiblížit">${icon('plus')}</button><button class="map-control" data-action="zoom-out" title="Oddálit">${icon('minus')}</button></div></div><div class="map-caption"><strong id="legend-title">DRUHY POZEMKŮ</strong><div class="legend" id="legend">${renderLegend()}</div></div><div class="map-status" id="map-state">Načítám mapu…</div><aside id="detail" class="detail hidden" aria-label="Detail parcely"></aside></div></div><div class="map-info"><span><i class="dot-online"></i><span id="map-summary"></span></span><span>${icon('info')} Přesné půdorysy · výšky v 3D jsou schematické <button data-action="sources" style="text-decoration:underline;font-size:inherit">O datech</button></span></div></section>
    <section class="building-section" id="building-section"></section><section class="table-section"><div class="section-top"><div class="section-title">${icon('list-filter')}<h2>Přehled parcel</h2><span class="count-pill" id="table-count"></span></div><div class="section-actions"><select class="select-field" id="sort" aria-label="Seřadit parcely"><option value="default">Podle lokality</option><option value="area">Od největší výměry</option><option value="interest">Se zájmem první</option><option value="value">Od nejvyššího ocenění</option></select><button class="btn small" data-action="export" title="Exportovat filtrované parcely">${icon('download')}</button></div></div><div class="table-wrap"><table><thead><tr><th class="bulk-check-cell"><input type="checkbox" id="bulk-all" aria-label="Vybrat všechny filtrované parcely"></th><th>Parcela</th><th>Katastrální území</th><th>Druh pozemku</th><th>Výměra / podíl</th><th>LV</th><th>Zájem</th><th>Cena celé parcely</th><th>Mapa</th></tr></thead><tbody id="parcel-rows"></tbody></table></div><div class="table-bottom"><span id="table-total"></span><span>Výběr a poznámky se ukládají v tomto prohlížeči</span></div></section></section>
    <section id="photos-view" class="hidden"></section><section id="buyers-view" class="hidden"></section><section id="overview-view" class="hidden"></section><footer class="main-footer"><span>DOČEKAL / ATLAS MAJETKU <span style="margin:0 10px">·</span> Posudek 081650/2025 + ČÚZK + e-mailové poptávky</span><span>Průběžný přehled <span style="margin:0 8px">·</span><a href="#" data-action="sources">Původ a přesnost dat</a></span></footer></main></div></div><dialog id="modal"><div class="modal-head"><h2 id="modal-title"></h2><button data-action="close-modal" aria-label="Zavřít">${icon('x')}</button></div><div class="modal-body" id="modal-body"></div></dialog>`;
  composeReferenceLayout();iconsNow();
}

function composeReferenceLayout(){
  const rail=$('.rail');
  const wordmark=document.createElement('div');wordmark.className='brand-wordmark';wordmark.innerHTML='<strong>DOČEKAL</strong><span>MAJETKOVÝ ATLAS</span>';rail.insertBefore(wordmark,$('.rail-nav'));
  rail.append($('.top-right'));$('.topbar').remove();
  const stage=$('.map-section');const summary=document.createElement('div');summary.className='atlas-summary';summary.innerHTML='<div class="summary-intro"><i></i>Přehled souboru / 01</div>';summary.append($('.metrics'));stage.append(summary);
  const filters=document.createElement('button');filters.className='btn small atlas-filter-button';filters.dataset.action='filters';filters.setAttribute('aria-expanded','false');filters.setAttribute('aria-controls','atlas-filters');filters.innerHTML=icon('list-filter')+'<span>Filtry a lokality</span>';$('.map-section .section-actions').prepend(filters);$('.explorer').id='atlas-filters';
  const cross=document.createElement('div');cross.className='reference-crosshair';cross.setAttribute('aria-hidden','true');$('.map-wrap').append(cross);
}

function renderAreas(){const names=['all',...inventory.cadastralAreas.map(a=>a.name).sort((a,b)=>a.localeCompare(b,'cs'))];return names.map(name=>{const ps=name==='all'?properties:properties.filter(p=>p.cadastralArea===name);return`<button class="area-btn ${state.area===name?'active':''}" data-area="${esc(name)}"><span class="area-icon">${icon(name==='all'?'map':'map-pin')}</span><span class="area-text"><span class="area-name">${name==='all'?'Všechny lokality':esc(name)}</span><span class="area-info">${ha(ps.reduce((s,p)=>s+p.areaM2,0))} ha ${name==='all'?'· celý soubor':''}</span></span><span class="area-count">${ps.length}</span></button>`}).join('')}
function renderLegend(){return state.color==='land'?Object.entries(landNames).map(([k,n])=>`<span><i class="dot" style="background:${LAND_COLORS[k]}"></i>${({arable:'Pole',grass:'Louky',forest:'Lesy',water:'Voda',building:'Zástavba',garden:'Zahrady',other:'Ostatní'})[k]}</span>`).join(''):[[INTEREST_COLORS.confirmed,'Projevený'],[INTEREST_COLORS.considering,'Zvažovaný'],[INTEREST_COLORS.conditional,'Podmíněný'],[INTEREST_COLORS.lease,'Pacht'],[INTEREST_COLORS.multiple,'Více zájemců'],[INTEREST_COLORS.none,'Bez zájmu']].map(([c,n])=>`<span><i class="dot" style="background:${c}"></i>${n}</span>`).join('')}
function filtered(){
  const mapped=new Set(features.map(f=>f.properties.id));
  const scoped=state.scopeIds?new Set(state.scopeIds):null;
  return properties.filter(p=>(!scoped||scoped.has(p.id))
    &&(state.area==='all'||p.cadastralArea===state.area)
    &&(state.kind==='all'||p.kind===state.kind||(state.kind==='forest-use'&&(p.kind==='forest'||p.category==='forest')))
    &&(state.buyer==='all'||p.interests.some(i=>i.buyer===state.buyer||partyKey(i)===state.buyer))
    &&(!state.bookmarked||local.bookmarks.includes(p.id))
    &&(state.status==='all'||(state.status==='interested'&&p.interested)||(state.status==='multiple'&&partyCount(p)>1)||(state.status==='unmapped'&&!mapped.has(p.id)))
    &&matchesPropertyQuery(p,state.query,p.interests.map(i=>buyers[i.buyer]?.name||i.name).join(' '))
  ).sort((a,b)=>state.sort==='area'?b.areaM2-a.areaM2:state.sort==='value'?(b.valuationCzk||0)-(a.valuationCzk||0):state.sort==='interest'?Number(b.interested)-Number(a.interested)||a.cadastralArea.localeCompare(b.cadastralArea,'cs'):a.cadastralArea.localeCompare(b.cadastralArea,'cs')||a.parcelNumber.localeCompare(b.parcelNumber,'cs',{numeric:true}));
}
function applyFilters(fit=false){
  const ps=filtered(),ids=ps.map(p=>p.id),mappedIds=new Set(features.map(f=>f.properties.id));
  const mapped=ps.filter(p=>mappedIds.has(p.id));
  parcelMap?.setFilter(ids);
  if(fit&&mapped.length)parcelMap.fit(ids);
  $('#visible-count').textContent=`${ps.length} parcel`;
  $('#table-count').textContent=ps.length;
  $('#map-summary').textContent=`${mapped.length} parcel v mapě · ${ps.length-mapped.length} k ověření · ${ha(ps.reduce((s,p)=>s+p.areaM2,0))} ha ve výběru`;
  $('#table-total').textContent=`${ps.length} parcel · ${num(ps.reduce((s,p)=>s+p.areaM2,0))} m²`;
  $('#parcel-rows').innerHTML=ps.length?ps.map(p=>`<tr data-parcel="${p.id}" class="${p.id===state.selected?'selected':''}" tabindex="0" aria-label="Parcela ${esc(p.parcelNumber)}, ${esc(p.cadastralArea)}">
    <td class="bulk-check-cell"><input type="checkbox" data-bulk-select="${esc(p.id)}" ${bulkSelection.has(p.id)?'checked':''} aria-label="Vybrat parcelu ${esc(p.parcelNumber)}, ${esc(p.cadastralArea)} pro nový zájem"></td>
    <td><strong>${local.bookmarks.includes(p.id)?'★ ':''}${esc(p.parcelNumber)}</strong></td><td>${esc(p.cadastralArea)}</td>
    <td><span class="land-cell"><i class="dot" style="background:${LAND_COLORS[p.kind]}"></i>${esc(p.landType)}</span></td>
    <td>${num(p.areaM2)} m² <span style="color:#b4c5ce">${p.ownershipShare!=='1/1'?' · '+esc(p.ownershipShare):''}</span></td><td>${p.lv}</td>
    <td><span class="status-tag ${p.interestStatus}">${partyCount(p)>1?icon('git-compare-arrows'):''}${statusLabels[p.interestStatus]||statusLabels.conditional}</span></td>
    <td>${p.valuationCzk?`${num(p.valuationCzk)} Kč`:'—'}</td>
    <td>${mappedIds.has(p.id)?'<span class="geometry-ok">● Ověřeno</span>':'<span class="geometry-missing">○ K ověření</span>'}</td></tr>`).join('')
    :'<tr><td colspan="9"><div class="empty-state">Žádné parcely neodpovídají filtrům.<br><button class="btn small" data-action="reset">Zrušit filtry</button></div></td></tr>';
  $$('[data-area]').forEach(b=>b.classList.toggle('active',b.dataset.area===state.area));
  $$('[data-status]').forEach(b=>b.classList.toggle('active',b.dataset.status===state.status));
  $('[data-action="bookmarks"]').classList.toggle('active',state.bookmarked);
  if(state.query){$('#search-results').classList.remove('hidden');$('#search-results').innerHTML=ps.slice(0,8).map(p=>`<button data-parcel="${p.id}"><strong>${esc(p.parcelNumber)}</strong><span>${esc(p.cadastralArea)}</span></button>`).join('')||'<div class="saved-note">Nic nenalezeno</div>'}
  else $('#search-results').classList.add('hidden');
  renderSelection();iconsNow();
}
function selectProperty(id){$('.map-section').classList.remove('filters-open');$('.atlas-filter-button').setAttribute('aria-expanded','false');const mapBox=$('#map').getBoundingClientRect();if(mapBox.top<0||mapBox.top>innerHeight*.7)$('#map').scrollIntoView({behavior:'smooth',block:'center'});const p=properties.find(p=>p.id===id);if(!p)return;state.selected=id;parcelMap.select(id);const f=features.find(f=>f.properties.id===id);if(f)parcelMap.fit([id]);else toast('Parcela je v posudku, její dnešní geometrii je potřeba ověřit.');renderDetail(p);$$('[data-parcel]').forEach(row=>row.classList.toggle('selected',row.dataset.parcel===id));}
function renderDetail(p){const f=features.find(f=>f.properties.id===p.id);const geo=f?.properties;const detail=$('#detail');detail.classList.remove('hidden');detail.innerHTML=`<div class="detail-head"><button class="detail-close" data-action="close-detail" aria-label="Zavřít detail">${icon('x')}</button><div class="detail-kicker">${esc(p.cadastralArea)} · LV ${p.lv}</div><h2>Parcela ${esc(p.parcelNumber)}</h2><span class="detail-sub">${f?'Hranice ověřeny v ČÚZK':'Číslo z posudku · geometrie k ověření'}</span></div><div class="detail-body"><div class="detail-kind"><i class="dot" style="background:${LAND_COLORS[p.kind]}"></i>${esc(p.landType)}</div><div class="facts"><div class="fact" style="grid-column:1/-1"><span>Vlastník dle posudku</span><strong>${esc(p.owner||'Neuveden')}</strong></div><div class="fact"><span>Výměra v posudku</span><strong>${num(p.areaM2)} m²</strong></div><div class="fact"><span>Vlastnický podíl</span><strong>${esc(p.ownershipShare)}</strong></div><div class="fact"><span>Cena celé parcely</span><strong>${p.valuationCzk?money(p.valuationCzk):'Viz souhrn posudku'}</strong></div><div class="fact"><span>Zdroj v posudku</span><strong><a href="${assetUrl('/posudek.pdf')}#page=${p.sourcePages[0]}" target="_blank" rel="noopener">Str. ${p.sourcePages.join(', ')} ↗</a></strong></div></div>${p.ownershipShare!=='1/1'?`<p class="price-note">Ideální spoluvlastnický podíl ${esc(p.ownershipShare)} nevymezuje konkrétní část polygonu.${p.valuationShareCzk!=null?` Cena odpovídající podílu: <strong>${money(p.valuationShareCzk)}</strong>.`:''}</p>`:''}${geo&&geo.verificationFlags?.includes('land_type_difference')?`<p class="detail-notes" style="color:#a78143">Druh v aktuálním KN: ${esc(({OtherArea:'ostatní plocha',ArableGround:'orná půda',Grassland:'trvalý travní porost',Forest:'lesní pozemek',WaterArea:'vodní plocha',BuiltUpArea:'zastavěná plocha a nádvoří',Garden:'zahrada'})[geo.currentKnLandType]||geo.currentKnLandType)}. V dashboardu je pro soupis zachován druh z posudku.</p>`:''}${geo&&geo.currentKnAreaM2!==p.areaM2?`<p class="detail-notes" style="color:#a78143">Pozor: aktuální KN uvádí ${num(geo.currentKnAreaM2)} m², posudek ${num(p.areaM2)} m². Rozdíl je potřeba ověřit.</p>`:''}${!f?'<p class="detail-notes" style="color:#a78143">Ve veřejných aktuálních datech ČÚZK se parcelní číslo nepodařilo dohledat. Parcela zůstává v soupisu; náhradní polygon není odhadován. Viz přehled dat.</p>':''}${(inventory.buildings||[]).filter(b=>b.relatedPropertyIds.includes(p.id)).map(b=>`<h3>${icon('house')} ${esc(b.name)}</h3><img class="detail-photo" src="${esc(assetUrl(b.photoUrl))}" alt="${esc(b.name)} · fotografie z posudku"><p class="detail-notes">${esc(b.description)}</p><p class="detail-notes">Ocenění celku včetně souvisejících pozemků: <strong>${money(b.valuationCzk)}</strong>. Nesčítat opakovaně u souvisejících parcel.</p>`).join('')}${p.notes?.length?`<p class="detail-notes">${p.notes.map(n=>esc(typeof n==='string'?n:JSON.stringify(n))).join('<br>')}</p>`:''}${(inventory.valuationGroups||[]).filter(g=>g.propertyIds.includes(p.id)).map(g=>`<p class="price-note">Společné ocenění skupiny ${esc(g.name)}: <strong>${money(g.valueCzk)}</strong> za ${g.propertyIds.length} parcely dohromady. Částka není rozdělena mezi jednotlivé parcely.</p>`).join('')}${p.description?`<h3>Charakter a využití</h3><p class="detail-notes">${esc(p.description)}</p>`:''}<h3>Zájemci ${p.interests.length?`(${p.interests.length})`:''}</h3>${p.interests.length?p.interests.map(i=>`<div class="interest-item" style="border-color:${buyers[i.buyer]?.color||'#81986d'}"><strong>${esc(buyers[i.buyer]?.name||i.name)}</strong><span class="status-tag ${i.status}">${statusLabels[i.status]}</span><p>${esc(i.date)} · ${esc(i.source)}</p>${i.note?`<p>${esc(i.note)}</p>`:''}${i.buyer==='custom'?`<button class="saved-note" data-action="remove-interest" data-interest-id="${esc(i.id)}" style="text-decoration:underline">Odstranit tento vlastní zájem</button>`:''}</div>`).join(''):'<p class="detail-notes">V dodaných e-mailech není evidován zájem.</p>'}<h3>Vlastní označení zájmu</h3><form id="custom-interest" class="field-row"><input id="custom-name" placeholder="Jméno zájemce" aria-label="Jméno vlastního zájemce" maxlength="100" required><button class="btn small" type="submit" title="Přidat zájemce">${icon('plus')}</button></form><button class="btn interest-one" data-action="interest-one">Zadat zájem s podmínkami</button><h3>Moje poznámka</h3><textarea id="parcel-note" placeholder="Podmínky, návaznosti, další jednání…" aria-label="Vlastní poznámka k parcele">${esc(local.notes[p.id]||'')}</textarea><div class="saved-note">Uloženo automaticky v tomto prohlížeči</div></div><div class="detail-foot"><button class="btn small ${local.bookmarks.includes(p.id)?'active':''}" data-action="bookmark">${icon('bookmark')} ${local.bookmarks.includes(p.id)?'Ve výběru':'Do výběru'}</button>${f?`<a class="btn small" href="https://vdp.cuzk.gov.cz/vdp/ruian/parcely/${geo.cpId?.replace(/^.*\./,'')||''}" target="_blank" rel="noopener" id="kn-link">${icon('external-link')} ČÚZK</a>`:''}</div>`;const kn=$('#kn-link');if(kn)kn.href=`https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?encrypted=0&typ=parcela&id=${encodeURIComponent(geo.cpId?.replace(/^.*\./,'')||'')}`;assets?.appendPropertyPreview(detail,p);iconsNow();}
function resetFilters(fit=true,clearSearch=true){
  Object.assign(state,{area:'all',query:'',status:'all',buyer:'all',kind:'all',bookmarked:false,scopeIds:null});
  $('#search').value='';$('#buyer-filter').value='all';$('#land-filter').value='all';
  if(clearSearch)quickSearch?.clear();$('#map-scope').hidden=true;applyFilters(fit);
}
function navigate(view){state.view=view;for(const v of ['atlas','buyers','overview','photos'])$(`#${v}-view`).classList.toggle('hidden',v!==view);$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('h1 span').textContent=` / ${view==='atlas'?'Atlas':view==='buyers'?'Zájemci':view==='photos'?'Fotografie':'Přehled'}`;if(view==='atlas')requestAnimationFrame(()=>parcelMap.resize());if(view==='buyers')renderBuyers();if(view==='overview')renderOverview();if(view==='photos')assets.renderPhotoIndex($('#photos-view'));iconsNow();}
function bindEvents(){
  document.addEventListener('click',e=>{
    if(e.target.closest('.bulk-check-cell'))return;
    const el=e.target.closest('button,a,[data-parcel]');if(!el)return;
    if(el.dataset.action)e.preventDefault();
    if(el.dataset.view)navigate(el.dataset.view);
    if(el.dataset.area){state.area=el.dataset.area;state.scopeIds=null;quickSearch?.clear();$('#map-scope').hidden=true;applyFilters(true)}
    if(el.dataset.status){state.status=state.status===el.dataset.status?'all':el.dataset.status;applyFilters(true)}
    if(el.dataset.relation){const f=relations.find(f=>f.properties.id===el.dataset.relation);if(f){navigate('atlas');parcelMap.fitRelations([f.properties.id]);selectRelation(f)}}
    if(el.dataset.building)assets.openBuilding(el.dataset.building);
    if(el.dataset.parcel){if(el.tagName==='TR')assets.openProperty(el.dataset.parcel);else{if(state.view!=='atlas')navigate('atlas');selectProperty(el.dataset.parcel)}}
    if(el.dataset.buyer){resetFilters(false);state.buyer=el.dataset.buyer;$('#buyer-filter').value=state.buyer;navigate('atlas');applyFilters(true)}
    if(el.dataset.color)setColorMode(el.dataset.color);
    if(el.dataset.basemap){state.basemap=el.dataset.basemap;parcelMap.setBasemap(state.basemap);$$('[data-basemap]').forEach(b=>b.classList.toggle('active',b===el));}
    if(el.dataset.mode){state.mode3d=el.dataset.mode==='3d';parcelMap.set3D(state.mode3d);$$('[data-mode]').forEach(b=>b.classList.toggle('active',b===el));}
    const a=el.dataset.action;
    if(a==='filters'){const open=$('.map-section').classList.toggle('filters-open');el.setAttribute('aria-expanded',String(open));}
    if(a==='reset')resetFilters();
    if(a==='fit'){parcelMap.fit(filtered().map(p=>p.id));toast('Zobrazen celý aktuálně filtrovaný soubor')}
    if(a==='zoom-in')parcelMap.zoomIn();if(a==='zoom-out')parcelMap.zoomOut();if(a==='north')parcelMap.resetNorth();
    if(a==='export')exportCsv();if(a==='sources')showSources();if(a==='close-modal')$('#modal').close();
    if(a==='close-detail'){$('#detail').classList.add('hidden');state.selected=null;parcelMap.select(null)}
    if(a==='bookmarks'){state.bookmarked=!state.bookmarked;applyFilters(true)}
    if(a==='bookmark'){const i=local.bookmarks.indexOf(state.selected);if(i>=0)local.bookmarks.splice(i,1);else local.bookmarks.push(state.selected);persist();renderDetail(properties.find(p=>p.id===state.selected));applyFilters()}
    if(a==='remove-interest'){
      const previous=JSON.parse(JSON.stringify(local.interests));
      removeCustomInterest(local.interests,state.selected,el.dataset.interestId);
      if(persist()){lastInterestBatch=null;refreshInterests();toast('Vlastní zájem byl odstraněn')}else local.interests=previous;
    }
    if(a==='bulk-interest')bulkInterests.open();
    if(a==='interest-one'&&state.selected)bulkInterests.open({ids:[state.selected]});
    if(a==='bulk-clear'){bulkSelection.clear();applyFilters();}
    if(a==='bulk-visible'){filtered().forEach(p=>bulkSelection.add(p.id));applyFilters();}
    if(a==='bulk-map')showMapScope([...bulkSelection],'Výběr pro nový zájem');
    if(a==='undo-interest')undoInterestBatch();
    if(a==='dismiss-interest'){lastInterestBatch=null;renderSelection();}
  });
  $('#search').addEventListener('input',e=>{state.query=e.target.value;applyFilters()});
  $('#search').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=filtered()[0];if(first)selectProperty(first.id)}});
  $('#buyer-filter').addEventListener('change',e=>{state.buyer=e.target.value;applyFilters(true)});
  $('#land-filter').addEventListener('change',e=>{state.kind=e.target.value;applyFilters(true)});
  $('#sort').addEventListener('change',e=>{state.sort=e.target.value;applyFilters()});
  $('#context-toggle').addEventListener('change',e=>{state.context=e.target.checked;parcelMap.setContextVisible(state.context)});
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-bulk-select]')){const id=e.target.dataset.bulkSelect;if(e.target.checked)bulkSelection.add(id);else bulkSelection.delete(id);renderSelection();}
    if(e.target.id==='bulk-all'){filtered().forEach(p=>e.target.checked?bulkSelection.add(p.id):bulkSelection.delete(p.id));applyFilters();}
  });
  document.addEventListener('input',e=>{if(e.target.id==='parcel-note'&&state.selected){local.notes[state.selected]=e.target.value;persist()}});
  document.addEventListener('submit',e=>{if(e.target.id==='custom-interest'){
    e.preventDefault();const name=$('#custom-name').value.trim();if(!name)return;
    try{saveInterestBatch({ids:[state.selected],name,status:'confirmed',note:''})}catch(error){toast(error.message)}
  }});
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.matches('tr[data-parcel]'))assets.openProperty(e.target.dataset.parcel);
    if(e.key==='Escape'&&!document.querySelector('dialog[open]')){$('.map-section').classList.remove('filters-open');$('.atlas-filter-button').setAttribute('aria-expanded','false');$('#detail').classList.add('hidden');state.selected=null;parcelMap.select(null)}
  });
  $('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close()});
}
function updateMetric(){
  $('#metric-interest').innerHTML=`${properties.filter(p=>p.interested).length}<small>/ ${properties.length}</small>`;
  const people=new Set(properties.flatMap(p=>p.interests.map(partyKey)));
  $('#metric-interest').parentElement.querySelector('.metric-note').textContent=`${people.size} ${people.size===1?'zájemce':people.size<5?'zájemci':'zájemců'} · zájem, zvažování a podmíněný zájem`;
}
function exportCsv(){const rows=filtered();const columns=['ID','Katastrální území','Parcela','LV','Druh pozemku','Výměra posudek m2','Podíl','Cena celé parcely Kč','Stav zájmu','Zájemci','Podrobnosti vlastních zájmů','Strany posudku','Přesná geometrie','Výměra aktuální KN m2','Můj výběr','Poznámka'];const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;const lines=[columns,...rows.map(p=>{const f=features.find(f=>f.properties.id===p.id);return[p.id,p.cadastralArea,p.parcelNumber,p.lv,p.landType,p.areaM2,p.ownershipShare,p.valuationCzk,statusLabels[p.interestStatus],p.interests.map(i=>`${buyers[i.buyer]?.name||i.name} (${statusLabels[i.status]})`).join(' | '),p.interests.filter(i=>i.buyer==='custom').map(i=>`${i.name}: ${statusLabels[i.status]} · ${i.date} · ${i.note||''}`).join(' | '),p.sourcePages.join(','),f?'Ano':'K ověření',f?.properties.currentKnAreaM2,local.bookmarks.includes(p.id)?'Ano':'Ne',local.notes[p.id]||'']})];const text='\uFEFF'+lines.map(row=>row.map(quote).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='docekal-parcely-vyber.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Exportováno ${rows.length} parcel včetně zájmů a poznámek`)}
function renderSourceBuyers(){$('#buyers-view').innerHTML=`<div class="info-callout">${icon('git-compare-arrows')}<div>STAGRA a Vladimír Pacal mají souběžný zájem o parcely <strong>196/7, 196/15, 196/25 a 203/8</strong> ve Velkém Jeníkově. Zájem z e-mailů není uzavřenou kupní smlouvou.</div></div><div class="buyer-view">${Object.entries(buyers).map(([id,b])=>{const ps=properties.filter(p=>p.interests.some(i=>i.buyer===id));const rs=interestRecords.filter(r=>r.buyer===id);return`<article class="buyer-card"><div class="buyer-title"><span class="buyer-avatar" style="background:${b.color}">${b.short}</span><div><h2>${esc(b.name)}</h2><p>${b.date} · ${ps.length} parcel</p></div></div><p>${esc(b.note)}</p>${id==='pacal'?`<div class="buyer-warning">Částka uvedená v e-mailu: <strong>3 402 172 Kč</strong>. Součet sedmi položek v posudku: <strong>3 027 261 Kč</strong>. Rozdíl 374 911 Kč je k vyjasnění.</div>`:''}<div class="buyer-stats"><div><strong>${ha(ps.reduce((s,p)=>s+p.areaM2,0))}</strong><span>ha · plná výměra parcel</span></div><div><strong>${rs.some(r=>r.status==='considering')?rs.filter(r=>r.status==='considering').length:rs.some(r=>r.status==='lease')?rs.filter(r=>r.status==='lease').length:ps.filter(p=>partyCount(p)>1).length}</strong><span>${rs.some(r=>r.status==='considering')?'zvažovaných parcel':rs.some(r=>r.status==='lease')?'žádosti o pacht':'parcel s více zájemci'}</span></div></div>${id==='pacal'?`<p class="overview-note">Samostatné pachtovní souvislosti mimo oceňovaný soubor:</p><div class="buyer-parcels">${relations.map(f=>`<button data-relation="${f.properties.id}">${f.properties.number} · žádost o pacht ↗</button>`).join('')}</div>`:''}<div class="buyer-parcels">${ps.map(p=>`<button data-parcel="${p.id}" title="${esc(p.cadastralArea)}">${esc(p.parcelNumber)} <span style="color:#a2ad96">${p.cadastralArea==='Velký Jeníkov'?'VJ':p.cadastralArea==='Malý Jeníkov'?'MJ':p.cadastralArea.startsWith('Olšany')?'OL':'ST'}</span></button>`).join('')}</div><button class="btn small" data-buyer="${id}">${icon('map-pinned')} Zobrazit parcely v mapě ${icon('arrow-up-right')}</button></article>`}).join('')}</div>`;iconsNow()}
function renderOverview(){const total=inventory.summary.areaM2;const weighted=properties.reduce((s,p)=>{const[a,b]=p.ownershipShare.split('/').map(Number);return s+p.areaM2*a/b},0);$('#overview-view').innerHTML=`<div class="overview-grid"><article class="overview-card"><h2>Skladba majetku podle výměry</h2>${Object.entries(landNames).map(([kind,name])=>{const area=properties.filter(p=>p.kind===kind).reduce((s,p)=>s+p.areaM2,0);return`<div class="bar-row"><span>${name}</span><span class="bar"><i style="background:${LAND_COLORS[kind]};width:${area/total*100}%"></i></span><strong>${ha(area)} ha</strong></div>`}).join('')}<p class="overview-note">Plné výměry parcel: ${ha(total)} ha. Výměra odpovídající prodávaným podílům: ${ha(weighted)} ha.</p></article><article class="overview-card"><h2>Majetek v pěti lokalitách</h2>${inventory.cadastralAreas.map(a=>{const ps=properties.filter(p=>p.cadastralArea===a.name);const area=ps.reduce((s,p)=>s+p.areaM2,0);return`<div class="bar-row"><span>${esc(a.name)}</span><span class="bar"><i style="background:#74915e;width:${area/total*100}%"></i></span><strong>${ha(area)} ha</strong></div>`}).join('')}<p class="overview-note">393 parcel na 11 listech vlastnictví. Parcely různých lokalit se nesčítají podle samotného parcelního čísla.</p></article><article class="overview-card"><h2>Ocenění dle znaleckého posudku</h2><div class="fact" style="margin:25px 0"><span>Stavby se souvisejícími pozemky</span><strong style="font-size:22px">${money(inventory.summary.buildingsWithRelatedLandCzk)}</strong></div><div class="fact" style="margin:25px 0"><span>Volné pozemky po zohlednění podílů</span><strong style="font-size:22px">${money(inventory.summary.landValueAdjustedCzk)}</strong></div><p class="overview-note">Celkem ${money(inventory.summary.marketValueCzk)}, dle závěru na str. 95–96. Jednotlivé ceny pozemků a souhrny staveb se nepřičítají znovu k celku.</p><a class="btn small" href="${assetUrl('/posudek.pdf')}#page=95" target="_blank" rel="noopener">${icon('file-text')} Otevřít závěr posudku</a></article><article class="overview-card"><h2>Kontrola dat a návazností</h2><div class="info-callout">${icon('map-pin-check')}<span><strong>${features.length} z ${properties.length} parcel</strong> má přesný polygon z ČÚZK. ${properties.length-features.length} parcel zůstává k ověření.</span></div><p class="overview-note">Posudek zachycuje stav k 17. 10. 2025. Geometrie jsou načteny 26. 10. 2026. Rozdíly číslování a výměr jsou zachovány a označeny.</p><p class="overview-note">V Horním Meziříčku proběhla 17. 9. 2026 obnova operátu po pozemkové úpravě. Pro 23 původních parcel chybí převodní příloha č. 1 rozhodnutí SPÚ.</p><p class="overview-note">U Olšan u Dačic, parcela 666, je výměra v posudku 866 m² a v aktuálních datech KN 886 m². Prodávaný podíl je 4/32.</p><button class="btn small" data-action="sources">${icon('files')} Zdroje a nejasnosti</button></article></div>`;iconsNow()}
function showSources(){$('#modal-title').textContent='Zdroje a přesnost dat';const unmatched=properties.filter(p=>!features.some(f=>f.properties.id===p.id));$('#modal-body').innerHTML=`<div class="source-row">${icon('file-text')}<div><strong>Znalecký posudek č. 081650/2025</strong><p>Ocenění k 17. 10. 2025 · 164 stran · 393 parcel · souhrn 79 290 000 Kč.</p><a href="${assetUrl('/posudek.pdf')}" target="_blank" rel="noopener">Otevřít celý podepsaný posudek ↗</a></div></div><div class="source-row">${icon('map-pinned')}<div><strong>ČÚZK · INSPIRE CP / CPX a BU</strong><p>Skutečné katastrální hranice a půdorysy. Načteno 26. 10. 2026. Zobrazení aktuálních hranic neověřuje aktuálního vlastníka ani právní stav.</p><a href="https://services.cuzk.gov.cz/wfs/inspire-cp-wfs.asp?service=WFS&request=GetCapabilities" target="_blank" rel="noopener">Oficiální parcelní služba ČÚZK ↗</a></div></div><div class="source-row">${icon('mail')}<div><strong>Poptávky ze 13.–14. 10. 2026</strong><p>ZD Strmilov, STAGRA, Vladimír Pacal a zprostředkovaně pan Dvořák. Zvažovaný a podmíněný zájem i žádosti o převod pachtu jsou označeny samostatně. Pacalův vlastní LV 211 slouží jen jako souvislost.</p></div></div><h3>Parcely bez ověřené dnešní geometrie (${unmatched.length})</h3><p>${[...new Set(unmatched.map(p=>p.cadastralArea))].map(n=>`<strong>${esc(n)}:</strong> ${unmatched.filter(p=>p.cadastralArea===n).map(p=>esc(p.parcelNumber)).join(', ')}`).join('<br>')}</p><p>Parcelní čísla jsou převzata z posudku. Tři pachtovní souvislosti Pacala nejsou součástí vlastněného souboru a nezvyšují jeho výměru ani ocenění. Pacalův e-mail uvádí pro sedm parcel 3 402 172 Kč, ale součet položek posudku činí 3 027 261 Kč. U výše uvedených 23 parcel nebyla v aktuálních otevřených datech nalezena geometrie; ČÚZK eviduje 17. 9. 2026 obnovu operátu v Horním Meziříčku pozemkovou úpravou. Rozhodnutí SPÚ z 25. 8. 2026 výslovně zahrnuje i všech pět uvedených strmilovských parcel. Nástupnická čísla je nutné dohledat v příloze č. 1 rozhodnutí, která není součástí veřejného PDF. V mapě pro ně není odhadovaná náhrada.</p><p><a href="${assetUrl('/sources/pozemkove-upravy-2026.pdf')}" target="_blank" rel="noopener">Rozhodnutí SPÚ · pozemkové úpravy 2026 ↗</a></p><h3>Rozpory zachované ze zdrojů</h3><p>Olšany u Dačic 666: 866 m² v posudku, 886 m² v aktuálním KN, podíl 4/32. U LV 69 se v posudku rozchází uvedené jméno vlastníka. V textu na str. 94 je uvedeno 45,45 mil. Kč za volné pozemky; tabulka a závěr uvádějí 54,45 mil. Kč. Souhrn dashboardu používá závěrečné ocenění. U stavby Strmilov st. 411 se v tabulce opakuje č. p. 384, popis identifikuje č. p. 393.</p><h3>Jak číst mapu</h3><p>Barvy rozlišují druh pozemku nebo stav zájmu. Vlastněné parcely mají výrazné hranice, okolní krajina jemné plochy. Režim 3D používá Three.js; půdorysy jsou skutečné, výšky staveb a zvýraznění parcel jsou schematické. Výškový model terénu není součástí dat. Označení vodní plochy vychází z druhu pozemku. Barevné vlastněné parcely používají druh z posudku 2025, jemný kontext aktuální KN. U 13 parcel se druh v aktuálním KN liší a detail uvádí obě hodnoty. Modré přerušované hranice vyznačují tři pachtovní souvislosti; nepatří do 393 oceňovaných parcel.</p><h3>Vlastní výběr a poznámky</h3><p>Ukládají se lokálně v tomto prohlížeči. Export CSV obsahuje právě filtrované parcely, zájemce, vlastní poznámky a označení. Pro zálohu vlastních záznamů exportujte celý soubor bez filtrů.</p>`;$('#modal').showModal();iconsNow()}

function renderBuildings(){
  $('#building-section').innerHTML=`<div class="section-top"><div class="section-title">${icon('house')}<h2>Domy a hospodářské stavby</h2><span class="count-pill">6 celků</span></div><span class="saved-note">Rozklikněte objekt pro všechny fotografie a úplný detail</span></div><div class="building-cards">${inventory.buildings.map(b=>`<button class="building-card" data-building="${b.id}" aria-label="${esc(b.name)} · úplný detail a ${assets.buildingPhotoCount(b.id)} fotografií"><div class="building-photo"><img src="${esc(assetUrl(b.photoUrl))}" alt="${esc(b.name)}" loading="lazy"><span>${b.type==='house'?'Rodinný dům':b.type==='farm'?'Hospodářský areál':'Zemědělská hala'}</span><span class="building-photo-count">${assets.buildingPhotoCount(b.id)} fotografií</span></div><div class="building-card-body"><span>${esc(b.cadastralArea)} · ${esc(b.parcelNumber)}</span><h3>${esc(b.name)}</h3><div><strong>${num(b.valuationCzk/1e6,2)} mil. Kč</strong>${icon('arrow-up-right')}</div></div></button>`).join('')}</div>`;iconsNow();
}
function selectRelation(f){
  const p=f.properties;state.selected=null;parcelMap.select(null);parcelMap.fitRelations([p.id]);
  const detail=$('#detail');detail.classList.remove('hidden');detail.innerHTML=`<div class="detail-head"><button class="detail-close" data-action="close-detail" aria-label="Zavřít detail">${icon('x')}</button><div class="detail-kicker">${esc(p.cadastre)} · pachtovní souvislost</div><h2>Parcela ${esc(p.number)}</h2><span class="detail-sub">Mimo 393 oceňovaných parcel</span></div><div class="detail-body"><div class="status-tag lease">Žádost o převod pachtu</div><h3>Vladimír Pacal</h3><p class="detail-notes">Dle e-mailu z 13. 10. 2026 žádá o převedení pachtovních smluv pro kompletaci půdního bloku. Tento záznam nepotvrzuje vlastnictví Pavla Dočekala.</p><div class="fact"><span>Výměra aktuální KN</span><strong>${num(p.areaM2)} m²</strong></div><p class="detail-notes">Skutečná geometrie ČÚZK. Výměra ani hodnota této parcely nejsou započteny do souhrnu majetku. Pacal uvádí LV 201, ale tato parcela není ve výčtu oceňovaných nemovitostí.</p></div><div class="detail-foot"><button class="btn small" data-action="close-detail">Zavřít souvislost</button></div>`;iconsNow();
}

function setupWorkflows(){
  const host=document.createElement('div');host.className='quick-search-host';$('.map-section').append(host);
  const scope=document.createElement('div');scope.id='map-scope';scope.className='map-scope';scope.hidden=true;
  scope.innerHTML='<span></span><button data-action="reset" aria-label="Zrušit omezení mapy">Zobrazit vše ×</button>';
  $('.map-section').append(scope);
  const add=document.createElement('button');add.className='btn primary interest-add';add.dataset.action='bulk-interest';
  add.innerHTML=icon('plus')+'Přidat nový zájem';$('.page-heading').append(add);
  const bar=document.createElement('div');bar.className='bulk-selection-bar';bar.id='bulk-selection-bar';
  $('.table-section .table-wrap').before(bar);
  const notice=document.createElement('div');notice.id='interest-undo';notice.className='interest-undo';notice.hidden=true;
  $('.page-heading').after(notice);
  renderBuyerFilter();
  quickSearch=createQuickSearch({container:host,properties,buildings:inventory.buildings,features,iconsNow,
    onProperty:id=>{resetFilters(false,false);selectProperty(id);},
    onArea:result=>showMapScope(result.propertyIds,result.label,true),
    onBuilding:id=>{const b=inventory.buildings.find(b=>b.id===id);if(!b)return;resetFilters(false,false);parcelMap.fit(b.relatedPropertyIds);assets.openBuilding(id);},
    onClear:()=>resetFilters()
  });
  bulkInterests=createBulkInterest({properties,features,buyers,statusLabels,iconsNow,
    getSelectedIds:()=>[...bulkSelection],getFilteredIds:()=>filtered().map(p=>p.id),
    getInterests:p=>p.interests||[],
    onSelection:ids=>{bulkSelection.clear();ids.forEach(id=>bulkSelection.add(id));renderSelection();},
    onSave:saveInterestBatch
  });
  updateMetric();
}

function showMapScope(ids,label,fromSearch=false){
  resetFilters(false,!fromSearch);state.scopeIds=[...new Set(ids)];
  $('#detail').classList.add('hidden');state.selected=null;parcelMap.select(null);
  navigate('atlas');applyFilters(true);$('#map-scope span').textContent=label;$('#map-scope').hidden=false;
  const mapped=new Set(features.map(f=>f.properties.id));
  if(!ids.some(id=>mapped.has(id)))toast('Výběr je v soupisu. Přesná geometrie těchto parcel je k ověření.');
}

function renderSelection(){
  const bar=$('#bulk-selection-bar');if(!bar)return;
  const ps=filtered(),visibleSelected=ps.filter(p=>bulkSelection.has(p.id)).length;
  const selected=properties.filter(p=>bulkSelection.has(p.id));
  bar.innerHTML=`<div class="bulk-selection-summary"><strong>${selected.length?`${selected.length} vybraných parcel`:'Výběr pro nový zájem'}</strong><span>${selected.length?`${ha(selected.reduce((s,p)=>s+p.areaM2,0))} ha · ${selected.length-visibleSelected} mimo aktuální filtr`:'Zaškrtněte parcely v tabulce nebo vložte jejich seznam.'}</span></div><div class="bulk-selection-actions"><button class="btn" data-action="bulk-visible">Vybrat ${ps.length} filtrovaných</button>${selected.length?`<button class="btn" data-action="bulk-map">${icon('map-pinned')} V mapě</button><button class="btn" data-action="bulk-clear">Zrušit výběr</button>`:''}<button class="btn primary" data-action="bulk-interest">${icon('plus')} Přidat zájem${selected.length?' k výběru':''}</button></div>`;
  const all=$('#bulk-all');if(all){all.checked=ps.length>0&&visibleSelected===ps.length;all.indeterminate=visibleSelected>0&&visibleSelected<ps.length;all.disabled=!ps.length;}
  $$('[data-bulk-select]').forEach(input=>{input.checked=bulkSelection.has(input.dataset.bulkSelect);});
  bulkInterests?.refreshSelection();
  $('#interest-undo').hidden=!lastInterestBatch;
  if(lastInterestBatch)$('#interest-undo').innerHTML=`<span role="status">Zájem <strong>${esc(lastInterestBatch.name)}</strong> přidán k ${lastInterestBatch.added} parcelám.</span><button data-action="undo-interest">Vrátit poslední přidání</button><button data-action="dismiss-interest" aria-label="Skrýt oznámení">×</button>`;
  iconsNow();
}

function setColorMode(mode){
  state.color=mode;parcelMap.setColorMode(mode);$$('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color===mode));
  $('#legend').innerHTML=renderLegend();$('#legend-title').textContent=mode==='land'?'DRUHY POZEMKŮ':'EVIDOVANÝ ZÁJEM';
}

function renderBuyerFilter(){
  const groups=new Map();properties.forEach(p=>customInterestsFor(local.interests[p.id]).forEach(i=>groups.set(customBuyerKey(i.name),i.name)));
  $('#buyer-filter').innerHTML='<option value="all">Všichni zájemci</option>'+Object.entries(buyers).map(([id,b])=>`<option value="${id}">${esc(b.name)}</option>`).join('')+[...groups].map(([id,name])=>`<option value="${esc(id)}">${esc(name)} · vlastní</option>`).join('');
  $('#buyer-filter').value=state.buyer;
  if(!$('#buyer-filter').value){state.buyer='all';$('#buyer-filter').value='all';}
}

function refreshInterests(){
  refreshDerived();parcelMap.setData({type:'FeatureCollection',features});renderBuyerFilter();applyFilters();updateMetric();quickSearch?.refresh();
  if(state.selected){const p=properties.find(p=>p.id===state.selected);if(p)renderDetail(p);}
  if(state.view==='buyers')renderBuyers();
}

function saveInterestBatch({ids,name,status='confirmed',note=''}){
  const valid=new Set(properties.map(p=>p.id));ids=[...new Set(ids)].filter(id=>valid.has(id));
  if(!ids.length)throw Error('Nejdříve vyberte alespoň jednu parcelu.');
  name=String(name||'').trim();if(!name)throw Error('Vyplňte jméno zájemce.');
  const before=JSON.parse(JSON.stringify(local.interests));
  const candidates=ids.filter(id=>!properties.find(p=>p.id===id).interests.some(i=>partyKey(i)===customBuyerKey(name)&&i.status===status));
  if(!candidates.length){toast('Tento zájem je už u všech vybraných parcel evidován.');return {added:0,skipped:ids.length,ids:[],previous:{}};}
  const result=addInterestBatch(local.interests,candidates,{name,status,note});
  result.skipped+=ids.length-candidates.length;
  if(!result.added){toast('Tento zájem je už u všech vybraných parcel evidován.');return result;}
  if(!persist()){local.interests=before;throw Error('Zájem se nepodařilo uložit. Zkuste to znovu nebo uvolněte úložiště prohlížeče.');}
  lastInterestBatch={...result,name};refreshInterests();setColorMode('interest');
  toast(`Zájem uložen k ${result.added} parcelám${result.skipped?` · ${result.skipped} shodných záznamů vynecháno`:''}`);
  return result;
}

function undoInterestBatch(){
  if(!lastInterestBatch)return;const before=JSON.parse(JSON.stringify(local.interests));
  Object.entries(lastInterestBatch.previous).forEach(([id,value])=>{if(value===null)delete local.interests[id];else local.interests[id]=value;});
  if(!persist()){local.interests=before;return;}
  lastInterestBatch=null;refreshInterests();toast('Poslední přidání zájmu bylo vráceno.');
}

function renderBuyers(){
  renderSourceBuyers();
  const action=document.createElement('div');action.className='buyers-workflow-actions';action.innerHTML=`<div><strong>Nový zájem o více parcel</strong><p>Zadejte zájemce, stav jednání a společnou poznámku.</p></div><button class="btn primary" data-action="bulk-interest">${icon('plus')} Přidat nový zájem</button>`;$('#buyers-view').prepend(action);
  const groups=new Map();properties.forEach(p=>p.interests.filter(i=>i.buyer==='custom').forEach(i=>{const key=customBuyerKey(i.name);if(!groups.has(key))groups.set(key,{name:i.name,properties:new Map(),records:[]});const g=groups.get(key);g.properties.set(p.id,p);g.records.push(i);}));
  if(groups.size){
    const section=document.createElement('section');section.className='custom-buyers';section.innerHTML='<h2>Vlastní zájemci</h2><p>Uloženo v tomto prohlížeči. Pro zálohu použijte export parcel.</p><div class="buyer-view"></div>';
    section.querySelector('.buyer-view').innerHTML=[...groups].map(([id,g])=>{const ps=[...g.properties.values()];return `<article class="buyer-card"><div class="buyer-title"><span class="buyer-avatar">${icon('users-round')}</span><div><h2>${esc(g.name)}</h2><p>${ps.length} parcel · vlastní záznamy</p></div></div><div class="buyer-stats"><div><strong>${ha(ps.reduce((s,p)=>s+p.areaM2,0))}</strong><span>ha · plná výměra parcel</span></div><div><strong>${ps.filter(p=>partyCount(p)>1).length}</strong><span>parcel s více zájemci</span></div></div><p>${[...new Set(g.records.map(i=>statusLabels[i.status]))].map(esc).join(' · ')}</p><div class="buyer-parcels">${ps.map(p=>`<button data-parcel="${esc(p.id)}">${esc(p.parcelNumber)} · ${esc(p.cadastralArea)}</button>`).join('')}</div><button class="btn" data-buyer="${esc(id)}">${icon('map-pinned')} Zobrazit v mapě</button></article>`}).join('');
    $('#buyers-view').append(section);
  }
  iconsNow();
}

init().catch(error=>{console.error(error);$('#app').innerHTML=`<div class="loader"><div class="loader-box"><h2>Atlas se nepodařilo načíst</h2><p>${esc(error.message)}</p><button class="btn primary" onclick="location.reload()">Zkusit znovu</button></div></div>`});
