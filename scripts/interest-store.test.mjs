import assert from 'node:assert/strict';
import { addInterestBatch, customBuyerKey, customInterestsFor, removeCustomInterest, resolveParcelList } from '../src/interest-store.js';

const store = { old: 'Původní zájemce' };
const before = structuredClone(store);
const first = addInterestBatch(store, ['old', 'new', 'new'], { name: 'Nový zájemce', status: 'conditional', note: 'Podle ceny' }, new Date('2026-10-26T12:00:00Z'));
assert.equal(first.added, 2);
assert.equal(store.old.length, 2);
assert.equal(store.old[0].name, 'Původní zájemce');
assert.equal(first.previous.old, before.old);
assert.equal(first.previous.new, null);
assert.equal(store.new[0].note, 'Podle ceny');
assert.equal(store.new[0].date, '26. 10. 2026');
const duplicate = addInterestBatch(store, ['new'], { name: '  NOVÝ   ZÁJEMCE ', status: 'conditional', note: 'Nepřepsat' });
assert.equal(duplicate.skipped, 1);
assert.equal(store.new[0].note, 'Podle ceny');
addInterestBatch(store, ['new'], { name: 'Druhý zájemce', status: 'confirmed' });
assert.equal(store.new.length, 2);
assert.equal(removeCustomInterest(store, 'new', store.new[0].id), true);
assert.equal(store.new.length, 1);
assert.equal(store.new[0].name, 'Druhý zájemce');
assert.equal(removeCustomInterest(store, 'old', 'legacy'), true);
assert.equal(store.old.length, 1);
assert.deepEqual(customInterestsFor(null), []);
assert.equal(customBuyerKey(' Nový   Zájemce '), customBuyerKey('novy zajemce'));
assert.throws(() => addInterestBatch(store, [], { name: 'A' }), /alespoň/);
assert.throws(() => addInterestBatch(store, ['new'], { name: 'A', status: 'invalid' }), /platný stav/);

const properties = [
  { id: 'a', cadastralArea: 'Strmilov', parcelNumber: '407' },
  { id: 'b', cadastralArea: 'Strmilov', parcelNumber: 'st. 407' },
  { id: 'c', cadastralArea: 'Strmilov', parcelNumber: '88/2' },
  { id: 'd', cadastralArea: 'Malý Jeníkov', parcelNumber: '88/2' },
  { id: 'e', cadastralArea: 'Strmilov', parcelNumber: '99' },
  { id: 'f', cadastralArea: 'Strmilov', parcelNumber: '99' },
];
const parsed = resolveParcelList('407, st. 407; 88/2\n088/02 999 neznámé 99', 'strmilov', properties);
assert.deepEqual(parsed.matches.map(property => property.id), ['a', 'b', 'c']);
assert.deepEqual(parsed.duplicates, ['088/02']);
assert.deepEqual(parsed.unknown, ['999']);
assert.deepEqual(parsed.invalid, ['neznámé']);
assert.equal(parsed.ambiguous.length, 1);
assert.equal(parsed.ambiguous[0].token, '99');
assert.equal(resolveParcelList('88/2', '', properties).requiresCadastre, true);
assert.deepEqual(resolveParcelList('88/2', 'Maly Jenikov', properties).matches.map(property => property.id), ['d']);
assert.deepEqual(resolveParcelList('88 / 2', 'Strmilov', properties).matches.map(property => property.id), ['c']);
assert.equal(resolveParcelList('407-410', 'Strmilov', properties).invalid.length, 1);
console.log('interest-store: migration, preserved parties, duplicate handling, removal and exact parcel resolution passed');
