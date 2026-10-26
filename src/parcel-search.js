/** Search within the supplied portfolio only; no external address service. */
export function normalizeSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('cs').replace(/\s*\/\s*/g, '/')
    .replace(/\blv\s*(\d+)/g, 'lv $1')
    .replace(/\bst\.?\s*(\d+)/g, 'st $1')
    .replace(/[^a-z0-9/]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function queryPlan(query) {
  const q = normalizeSearch(query);
  const lvMatch = q.match(/(?:^|\s)lv(?:\s+(\d+))?(?=\s|$)/);
  const rest = q.replace(/(?:^|\s)lv(?:\s+\d+)?(?=\s|$)/, ' ');
  const tokens = rest.split(' ').filter(Boolean);
  return {
    q, lv: lvMatch?.[1] ?? null, explicitLv: !!lvMatch,
    buildingParcel: tokens.includes('st'),
    numbers: tokens.filter(t => /^\d+(?:\/\d+)?$/.test(t)),
    words: tokens.filter(t => !/^\d+(?:\/\d+)?$/.test(t)
      && !['st', 'parcela', 'parc', 'parcelni', 'cislo', 'kn', 'ku', 'c', 'p'].includes(t)),
  };
}

const parcelKey = value => normalizeSearch(value).replace(/^st\s*/, '');
const allWords = (text, words) => words.every(word => text.includes(word));

export function matchesPropertyQuery(property, query, extraText = '') {
  const plan = queryPlan(query);
  if (!plan.q) return true;
  if (plan.lv && String(property.lv) !== plan.lv) return false;
  if (plan.buildingParcel && !/^st\b/.test(normalizeSearch(property.parcelNumber))) return false;
  const number = parcelKey(property.parcelNumber);
  const text = normalizeSearch([
    property.parcelNumber, property.cadastralArea, `LV ${property.lv}`,
    property.landType, property.owner, extraText,
    ...(property.interests || []).map(i => i.name || ''),
  ].join(' '));
  return allWords(text, plan.words) && plan.numbers.every(token =>
    number.includes(token) || (!plan.explicitLv && String(property.lv) === token));
}

function propertyScore(property, plan) {
  const number = parcelKey(property.parcelNumber);
  let score = 30;
  for (const token of plan.numbers) {
    score += number === token ? 140 : number.startsWith(token + '/') ? 100
      : number.startsWith(token) ? 60 : String(property.lv) === token ? 35 : 10;
  }
  if (plan.buildingParcel) score += 15;
  if (plan.lv) score += 15;
  if (normalizeSearch(property.cadastralArea) === plan.q) score += 10;
  return score;
}

/** Suggestions carry propertyIds so callers can fit exact owned parcels. */
export function searchPortfolio({ properties = [], buildings = [], features = [], query = '', limit = 12 } = {}) {
  const plan = queryPlan(query);
  if (!plan.q) return [];
  const mapped = new Set(features.map(f => f.properties?.id).filter(Boolean));
  const matches = properties.filter(p => matchesPropertyQuery(p, query));
  const results = matches.map(p => ({
    type: 'property', id: p.id, label: `Parcela ${p.parcelNumber}`,
    area: p.cadastralArea, lv: String(p.lv), propertyIds: [p.id],
    subtitle: `${p.cadastralArea} · LV ${p.lv} · ${p.landType}`,
    mapped: mapped.has(p.id), score: propertyScore(p, plan),
  }));

  const groups = new Map();
  const areas = new Map();
  for (const p of properties) {
    const key = `${p.cadastralArea}\0${p.lv}`;
    if (!groups.has(key)) groups.set(key, { area: p.cadastralArea, lv: String(p.lv), propertyIds: [] });
    groups.get(key).propertyIds.push(p.id);
    if (!areas.has(p.cadastralArea)) areas.set(p.cadastralArea, []);
    areas.get(p.cadastralArea).push(p.id);
  }
  if (!plan.numbers.length && !plan.explicitLv && plan.words.length) {
    for (const [area, ids] of areas) {
      if (!allWords(normalizeSearch(area), plan.words)) continue;
      results.push({ type: 'area', id: area, area, lv: null,
        label: area, subtitle: `Celá lokalita · ${ids.length} parcel`, propertyIds: ids,
        score: normalizeSearch(area) === plan.q ? 230 : 175 });
    }
  }
  const bareLv = !plan.explicitLv && plan.numbers.length === 1 && !plan.words.length
    ? plan.numbers[0] : null;
  if (plan.explicitLv || bareLv) {
    for (const group of groups.values()) {
      if ((plan.lv || bareLv) && group.lv !== (plan.lv || bareLv)) continue;
      if (!allWords(normalizeSearch(group.area), plan.words)) continue;
      if (plan.explicitLv && plan.numbers.length) continue;
      results.push({ type: 'lv', id: `${group.area}-${group.lv}`, ...group,
        label: `LV ${group.lv} · ${group.area}`,
        subtitle: `Celý list vlastnictví v soupisu · ${group.propertyIds.length} parcel`,
        score: plan.explicitLv ? 240 : 110 });
    }
  }
  for (const building of buildings) {
    const ids = building.relatedPropertyIds || [building.propertyId].filter(Boolean);
    const related = properties.filter(p => ids.includes(p.id));
    if (plan.lv && !related.some(p => String(p.lv) === plan.lv)) continue;
    const text = normalizeSearch([
      building.name, building.cadastralArea, building.parcelNumber,
      building.description, building.address,
    ].join(' '));
    if (!allWords(text, plan.words)) continue;
    if (plan.buildingParcel && !/^st\b/.test(normalizeSearch(building.parcelNumber))) continue;
    const number = parcelKey(building.parcelNumber);
    const textTokens = new Set(text.split(' '));
    if (!plan.numbers.every(n => number.includes(n) || textTokens.has(n))) continue;
    results.push({ type: 'building', id: building.id, label: building.name,
      area: building.cadastralArea, lv: related[0]?.lv || null, propertyIds: ids,
      subtitle: `${building.cadastralArea} · ${building.parcelNumber} · Objekt`,
      score: 120 + (plan.numbers.some(n => textTokens.has(n)) ? 80 : 0),
    });
  }
  results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'cs', { numeric: true })
    || (a.area || '').localeCompare(b.area || '', 'cs'));
  const chosen = results.slice(0, Math.max(1, limit));
  if (matches.length > 1 && !chosen.some(r => r.type === 'area' || r.type === 'lv')) {
    chosen.splice(Math.min(2, chosen.length), 0, {
      type: 'selection', id: 'all-search-matches', label: `Zobrazit ${matches.length} nalezených parcel`,
      subtitle: 'Přiblížit všechny výsledky v mapě', area: null, lv: null,
      propertyIds: matches.map(p => p.id), score: 0,
    });
    if (chosen.length > limit) chosen.pop();
  }
  return chosen;
}
