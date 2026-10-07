// @ts-check
/**
 * Guidance sequencer (§6.3.3, §18). Text renderer implemented; audio is a stub that falls back to text.
 * Lines advance on next() or automatically every 30 s; auto-advance pauses while paused (e.g. a control has focus). DD-010
 */
import { FLAGS } from '../config.js';

export const AUTO_ADVANCE_MS = 30_000;

/**
 * @typedef {{text:string, control?:string}} GuidanceLine
 * @param {{lines:GuidanceLine[], onLine:(line:GuidanceLine, index:number)=>void, mode?:'text'|'audio', loopTo?:number, intervalMs?:number, skip?:(i:number)=>boolean}} opts
 */
export function createGuidance(opts) {
  let mode = opts.mode || 'text';
  if (mode === 'audio' && !FLAGS.audioGuidance) mode = 'text';
  if (mode === 'audio') {
    console.info('TODO: audio guidance renderer (recorded files or a user-recorded message from Setup). Using text.');
    mode = 'text';
  }
  const interval = opts.intervalMs ?? AUTO_ADVANCE_MS;
  const loopTo = opts.loopTo ?? 0;
  let index = -1;
  let paused = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let destroyed = false;

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!paused && !destroyed) timer = setTimeout(() => api.next(), interval);
  };

  /** @param {number} i */
  const show = (i) => {
    index = i;
    opts.onLine(opts.lines[index], index);
    arm();
  };

  /** Next index after i, skipping lines the caller marks unavailable. @param {number} i */
  const after = (i) => {
    for (let n = 0; n < opts.lines.length; n++) {
      i = i + 1 >= opts.lines.length ? loopTo : i + 1;
      if (!opts.skip?.(i)) return i;
    }
    return i;
  };

  const api = {
    get index() { return index; },
    /** @param {number} [from] */
    start(from = 0) { show(opts.skip?.(from) ? after(from) : from); },
    next() { if (!destroyed) show(after(index)); },
    replay() { show(0); },
    pause() { paused++; arm(); },
    resume() { paused = Math.max(0, paused - 1); arm(); },
    destroy() { destroyed = true; if (timer) clearTimeout(timer); },
  };
  return api;
}
