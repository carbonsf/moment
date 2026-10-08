# Handoff: Tide moment flow (DD-083 – DD-087)

## Overview
Replaces the slider + wave across the whole moment flow (Start, Distance, Surf, Distract, Doing, Decide, Play it forward, The thought, Your words, Close, After) with **the tide**: one persistent, full-screen WebGL water layer whose waterline *is* the urge. You rate by dragging the waterline; it breathes at the app's 4 s / 6 s pace; ratings leave tide marks; options hang at depths matching their effort. Three water styles (Glass, Storm, Boil) are chosen per moment via Random / Cycling, mirroring breath visuals (DD-082).

## About these files
`web/` mirrors the repo. Files under `web/js/ui/tide/`, `web/css/tide.css`, `web/fonts/` are **new**; the eleven files in `web/js/screens/` are **drop-in replacements**. They follow the codebase conventions (vanilla ES modules, `// @ts-check`, `h()` helpers, strings in `strings.js`, DD comments, no inline styles — per-frame motion uses CSSOM, which the CSP and `web.test.js` allow). The small edits to existing files are listed below as exact snippets.

`reference/Moment Tide.dc.html` is the HTML prototype these were built from (open it next to `support.js` and the `gl-*.js` files). Treat it as the behavior reference; the `web/` files are the implementation.

Fidelity: **high**. Colors come from `tokens.css` (palette is passed to the shaders from `readPalette()`), plus a few water-specific values noted below.

---

## 1. Copy files
```
web/js/ui/tide/water.js     new   layer, physics, breath, grab input, riders, tide marks
web/js/ui/tide/gl.js        new   WebGL renderer (one context, one program per style)
web/js/ui/tide/shaders.js   new   glass / storm / boil fragment shaders
web/js/ui/tide/styles.js    new   style registry + Random/Cycling picker
web/css/tide.css            new   all tide components + @font-face
web/fonts/*.woff2           new   PT Sans 400/700, Ovo 400 (latin subset, self-hosted)
web/js/screens/start.js     replace
web/js/screens/distance.js  replace
web/js/screens/surf.js      replace
web/js/screens/distract.js  replace
web/js/screens/doing.js     replace
web/js/screens/decide.js    replace
web/js/screens/tape.js      replace
web/js/screens/thought.js   replace
web/js/screens/words.js     replace
web/js/screens/close.js     replace
web/js/screens/after.js     replace
```

## 2. Edits to existing files

**`web/index.html`** — after the components.css link:
```html
<link rel="stylesheet" href="./css/tide.css">
```
CSP needs no change: fonts are same-origin (`font-src` falls back to `default-src 'self'`).

**`web/css/tokens.css`** — replace `--font-body` and add (DD-084):
```css
--font-body: 'PT Sans', system-ui, -apple-system, "Segoe UI", sans-serif;
--font-display: 'Ovo', Georgia, serif;   /* titles, guidance lines, labels — never numbers */
--fs-tide-title: 1.9375rem;
--fs-tide-num: 8.5rem;                    /* Start reading on the surface */
--c-tide-ink: #d6e4e6;                    /* text that sits on water */
--c-tide-ink-2: #a9bfc2;
```

**`web/js/app.js`**
```js
import { mountWater, hideWater, setWaterStyle } from './ui/tide/water.js';
import { resolveStyle } from './ui/tide/styles.js';
```
In `boot()`, right after `applyMotion();`:
```js
mountWater();
```
In `render()`, just before `const mod = await import(...)`:
```js
if (isMomentRoute(route.name)) {
  setWaterStyle(resolveStyle(app.settings.waterStyle, await getActiveMoment()));
  // each moment screen calls setWaterScreen itself
} else {
  hideWater();
}
```
Optional: in `swap()`, the crossfade still applies; the water itself never cuts between screens.

**`web/js/state.js`** — in `startMoment()`, next to the breath pick (DD-085):
```js
import { pickStyleForMoment } from './ui/tide/styles.js';
// …
const wpick = pickStyleForMoment(app.settings.waterStyle, (await app.db.getMeta('waterCycle')) ?? -1);
if (wpick) await app.db.setMeta('waterCycle', wpick.index);
// in the moment object:
waterStyle: wpick ? wpick.id : null,
```

**`web/js/content/defaults.js`** — settings defaults:
```js
waterStyle: 'cycle', // DD-085: glass | storm | boil | random | cycle (per moment)
```

**`web/js/screens/settings.js`** — copy `breathPicker` as `waterPicker` (id `set-water`, `STYLE_CHOICES` from `../ui/tide/styles.js`, labels `S.settings.waterStyles`, label `S.settings.waterStyle`) and add it to the Motion section:
```js
waterPicker(st.waterStyle || 'cycle', (v) => set({ waterStyle: v })),
```

**`web/js/strings.js`** — add a `tide` block and two settings keys:
```js
tide: {
  dragHint: 'Drag the waterline. Higher is stronger.',
  letGo: 'Let go to keep it.',
  rateHint: 'Drag to say where it is',
  in: 'in',
  out: 'out',
  left: 'left',
  soFar: 'so far',
  pullUp: 'Pull the water up to say where it is',
  deeper: 'Deeper · more effort',
  backToWave: 'Back to the wave',
},
// inside settings:
waterStyle: 'Water',
waterStyles: { glass: 'Glass', storm: 'Storm', boil: 'Boil', random: 'Random', cycle: 'Cycling' },
```
These pass the §12 copy tests (no flagged words; `Higher` doesn't match `\bhigh\b`).

**`web/sw.js`** — add to `PRECACHE`, then bump `CACHE_VERSION` to `moment-1.0.6` and `APP_VERSION` in `config.js` to `1.0.6` (a test checks they match; another checks every shipped file is precached):
```js
'./css/tide.css',
'./fonts/PTSans-400.woff2',
'./fonts/PTSans-700.woff2',
'./fonts/Ovo-400.woff2',
'./js/ui/tide/water.js',
'./js/ui/tide/gl.js',
'./js/ui/tide/shaders.js',
'./js/ui/tide/styles.js',
```

Run `npm test` after.

---

## 3. Behavior

### Level mapping
`levelFor(v) = 0.10 + 0.08·v` of viewport height from the bottom (0 → 10 %, 10 → 90 %). `valueAt(L)` rounds back. Per-screen levels: Start = last rating or 30 % before the first; Distance/Surf/Decide/Close = latest rating (40 % if none); Distract 78 %; Doing 24 %; Play it forward 80 % (50 % on prompt 4); The thought 78 % → 40 % when a counter surfaces; Your words 30 %; After 6 %.

### Physics (`water.js`)
- Mean level: damped spring toward the target (`k 14 / c 5.5` at rest, `k 40 / c 12` while grabbing), so the water lags and settles.
- Surface: 64-column 1D wave equation, wave speed² 2600, damping 1.4, restoring 3, 4 substeps per frame, reflective walls, heights clamped ±7.8 % of the screen. Uploaded each frame as a 64×1 luminance texture.
- Grab: pressing anywhere below the top bar (not on a button, link, input, or `.no-grab`) pulls a Gaussian bulge (σ ≈ 9 % width) under the finger toward the finger, so moving sends ripples across. `html.tide-grab` sets `touch-action: none` while a screen accepts grabs.
- Slosh: level acceleration and every screen change inject an antisymmetric mode that then evolves naturally.
- Ambient: a random small impulse every 0.25–0.75 s scaled by the screen's ripple amp.
- Breath (DD-086): level offset `(b − 0.5) · amp`, b on `--wave-rise` / `--wave-fall`. Amp: Surf 5 %, Distance/Doing 3 %, Start/Distract 1.2 %. It fades out while grabbing and back in after. The breath derivative also pushes a cos(2πx) swell so the edges lead.
- Reduced motion: no simulation, no breath, the level jumps, and the shader time freezes.
- Pauses its rAF when the document is hidden. Canvas DPR is capped at 1.5.

### Riders
`ride(el, {offset, x})` adds `.tide-rider` (fixed, top 0, centered in the content column, `pointer-events: none` except buttons) and sets `translate3d(0, surfaceY + offset)` each frame. Used for the Start number (−176 px, read at x 0.2) and handle (−11 px, x 0.83), the Surf reading (+8 px) / breath cue (−34 px, x 0.8) / timer (+84 px), and Doing's "I'm back" (−52 px) and hint (+40 px).

### Screens
- **Start:** nothing shows until the first touch. Dragging shows the number (PT Sans 8.5 rem) plus its anchor word (sand). Release commits the `initial` rating, waits 900 ms, then goes to Distance. Skip is unchanged.
- **Distance:** water at the rating, breathing 3 %. Two frosted pills, Done (strong) and Not right now.
- **Surf:** all of today's logic is kept (guidance sequencer, chips, plan card, rising/long rules, prompt every `ratingPromptSec`, timer from `startedAt`, Keep surfing). The slider is replaced by grabbing; each commit calls `addRating` and redraws the tide marks (dotted sand line, x = time across the content column with the same span rule as wave.js, y = level). Guidance lines crossfade over 300 ms in Ovo 1.5 rem. "in" / "out" rides the surface and fades with each phase. At the delay target the pill dock rises 46 px over 900 ms and Keep surfing appears.
- **Distract:** the water fills to 78 %. Options are sorted low effort first, then medium, behind a "Deeper · more effort" label; `--depth` 0..1 drives size (1.5625 → 1.0625 rem), opacity (1 → 0.28) and blur (0 → 2.3 px past depth 0.35). Picking one: the others sink 30 px, blur and fade; the pick lifts 120 px, scales 1.25 and turns sand over 850 ms, then Doing. Low energy and Something else are unchanged.
- **Doing:** the water drains to 24 %, dims 20 %, and runs at 0.4× time. The title is Ovo (clamp 3.2–4.9 rem). "I'm back" rides the surface: pulling up shows `n · anchor` live, and release saves a `return` rating then goes to Surf after 700 ms. Tapping it returns without a rating, which is today's Skip path.

- **Decide:** the water is still and glassy at the rating (ripple 0.35, 0.5× time, dim 10 %). Three frosted cards (Ovo 1.4375 rem titles), plans in sand Ovo, and "Back to the wave".
- **Play it forward:** the water fills to 80 %. Prompts 1–3 sit 8 / 20 / 33 vh down the glass with underwater dim 0 / 15 / 32 %. Prompt 4 ("if you ride this out") sits above a waterline lowered to 50 % with the dim cleared. The prompt moves over 1.2 s. "Write it (optional)" opens a glass textarea in sand.
- **The thought:** thoughts hang underwater, getting slightly deeper down the list. Tapping one sinks the list 60 px with a 6 px blur, the water drains to 40 %, and after 650 ms the counter surfaces from 180 px below over 1.2 s, in sand Ovo with a 2 px sand rule.
- **Your words:** the water sits at 30 % so your words are in clear air: an Ovo teal label, then sand Ovo 1.6875 rem.
- **Close:** stages crossfade over 380 ms on the same water. Rating: drag the waterline (the number rides it); Next records the rating (DD-055). Outcome: three pills float 74 px above the surface; "Something else" rides 36 px below and opens a quieter row. Triggers use frosted chips. Seeking is a 2×2 grid of tiles. Summary: the water settles to the last rating and the whole moment's tide marks stay on the glass behind the factual line. Offer: stacked pills.
- **After:** the water drains to 6 % in Glass with no ripple, breath or slosh. The copy is unchanged and plain, tel/sms links are teal, and the screen carries no other effects.

### Water styles (`shaders.js`)
- **Glass:** refraction from the surface slope, caustics, light rays, a bright band under the surface.
- **Storm:** choppy fbm surface (chop scales with the level, `0.35 + 1.5·L`), foam on the crests, spray specks above, domain-warped turbulence, sharp caustics, slanted rays, drifting particulate.
- **Boil:** three parallax bubble layers (density and rise speed scale with the level), warm plumes rising (sand), a bumpy popping surface, steam wisps and droplets above.

All three take the palette from tokens and a 30 % vignette.

---

## 4. Design decisions to append to DESIGN_DECISIONS.md
| ID | Decision | Why | Override impact |
|---|---|---|---|
| DD-083 | The tide replaces the slider and wave on Start, Distance, Surf, Distract and Doing: one persistent WebGL layer whose waterline is the 0–10 rating; drag to rate | One continuous object across screens; rating becomes a physical gesture; supersedes DD-029's slider and DD-054's save button on these screens | `ui/tide/water.js`; screens call `setWaterScreen` / `enableGrab` |
| DD-084 | PT Sans for body and all numbers, Ovo for titles, guidance and labels; self-hosted woff2 | Owner choice; self-hosting keeps the no-third-party rule and offline use. Supersedes DD-023 (Dynamic Type still applies via `-apple-system-body` sizing) | `--font-body`, `--font-display` in tokens.css |
| DD-085 | Water style Glass / Storm / Boil, chosen per moment by Random or Cycling (default Cycling), stored on `moment.waterStyle`, `?water=<id>` override | Same pattern as DD-082; keeps the water fresh without switching mid-moment | `ui/tide/styles.js`, `settings.waterStyle` |
| DD-086 | The water level breathes at the wave pace; the breath amp differs per screen and fades out while grabbing | The Surf line "breathe with the wave" needs the water to visibly rise and fall | `BAMP`-equivalent `breath` values in `SCREENS` (water.js) |
| DD-088 | Decide, Play it forward, The thought, Your words, Close and After move onto the tide with per-screen levels; After forces Glass with no motion | One continuous object for the whole moment; After stays plain because its job is safety information | `SCREENS` in water.js, the screen modules |
| DD-087 | Storm chop and Boil bubbles scale with the level | Higher ratings look and feel rougher; intensity is still also shown by number and position (DD-022) | `k` in `shaders.js` |

## 5. Known gaps
- **VoiceOver:** the slider's `aria-valuetext` is gone on these screens. If that matters later, add an `sr-only` native range input bound to `setWaterValue`.
- **Breath visual setting:** it no longer affects the moment flow, but `/lab/` still uses it. Remove it later, or repurpose it.
- **Battery:** check on an older iPhone over a 30-minute moment. If it runs hot, lower the DPR cap in `gl.js` from 1.5 to 1.
