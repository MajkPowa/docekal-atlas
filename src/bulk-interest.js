import { customInterestsFor, normalizeInterestName, resolveParcelList } from './interest-store.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const format = value => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(value);

export function createBulkInterest({ properties, getSelectedIds = () => [], getFilteredIds = () => [], getInterests = () => [], onSave, onSelection, iconsNow = () => {}, buyers = {}, statusLabels = {} }) {
  const propertyById = new Map(properties.map(property => [property.id, property]));
  const cadastres = [...new Set(properties.map(property => property.cadastralArea))].sort((a, b) => a.localeCompare(b, 'cs'));
  const dialog = document.createElement('dialog');
  dialog.className = 'bulk-dialog';
  dialog.setAttribute('aria-labelledby', 'bulk-title');
  dialog.innerHTML = `
    <header class="bulk-header"><div><span class="bulk-eyebrow">NOVÝ ZÁJEM / VÍCE PARCEL</span><h2 id="bulk-title">Přidat hromadný zájem</h2><p>Vyberte parcely, doplňte zájemce a zkontrolujte rozsah zápisu.</p></div><button type="button" class="bulk-close" aria-label="Zavřít hromadný zájem"><i data-lucide="x"></i></button></header>
    <form class="bulk-form">
      <div class="bulk-body"><div class="bulk-grid">
        <section class="bulk-party"><h3>1. Zájemce a podmínky</h3>
          <label for="bulk-name">Jméno nebo název zájemce</label><input id="bulk-name" name="name" list="bulk-known-buyers" required maxlength="100" autocomplete="off" placeholder="Např. Jan Novák / název společnosti"><datalist id="bulk-known-buyers"></datalist>
          <label for="bulk-status">Stav zájmu</label><select id="bulk-status" name="status">${['confirmed', 'considering', 'conditional', 'lease'].map(status => `<option value="${status}">${escapeHtml(statusLabels[status] || ({ confirmed: 'Projevený zájem', considering: 'Zvažovaný zájem', conditional: 'Podmíněný zájem', lease: 'Žádost o pacht' })[status])}</option>`).join('')}</select>
          <label for="bulk-note">Poznámka <span>(volitelné)</span></label><textarea id="bulk-note" name="note" maxlength="2000" rows="4" placeholder="Cena, podmínky nebo návaznost na další pozemky…"></textarea>
          <p class="bulk-hint">Nový zápis se přidá k dosavadním zájmům. Stejný zájemce se stejným stavem se podruhé nevloží.</p>
        </section>
        <section class="bulk-targets"><h3>2. Vyberte parcely</h3>
          <fieldset class="bulk-modes"><legend class="sr-only">Způsob výběru parcel</legend>
            <label><input type="radio" name="bulk-mode" value="selected"><span>Označené parcely <b id="bulk-selected-count">0</b></span></label>
            <label><input type="radio" name="bulk-mode" value="filtered"><span>Aktuální výsledek filtrů <b id="bulk-filtered-count">0</b></span></label>
            <label><input type="radio" name="bulk-mode" value="paste"><span>Vložit seznam parcel</span></label>
          </fieldset>
          <div class="bulk-paste-fields" hidden><label for="bulk-cadastre">Katastrální území seznamu</label><select id="bulk-cadastre"><option value="">Vyberte katastrální území…</option>${cadastres.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}</select>
          <label for="bulk-parcels">Parcelní čísla</label><textarea id="bulk-parcels" rows="3" maxlength="10000" placeholder="88/2, 91, 96, 97, 107"></textarea><p class="bulk-hint">Oddělujte čárkou, mezerou nebo novým řádkem. Stavební parcelu pište např. <strong>st. 407</strong>. Jeden seznam patří do jednoho katastru.</p></div>
          <div class="bulk-match-notices" aria-live="polite"></div>
          <div class="bulk-preview-head"><strong id="bulk-preview-label">Kontrola parcel</strong><button type="button" class="bulk-select-preview">Označit všechny</button></div>
          <div class="bulk-preview" role="group" aria-labelledby="bulk-preview-label"></div>
        </section>
      </div><div class="bulk-review" aria-live="polite"></div><label class="bulk-ack" hidden><input type="checkbox" id="bulk-ack"><span>Uložit jen označené nalezené parcely. Nenalezené a nejednoznačné položky vynechat.</span></label><p class="bulk-error" role="alert" hidden></p></div>
      <footer class="bulk-footer"><p>Vlastní zájmy se ukládají v tomto prohlížeči a zahrnují do exportu CSV.</p><div><button type="button" class="btn bulk-cancel">Zrušit</button><button type="submit" class="btn primary bulk-save" disabled>Přidat zájem</button></div></footer>
    </form>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let mode = 'paste';
  let explicitIds = null;
  let candidateProperties = [];
  let selectedIds = new Set();
  let hasUnresolved = false;
  let busy = false;

  function interestsFor(property) {
    const value = getInterests(property);
    return Array.isArray(value) ? value : customInterestsFor(value);
  }

  function modeIds() {
    if (mode === 'selected') return explicitIds ?? getSelectedIds();
    return getFilteredIds();
  }

  function warning(title, values) {
    if (!values.length) return '';
    return `<p><strong>${title} (${values.length}):</strong> ${values.map(escapeHtml).join(', ')}</p>`;
  }

  function refreshCandidates() {
    let notice = '';
    hasUnresolved = false;
    $('.bulk-ack').hidden = true;
    $('#bulk-ack').checked = false;
    if (mode === 'paste') {
      const result = resolveParcelList($('#bulk-parcels').value, $('#bulk-cadastre').value, properties);
      candidateProperties = result.matches;
      hasUnresolved = !!(result.unknown.length || result.invalid.length || result.ambiguous.length);
      if (result.requiresCadastre) notice = '<p>Nejprve vyberte katastrální území.</p>';
      notice += warning('Nenalezené v soupisu', result.unknown);
      notice += warning('Neplatné položky', result.invalid);
      notice += warning('Nejednoznačné položky', result.ambiguous.map(item => item.token));
      if (result.duplicates.length) notice += `<p class="bulk-duplicate-note">${result.duplicates.length} opakovaných položek je v přehledu pouze jednou.</p>`;
      $('.bulk-ack').hidden = !hasUnresolved;
    } else {
      candidateProperties = [...new Set(modeIds())].map(id => propertyById.get(id)).filter(Boolean);
      if (!candidateProperties.length) notice = mode === 'selected' ? '<p>V tabulce zatím nejsou označené parcely. Zvolte výsledek filtrů nebo vložte seznam.</p>' : '<p>Aktuálním filtrům neodpovídá žádná parcela.</p>';
    }
    selectedIds = new Set(candidateProperties.map(property => property.id));
    $('.bulk-paste-fields').hidden = mode !== 'paste';
    $('.bulk-match-notices').innerHTML = notice;
    renderPreview();
  }

  function renderPreview() {
    $('.bulk-preview').innerHTML = candidateProperties.length ? candidateProperties.map(property => {
      const interests = interestsFor(property);
      return `<label class="bulk-preview-row"><input type="checkbox" data-bulk-parcel="${escapeHtml(property.id)}" ${selectedIds.has(property.id) ? 'checked' : ''}><span><strong>${escapeHtml(property.parcelNumber)}</strong><small>${escapeHtml(property.cadastralArea)} · LV ${escapeHtml(property.lv)}</small></span><span class="bulk-row-info">${format(property.areaM2)} m²${interests.length ? `<small>${interests.length} ${interests.length === 1 ? 'dosavadní zájem' : 'dosavadní zájmy'}</small>` : '<small>Bez evidovaného zájmu</small>'}</span></label>`;
    }).join('') : '<p class="bulk-empty">Nalezené parcely se zobrazí zde. Před uložením můžete jednotlivé položky odznačit.</p>';
    $('.bulk-select-preview').disabled = !candidateProperties.length;
    updateReview();
  }

  function updateReview() {
    const targets = candidateProperties.filter(property => selectedIds.has(property.id));
    const name = $('#bulk-name').value.trim();
    const sameName = record => normalizeInterestName(record.name || buyers[record.buyer]?.name || '') === normalizeInterestName(name);
    const sameStatus = record => sameName(record) && record.status === $('#bulk-status').value;
    const duplicateCount = name ? targets.filter(property => interestsFor(property).some(sameStatus)).length : 0;
    const overlapCount = targets.filter(property => interestsFor(property).some(record => !name || !sameName(record))).length;
    const area = targets.reduce((sum, property) => sum + Number(property.areaM2 || 0), 0);
    $('.bulk-review').innerHTML = `<div><span>ROZSAH ZÁPISU</span><strong>${targets.length} ${targets.length === 1 ? 'parcela' : targets.length < 5 ? 'parcely' : 'parcel'} · ${format(area / 10000)} ha</strong></div><p>${overlapCount ? `Na ${overlapCount} parcelách už je evidován další zájem. ` : ''}${duplicateCount ? `${duplicateCount} shodných zápisů se přeskočí; jejich poznámky se nepřepíší.` : 'Dosavadní zájmy a poznámky zůstanou zachované.'}</p>`;
    $('.bulk-select-preview').textContent = selectedIds.size === candidateProperties.length && candidateProperties.length ? 'Odznačit všechny' : 'Označit všechny';
    $('.bulk-save').textContent = busy ? 'Ukládám…' : `Přidat zájem k ${targets.length} ${targets.length === 1 ? 'parcele' : 'parcelám'}`;
    $('.bulk-save').disabled = busy || !targets.length || !name || (hasUnresolved && !$('#bulk-ack').checked);
  }

  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('.bulk-close,.bulk-cancel')) { if (!busy) dialog.close(); }
    if (event.target.closest('.bulk-select-preview')) {
      selectedIds = selectedIds.size === candidateProperties.length ? new Set() : new Set(candidateProperties.map(property => property.id));
      if (mode === 'selected' && onSelection) onSelection([...selectedIds]);
      renderPreview();
    }
  });
  dialog.addEventListener('change', event => {
    if (event.target.name === 'bulk-mode') { mode = event.target.value; refreshCandidates(); }
    if (event.target.id === 'bulk-cadastre') refreshCandidates();
    if (event.target.hasAttribute('data-bulk-parcel')) {
      const id = event.target.dataset.bulkParcel;
      if (event.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      if (mode === 'selected' && onSelection) onSelection([...selectedIds]);
      updateReview();
    }
    if (event.target.id === 'bulk-status' || event.target.id === 'bulk-ack') updateReview();
  });
  dialog.addEventListener('input', event => {
    $('.bulk-error').hidden = true;
    if (event.target.id === 'bulk-parcels') refreshCandidates();
    if (event.target.id === 'bulk-name') updateReview();
  });
  $('.bulk-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || $('.bulk-save').disabled || !$('.bulk-form').reportValidity()) return;
    busy = true;
    updateReview();
    try {
      const result = await onSave({ ids: [...selectedIds], name: $('#bulk-name').value.trim(), status: $('#bulk-status').value, note: $('#bulk-note').value.trim() });
      if (result === false || result?.error) throw new Error(result?.error || 'Zápis se nepodařilo uložit. Zkuste to znovu.');
      dialog.close();
    } catch (error) {
      $('.bulk-error').textContent = error.message || 'Zápis se nepodařilo uložit.';
      $('.bulk-error').hidden = false;
    } finally {
      busy = false;
      updateReview();
    }
  });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });

  function refreshSelection() {
    $('#bulk-selected-count').textContent = (explicitIds ?? getSelectedIds()).length;
    $('#bulk-filtered-count').textContent = getFilteredIds().length;
  }

  function open({ ids } = {}) {
    if (dialog.open) return;
    explicitIds = ids ? [...new Set(ids)].filter(id => propertyById.has(id)) : null;
    $('.bulk-form').reset();
    $('.bulk-error').hidden = true;
    const selected = explicitIds ?? getSelectedIds();
    mode = selected.length ? 'selected' : 'paste';
    $(`input[name="bulk-mode"][value="${mode}"]`).checked = true;
    const names = new Set(Object.values(buyers).map(buyer => buyer.name));
    for (const property of properties) for (const record of interestsFor(property)) if (record.name) names.add(record.name);
    $('#bulk-known-buyers').innerHTML = [...names].sort((a, b) => a.localeCompare(b, 'cs')).map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
    $('#bulk-selected-count').textContent = selected.length;
    $('#bulk-filtered-count').textContent = getFilteredIds().length;
    refreshCandidates();
    dialog.showModal();
    $('#bulk-name').focus();
    iconsNow();
  }
  return { open, refreshSelection };
}
