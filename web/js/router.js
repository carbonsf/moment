// @ts-check
/** Hash router (§3.1, DD-006). Routes like `#/moment/doing/:optionId`, optional `?a=b` query. */

/** Route table: pattern → screen module name (web/js/screens/<name>.js). */
export const ROUTES = [
  ['/install', 'install'],
  ['/home', 'home'],
  ['/moment', 'start'],
  ['/moment/distance', 'distance'],
  ['/moment/surf', 'surf'],
  ['/moment/distract', 'distract'],
  ['/moment/doing/:optionId', 'doing'],
  ['/moment/decide', 'decide'],
  ['/moment/decide/tape', 'tape'],
  ['/moment/decide/thought', 'thought'],
  ['/moment/decide/words', 'words'],
  ['/moment/close', 'close'],
  ['/moment/after', 'after'],
  ['/checkin/:id', 'checkin'],
  ['/lookback', 'lookback'],
  ['/lookback/:momentId', 'detail'],
  ['/lists', 'lists'],
  ['/setup/:item', 'setup'],
  ['/learn', 'learn'],
  ['/settings', 'settings'],
  ['/restore/:token', 'restore'],
  // Reserved for future slow-mode reflection (§18); not routed in v1: '/reflect'
];

/**
 * @typedef {{name:string, path:string, params:Record<string,string>, query:URLSearchParams, hash:string}} Route
 */

/** @param {string} hash @returns {Route|null} */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.replace(/\/+$/, '') || '/';
  const segs = path.split('/').filter(Boolean);
  for (const [pattern, name] of ROUTES) {
    const ps = pattern.split('/').filter(Boolean);
    if (ps.length !== segs.length) continue;
    /** @type {Record<string,string>} */
    const params = {};
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (ps[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { name, path, params, query: new URLSearchParams(queryPart), hash: `#${raw}` };
  }
  return null;
}

/** Whether a route belongs to the active moment flow. @param {string} name */
export function isMomentRoute(name) {
  return ['start', 'distance', 'surf', 'distract', 'doing', 'decide', 'tape', 'thought', 'words', 'close', 'after'].includes(name);
}

/** @param {string} hash @param {{replace?:boolean}} [opts] */
export function navigate(hash, opts = {}) {
  if (!hash.startsWith('#')) hash = `#${hash}`;
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}
