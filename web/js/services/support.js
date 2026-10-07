// @ts-check
/**
 * Human-support stub (§18). Schema {name, method:"sms"|"tel", number, message}.
 * Stored on the profile (synced, encrypted). UI shows only when FLAGS.humanSupport.
 */
import { FLAGS } from '../config.js';
import { app, saveProfile } from '../state.js';

/** @typedef {{name:string, method:'sms'|'tel', number:string, message:string}} SupportPerson */

export function supportEnabled() {
  return FLAGS.humanSupport;
}

/** @returns {SupportPerson|null} */
export function getSupportPerson() {
  if (!FLAGS.humanSupport) return null;
  const p = /** @type {any} */ (app.profile).supportPerson;
  return p && p.name && p.number ? p : null;
}

/** @param {SupportPerson} p */
export async function saveSupportPerson(p) {
  await saveProfile(/** @type {any} */ ({ supportPerson: p }));
}

/** @param {SupportPerson} p */
export function supportHref(p) {
  const num = p.number.replace(/[^\d+]/g, '');
  if (p.method === 'tel') return `tel:${num}`;
  return `sms:${num}${p.message ? `&body=${encodeURIComponent(p.message)}` : ''}`;
}
