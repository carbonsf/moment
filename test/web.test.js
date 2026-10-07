// Static checks on /web: offline precache completeness, CSP/no-inline, copy rules (§12), version sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../web/js/strings.js';
import { LEARN_CARDS } from '../web/js/content/learn.js';
import { APP_VERSION } from '../web/js/config.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');

test('every shipped asset is precached for offline use (P1)', () => {
  const files = walk(WEB).map((p) => `./${relative(WEB, p)}`).filter((p) => p !== './sw.js' && !p.includes('.DS_Store'));
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `missing from PRECACHE: ${f}`);
});

test('every precached path exists', () => {
  const listed = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
  for (const p of listed) assert.ok(statSync(join(WEB, p)).isFile(), `precached but missing: ${p}`);
});

test('SW cache version matches APP_VERSION', () => {
  assert.ok(sw.includes(`moment-${APP_VERSION}`));
});

test('no inline scripts or styles; CSP present (§17)', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /base-uri 'none'/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style/);
  assert.doesNotMatch(html, /\sstyle=/);
  for (const f of walk(join(WEB, 'js'))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, f);
    assert.doesNotMatch(src, /\.innerHTML\s*=/, f);
    assert.doesNotMatch(src, /(fetch|import)\(\s*['"`]https?:/, f); // no third-party runtime requests
  }
});

/** Every string value in S (functions called with sample args). */
function allStrings(obj, path = 'S') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}.${k}`;
    if (typeof v === 'string') out.push([p, v]);
    else if (typeof v === 'function') {
      let r;
      try { r = v(3, 4, 5, 6); } catch { r = v('Tired', 'rest', 'x', 'y'); }
      out.push([p, String(r)]);
    }
    else if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'string' ? out.push([`${p}[${i}]`, x]) : out.push(...allStrings(x, `${p}[${i}]`))));
    else if (v && typeof v === 'object') out.push(...allStrings(v, p));
  }
  return out;
}

const PRAISE = /\b(great|proud|amazing|awesome|well done|congrats)\b/i;
const SHAME = /\b(relapse|slip|clean|dirty|addict|fail|failed|failure|sober|streak)\b/i;
const DRUG = /\b(meth|drug|drugs|high|using|used|fentanyl|naloxone|narcan|dose|hit|score)\b/i;

test('copy rules: no exclamation points, praise, shame, or clinical words (§12)', () => {
  const strings = [...allStrings(S), ...LEARN_CARDS.map((c) => [`learn.${c.id}`, `${c.title} ${c.body}`])];
  for (const [p, s] of strings) {
    assert.ok(!s.includes('!'), `${p}: exclamation point`);
    assert.doesNotMatch(s, PRAISE, `${p}: praise word`);
    assert.doesNotMatch(s, SHAME, `${p}: shame/clinical word`);
  }
});

test('copy rules: drug words only on After-using and the "I used" option (§12, P3)', () => {
  const allowed = (p) => p.startsWith('S.after.') || p === 'S.close.used' || p === 'S.slider.anchor';
  for (const [p, s] of allStrings(S)) {
    if (allowed(p)) continue;
    assert.doesNotMatch(s, DRUG, `${p}: "${s}"`);
  }
});

test('moment-flow lines are ≤12 words (§12)', () => {
  const flow = ['start', 'distance', 'surf', 'distract', 'doing', 'decide', 'tape', 'thought', 'close', 'steps'];
  for (const [p, s] of allStrings(S)) {
    if (!flow.some((k) => p.startsWith(`S.${k}.`))) continue;
    if (p === 'S.distance.body' || p.startsWith('S.surf.waveSummary') || p === 'S.surf.longText') continue; // body copy, not a line
    if (p === 'S.tape.screens[0]') continue; // final copy given verbatim in §6.3.7 (13 words)
    assert.ok(s.split(/\s+/).filter(Boolean).length <= 12, `${p}: "${s}"`);
  }
});

test('no user-facing literals in screen modules (§12)', () => {
  for (const f of walk(join(WEB, 'js', 'screens'))) {
    const src = readFileSync(f, 'utf8');
    // h('tag', props, 'Literal text') with a capitalized sentence would be a literal.
    const m = src.match(/h\('(?:p|h1|h2|span|button|a|li|label)',[^)]*?,\s*'([A-Z][a-z]+ [a-z][^']*)'\)/);
    assert.equal(m, null, `${relative(WEB, f)}: literal "${m?.[1]}"`);
  }
});
