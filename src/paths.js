/** Resolve bundled public assets under both an origin root and a Pages project path. */
export function assetUrl(path, base = import.meta.env?.BASE_URL || '/') {
  if (path == null || path === '') return path;
  const value = String(path);
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(value)) return value;
  const prefix = `${base.replace(/\/+$/, '')}/`;
  if (prefix !== '/' && value.startsWith(prefix)) return value;
  return prefix + value.replace(/^\/+/, '');
}
