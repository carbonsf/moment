// @ts-check
/**
 * Water style registry (DD-083). Same Random / Cycling pattern as breath visuals (DD-082):
 * a mode picks one style when the moment starts and stores it on the moment, so every screen agrees.
 * ?water=<id> overrides for design review.
 */
export const STYLE_IDS = ['glass', 'storm', 'boil'];
export const STYLE_CHOICES = [...STYLE_IDS, 'random', 'cycle'];

/**
 * @param {string} setting @param {number} lastIndex index used by the previous moment (-1 if none)
 * @returns {{id:string, index:number}|null} null when the setting is a fixed style
 */
export function pickStyleForMoment(setting, lastIndex) {
  const n = STYLE_IDS.length;
  if (setting === 'random') {
    const prev = lastIndex >= 0 && lastIndex < n ? lastIndex : -1;
    let index = Math.floor(Math.random() * (prev >= 0 ? n - 1 : n));
    if (prev >= 0 && index >= prev) index++;
    return { id: STYLE_IDS[index], index };
  }
  if (setting === 'cycle') {
    const index = (((lastIndex ?? -1) + 1) % n + n) % n;
    return { id: STYLE_IDS[index], index };
  }
  return null;
}

/** @param {string|undefined|null} setting @param {{waterStyle?:string|null}|null} [moment] @returns {string} */
export function resolveStyle(setting, moment) {
  try {
    const o = new URLSearchParams(location.search).get('water');
    if (o && STYLE_IDS.includes(o)) return o;
  } catch { /* no location */ }
  if (setting === 'random' || setting === 'cycle') {
    return moment?.waterStyle && STYLE_IDS.includes(moment.waterStyle) ? moment.waterStyle : 'glass';
  }
  return setting && STYLE_IDS.includes(setting) ? setting : 'glass';
}
