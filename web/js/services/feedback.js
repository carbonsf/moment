// @ts-check
/** Haptics stub (§18). No-ops; future native-wrapper hook. iOS Safari lacks the Vibration API. */
import { FLAGS } from '../config.js';

/** Light tick, e.g. slider step. */
export function tick() {
  if (!FLAGS.haptics) return;
}

/** Soft cue, e.g. rating prompt. */
export function soft() {
  if (!FLAGS.haptics) return;
}
