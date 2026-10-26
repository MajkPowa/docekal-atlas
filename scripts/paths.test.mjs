import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assetUrl } from '../src/paths.js';

const base = '/docekal-atlas/';
assert.equal(assetUrl('/data/properties.json', base), '/docekal-atlas/data/properties.json');
assert.equal(assetUrl('photos/image.jpg', base), '/docekal-atlas/photos/image.jpg');
assert.equal(assetUrl('/posudek.pdf#page=38', base), '/docekal-atlas/posudek.pdf#page=38');
assert.equal(assetUrl('/media/ortho/example.svg?version=2', base), '/docekal-atlas/media/ortho/example.svg?version=2');
assert.equal(assetUrl('/docekal-atlas/photos/image.jpg', base), '/docekal-atlas/photos/image.jpg', 'Already resolved assets must not receive the base twice.');
assert.equal(assetUrl('/data/properties.json', '/'), '/data/properties.json', 'Original root-hosted deployments must keep working.');
assert.equal(assetUrl('/data/properties.json'), '/data/properties.json');
for (const path of ['https://example.com/map?x=1', '//example.com/map', 'data:image/png;base64,AA==', 'blob:https://example.com/id', '#section', '?query=1']) {
  assert.equal(assetUrl(path, base), path, 'External and document-local URLs must not be rewritten.');
}
assert.equal(assetUrl(undefined, base), undefined);
assert.equal(assetUrl('', base), '');

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const json = filename => JSON.parse(readFileSync(new URL(`../public/data/${filename}`, import.meta.url), 'utf8'));
const inventory = json('properties.json');
const catalog = json('photo-catalog.json');
const parcelMedia = json('parcel-media.json');
const urls = [
  ...inventory.buildings.map(building => building.photoUrl),
  ...(catalog.items || catalog.photos || []).flatMap(item => [item.src, item.overlaySrc, item.sourceUrl]),
  ...parcelMedia.items.flatMap(item => [item.src, item.overlaySrc, item.sourceUrl]),
  '/posudek.pdf', '/sources/pozemkove-upravy-2026.pdf',
  '/fonts/ui/roboto-0.woff2', '/fonts/ui/roboto-1.woff2', '/atlas-field.svg',
].filter(url => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'));
for (const url of urls) {
  const resolved = assetUrl(url, base);
  assert.ok(resolved.startsWith(base), `${url} must stay beneath the Pages project path.`);
  const publicPath = resolved.slice(base.length).split(/[?#]/)[0];
  assert.ok(existsSync(publicRoot + publicPath), `${url} must refer to a real bundled file.`);
}
console.log(`Pages paths: root/project bases, idempotence, external URLs and ${urls.length} bundled media/source references passed.`);
