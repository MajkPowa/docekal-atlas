import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSearch, matchesPropertyQuery, searchPortfolio } from '../src/parcel-search.js';
const inventory = JSON.parse(await readFile(new URL('../public/data/properties.json', import.meta.url), 'utf8'));
const portfolio = JSON.parse(await readFile(new URL('../public/data/portfolio.geojson', import.meta.url), 'utf8'));
const run = query => searchPortfolio({ properties: inventory.properties, buildings: inventory.buildings, features: portfolio.features, query });
assert.equal(normalizeSearch('  Horní Meziříčko  st.  407 / 2 '), 'horni meziricko st 407/2');
assert.ok(matchesPropertyQuery({ parcelNumber: '88/2', cadastralArea: 'Malý Jeníkov', lv: '792' }, 'maly jenikov 88/2'));
assert.ok(!matchesPropertyQuery({ parcelNumber: '88/2', cadastralArea: 'Malý Jeníkov', lv: '792' }, 'velky 88/2'));
assert.ok(!matchesPropertyQuery({ parcelNumber: '407', cadastralArea: 'Strmilov', lv: '1555' }, 'st. 407'));
assert.ok(matchesPropertyQuery({ parcelNumber: 'st. 407', cadastralArea: 'Strmilov', lv: '1555' }, 'st407 Strmilov'));
assert.ok(matchesPropertyQuery({ parcelNumber: '88/2', cadastralArea: 'Malý Jeníkov', lv: '792' }, 'LV792 88/2'));
assert.ok(!matchesPropertyQuery({ parcelNumber: '88/2', cadastralArea: 'Malý Jeníkov', lv: '799' }, 'LV792 88/2'));
const exactRank = searchPortfolio({ properties: [
  { id: 'partial', parcelNumber: '1666', cadastralArea: 'Strmilov', lv: '1555' },
  { id: 'exact', parcelNumber: '666', cadastralArea: 'Olšany u Dačic', lv: '69' },
], query: '666' });
assert.equal(exactRank[0].id, 'exact');
assert.ok(run('Horni Meziricko').some(r => r.type === 'area' && r.area === 'Horní Meziříčko'));
const lv = run('LV 1555');
assert.equal(lv[0].type, 'lv');
assert.equal(lv[0].area, 'Strmilov');
assert.ok(lv[0].propertyIds.length > 100);
assert.ok(run('LV201 Velky Jenikov').some(r => r.type === 'lv' && r.area === 'Velký Jeníkov'));
assert.ok(run('Tyrsova').some(r => r.type === 'building' && r.id === 'strmilov-384'));
assert.ok(run('dum 384').some(r => r.type === 'building' && r.id === 'strmilov-384'));
assert.ok(run('666').some(r => r.type === 'property' && r.area === 'Olšany u Dačic' && r.lv === '69'));
const ambiguous = run('st 1');
assert.ok(ambiguous.filter(r => r.type === 'property').every(r => r.label.includes('st.')));
assert.deepEqual(run('nenalezitelnyxyz'), []);
assert.deepEqual(run(''), []);
console.log('Parcel search: diacritics, combined tokens, exact number ranking, LV, buildings and empty results passed.');
