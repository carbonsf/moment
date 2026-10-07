# Design queue

Open design questions to revisit in the design pass. Each item links to where it can be seen live.

## 1. Breathing visual (DD-081)

Which visual carries the breath on Surf and Doing? All six share one curve (4 s in, 6 s out), sit under the ratings plot on Surf, and draw a still frame under Reduce Motion. The default stays **Wave** until one is chosen.

**Where to look**
- Side by side, live: [`/lab/`](https://carbonsf.github.io/moment/lab/) (all six, with the breath phase readout)
- In context: Settings → Motion → Breathing visual, or open the app with `?breath=<id>`
- Design canvas with one artboard per visual and tweak sliders: https://claude.ai/artifact/3jighyP841DfRG32f9Ynm1 (private to you until shared)

| id | Name | Technique | Levers worth tuning |
|---|---|---|---|
| `wave` | Wave | Filled sine band; height follows the breath | Band height, phase drift |
| `silk` | Silk | 9 counter-rotating fabric shells, 3 fold strokes each (moiré), string-art weave, additive blend; ripple depth ∝ (1 − breath)², so the cloth goes slack on the exhale | Layer count, ripple depth, weave density, sand↔teal balance |
| `ink` | Ink | GPU domain-warped fbm, fbm(p + k·fbm(p + k·fbm(p))); warp gain and zoom breathe | Warp gain, zoom range, contrast, mask size |
| `shallows` | Shallows | GPU Voronoi F2−F1 ridges in two interfering, swell-warped layers with chromatic dispersion; a band of light rises with the inhale | Ridge width, warp, dispersion, tide height |
| `pendulum` | Pendulum | Damped harmonograph, detuned 2:3 / 3:2, three phase-offset passes, additive; slowly precesses, never repeats | Frequency ratios, damping, stroke weight |
| `murmuration` | Murmuration | 900 particles in a curl-noise flow with ring steering and swirl; time-based motion-blur trails; opens on the inhale, gathers on the exhale | Count, trail length, swirl, ring size |

**Questions for the pass**
- Does the plot stay legible over the busier visuals (Ink, Shallows)? If not: dim the backdrop under the plot, or show the visual only on Doing.
- Battery/heat on an older iPhone during a 15–45 min moment (the WebGL ones render at ≤1.5× DPR).
- Should the visual follow the person's chosen breath pace (a future setting) rather than the fixed 4/6?

**How to change it**
- Code: `web/js/ui/breath/<id>.js` (renderer contract in `common.js`), registry in `index.js`.
- Colors come from `tokens.css` (`--c-bg`, `--c-accent`, `--c-sand`, `--c-text`), so a palette change carries through.
- To drop one: remove it from `VISUALS` in `index.js` and its label in `strings.js`.

## 2. Scroll affordance (DD-079)

Placeholder bottom fade + chevron. Restyle via `.scroll-hint` / `--scroll-hint-h`, or replace (e.g. a sticky action bar on long screens).

## 3. Update prompt (DD-080)

Placeholder banner at the top. Restyle via `.banner-update`; consider moving to a toast or into Settings → About.
