import { searchPortfolio } from './parcel-search.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let instance = 0;

export function createQuickSearch({ container, properties, buildings = [], features = [],
  onProperty = () => {}, onArea = () => {}, onBuilding = () => {}, onClear = () => {} }) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) throw new Error('Chybí kontejner vyhledávání v mapě.');
  const prefix = `map-quick-${++instance}`;
  root.classList.add('quick-search-host');
  root.innerHTML = `<form class="quick-search-form" role="search" autocomplete="off">
    <label class="quick-search-label" for="${prefix}-input">Hledat v mapě</label>
    <div class="quick-search-field">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input id="${prefix}-input" type="search" role="combobox" aria-autocomplete="list"
        aria-controls="${prefix}-results" aria-expanded="false" aria-describedby="${prefix}-hint"
        placeholder="Parcela, obec, LV nebo dům…" spellcheck="false" autocomplete="off">
      <button type="button" class="quick-search-clear" aria-label="Vymazat hledání v mapě" hidden>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <div class="quick-search-hint" id="${prefix}-hint">Např. 88/2, Strmilov, LV 1555 nebo Tyršova</div>
    <div class="quick-search-panel" hidden>
      <div class="quick-search-panel-label">V celém souboru majetku</div>
      <div id="${prefix}-results" role="listbox" aria-label="Výsledky hledání v mapě"></div>
      <div class="quick-search-help">↑ ↓ vybrat · Enter otevřít · Esc zavřít</div>
    </div>
    <span class="quick-search-announcement" role="status" aria-live="polite"></span>
  </form>`;
  const form = root.querySelector('form');
  const input = root.querySelector('input');
  const clearButton = root.querySelector('.quick-search-clear');
  const panel = root.querySelector('.quick-search-panel');
  const list = root.querySelector('[role="listbox"]');
  const announcement = root.querySelector('[role="status"]');
  let suggestions = [];
  let active = -1;
  let selectedLabel = '';

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function setActive(index) {
    active = index;
    for (const [i, row] of [...list.querySelectorAll('[role="option"]')].entries()) {
      row.setAttribute('aria-selected', String(i === index));
      row.classList.toggle('active', i === index);
      if (i === index) row.scrollIntoView({ block: 'nearest' });
    }
    if (suggestions[index]) input.setAttribute('aria-activedescendant', `${prefix}-option-${index}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function refresh() {
    clearButton.hidden = !input.value;
    if (!input.value.trim() || input.value === selectedLabel) { close(); return; }
    suggestions = searchPortfolio({ properties, buildings, features, query: input.value });
    list.innerHTML = suggestions.length ? suggestions.map((item, index) => {
      const kind = ({ property: 'PARCELA', building: 'OBJEKT', area: 'LOKALITA', lv: 'LIST VLASTNICTVÍ', selection: 'VÝSLEDKY' })[item.type];
      return `<button type="button" role="option" aria-selected="false" tabindex="-1"
        id="${prefix}-option-${index}" data-quick-index="${index}" class="quick-search-result">
        <span class="quick-search-result-kind">${kind}</span>
        <strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.subtitle)}</span>
        ${item.type === 'property' && !item.mapped ? '<small>Geometrie k ověření · dostupný je detail parcely</small>' : ''}
      </button>`;
    }).join('') : '<div class="quick-search-empty">Nic nenalezeno. Zkuste číslo parcely, název obce nebo „LV 1555“.</div>';
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    setActive(suggestions.length ? 0 : -1);
    announcement.textContent = suggestions.length ? `${suggestions.length} návrhů v celém souboru majetku.` : 'Žádné výsledky hledání.';
  }
  function choose(index) {
    const item = suggestions[index];
    if (!item) return;
    input.value = selectedLabel = item.type === 'property' ? `${item.label} · ${item.area}` : item.label;
    clearButton.hidden = false;
    close();
    if (item.type === 'property') onProperty(item.id);
    else if (item.type === 'building') onBuilding(item.id);
    else onArea({ area: item.area, lv: item.lv, propertyIds: [...item.propertyIds], label: item.label });
  }
  function clear() {
    input.value = '';
    selectedLabel = '';
    suggestions = [];
    active = -1;
    clearButton.hidden = true;
    announcement.textContent = '';
    close();
  }
  input.addEventListener('input', () => {
    selectedLabel = '';
    refresh();
    if (!input.value.trim()) onClear();
  });
  input.addEventListener('focus', refresh);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const wasClosed = panel.hidden;
      if (wasClosed) refresh();
      if (suggestions.length) setActive(wasClosed ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!panel.hidden && suggestions.length) choose(active >= 0 ? active : 0);
  });
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const row = event.target.closest('[data-quick-index]');
    if (row) { event.stopPropagation(); choose(Number(row.dataset.quickIndex)); }
  });
  clearButton.addEventListener('click', event => {
    event.stopPropagation(); clear(); onClear(); input.focus();
  });
  const outside = event => { if (!root.contains(event.target)) close(); };
  document.addEventListener('pointerdown', outside);
  return { clear, refresh, focus: () => input.focus(), destroy: () => document.removeEventListener('pointerdown', outside) };
}
