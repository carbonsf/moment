// Static checks on gratitude/web (DD-090): offline precache completeness, CSP/no-inline, Worker URL in the CSP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'gratitude', 'web');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');

test('gratitude: every shipped asset is precached, every precached path exists', () => {
  const files = walk(WEB).map((p) => `./${relative(WEB, p)}`)
    .filter((p) => p !== './sw.js' && !p.includes('.DS_Store') && !p.startsWith('./fonts/OFL-'));
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `missing from PRECACHE: ${f}`);
  const listed = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
  for (const p of listed) assert.ok(statSync(join(WEB, p)).isFile(), `precached but missing: ${p}`);
});

test('gratitude: CSP present, no inline code, Worker URL allowed', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style|\sstyle=/);
  const api = readFileSync(join(WEB, 'js', 'sync.js'), 'utf8').match(/API_BASE = '([^']+)'/)[1];
  assert.match(html, new RegExp(`connect-src [^;]*${api.replace(/[.]/g, '\\.')}`));
  for (const f of walk(join(WEB, 'js'))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]|\.innerHTML\s*=/, f);
  }
});
