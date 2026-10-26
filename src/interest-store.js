const STATUSES = new Set(['confirmed', 'considering', 'conditional', 'lease']);
let sequence = 0;

export function normalizeInterestName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs');
}

export function customBuyerKey(name = '') {
  return `custom:${encodeURIComponent(normalizeInterestName(name))}`;
}

export function customInterestsFor(value) {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? [{ id: 'legacy', buyer: 'custom', name, status: 'confirmed', note: '', date: 'Vlastní záznam', source: 'Vlastní označení v tomto prohlížeči' }] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter(record => record && typeof record.name === 'string' && record.name.trim()).map((record, index) => ({
    ...record,
    id: typeof record.id === 'string' && /^[\w-]+$/.test(record.id) ? record.id : `legacy-${index}`,
    buyer: 'custom',
    name: record.name.trim(),
    status: STATUSES.has(record.status) ? record.status : 'confirmed',
    note: typeof record.note === 'string' ? record.note : '',
    date: typeof record.date === 'string' ? record.date : 'Vlastní záznam',
    source: typeof record.source === 'string' ? record.source : 'Vlastní označení v tomto prohlížeči',
  }));
}

function copyValue(value) {
  return Array.isArray(value) ? value.map(record => ({ ...record })) : value;
}

/** Add a party without replacing either earlier custom parties or source evidence. */
export function addInterestBatch(interests, ids, { name, status = 'confirmed', note = '' }, date = new Date()) {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ');
  const cleanNote = String(note ?? '').trim();
  if (!cleanName || cleanName.length > 100) throw new Error('Zadejte jméno zájemce v délce nejvýše 100 znaků.');
  if (!STATUSES.has(status)) throw new Error('Vyberte platný stav zájmu.');
  if (cleanNote.length > 2000) throw new Error('Poznámka může mít nejvýše 2 000 znaků.');
  const targetIds = [...new Set(ids)].filter(id => typeof id === 'string' && id);
  if (!targetIds.length) throw new Error('Vyberte alespoň jednu parcelu.');
  const dateObject = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObject.getTime())) throw new Error('Datum záznamu není platné.');
  const previous = {};
  const changedIds = [];
  let skipped = 0;
  for (const id of targetIds) {
    const records = customInterestsFor(interests[id]);
    const duplicate = records.some(record => normalizeInterestName(record.name) === normalizeInterestName(cleanName) && record.status === status);
    if (duplicate) { skipped++; continue; }
    previous[id] = Object.hasOwn(interests, id) ? copyValue(interests[id]) : null;
    const recordId = globalThis.crypto?.randomUUID?.() || `interest-${dateObject.getTime().toString(36)}-${(++sequence).toString(36)}`;
    interests[id] = [...records, {
      id: recordId,
      buyer: 'custom',
      name: cleanName,
      status,
      note: cleanNote,
      date: dateObject.toLocaleDateString('cs-CZ'),
      createdAt: dateObject.toISOString(),
      source: 'Vlastní záznam v tomto prohlížeči',
    }];
    changedIds.push(id);
  }
  return { added: changedIds.length, skipped, ids: changedIds, previous };
}

export function removeCustomInterest(interests, propertyId, recordId) {
  const records = customInterestsFor(interests[propertyId]);
  const remaining = records.filter(record => record.id !== recordId);
  if (remaining.length === records.length) return false;
  if (remaining.length) interests[propertyId] = remaining;
  else delete interests[propertyId];
  return true;
}

export function normalizeParcelNumber(value = '') {
  const compact = String(value).trim().toLocaleLowerCase('cs').replace(/\s+/g, '');
  const match = compact.match(/^(st\.?)?(\d+)(?:\/(\d+))?$/);
  if (!match) return null;
  return `${match[1] ? 'st.' : ''}${Number(match[2])}${match[3] === undefined ? '' : `/${Number(match[3])}`}`;
}

/** Numbers are resolved only inside an explicitly selected cadastre. */
export function resolveParcelList(text, cadastre, properties) {
  const result = { matches: [], unknown: [], invalid: [], duplicates: [], ambiguous: [], requiresCadastre: !cadastre };
  if (!cadastre) return result;
  const normalizeArea = value => normalizeInterestName(value).replace(/^olsany$/, 'olsany u dacic');
  const candidates = properties.filter(property => normalizeArea(property.cadastralArea) === normalizeArea(cadastre));
  const tokens = String(text).replace(/\s*\/\s*/g, '/').replace(/\bst\.?\s*(?=\d)/gi, 'st.').trim().split(/[\s,;]+/).filter(Boolean);
  const seen = new Set();
  const propertyIds = new Set();
  for (const token of tokens) {
    const number = normalizeParcelNumber(token);
    if (!number) { result.invalid.push(token); continue; }
    if (seen.has(number)) { result.duplicates.push(token); continue; }
    seen.add(number);
    const matches = candidates.filter(property => normalizeParcelNumber(property.parcelNumber) === number);
    if (!matches.length) result.unknown.push(token);
    else if (matches.length > 1) result.ambiguous.push({ token, properties: matches });
    else if (!propertyIds.has(matches[0].id)) { result.matches.push(matches[0]); propertyIds.add(matches[0].id); }
  }
  return result;
}
