// @ts-check
/** Gratitude: keep what you're grateful for, look back on it. Vanilla ES modules, no build (same shape as Moment). */
import { h, clear, autosize, openSheet } from './dom.js';
import { openDB } from './db.js';
import { mountWater, setLevel, setDim, drop, setStyle, STYLES } from './water.js';
import { startSync, schedule, backupLink, adoptLink, writerId } from './sync.js';

/** @typedef {import('./db.js').Entry} Entry */

// Only shown when asked for ("Prompt me"); each tap moves to the next.
const PROMPTS = [
  'Someone who made today easier.',
  'Something your body did for you.',
  'A moment you’d like to keep.',
  'Something you’d miss if it were gone.',
  'A place, a sound, a taste.',
  'Something you usually walk right past.',
  'Someone you haven’t thanked yet.',
  'Something you have now that you once wished for.',
  'Something that made you laugh.',
  'A comfort you can count on.',
  'A kindness you saw, even one not meant for you.',
  'Something about where you live.',
  'Something you use every day without thinking.',
  'Something you did that you’re glad you did.',
  'Someone who believed in you.',
  'Something someone did so you didn’t have to.',
  'Something outside your window.',
  'A hard thing that taught you something.',
  'Something you’re looking forward to.',
  'A memory that still makes you smile.',
];

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
/** @type {Awaited<ReturnType<typeof openDB>>} */
let db;
/** Live entries (not deleted), oldest first. @type {Entry[]} */
let entries = [];
/** What's in Today's box, so a re-render after sync doesn't lose it. */
let draft = '';

const loadEntries = async () => { entries = (await db.all()).filter((e) => !e.deleted); };
/** Write an entry (stamped for sync), then sync soon. @param {Entry} e */
const save = async (e) => { await db.put({ ...e, updatedAt: Date.now(), writer: writerId() }); schedule(); };

// ---------- Time

/** Local "YYYY-MM-DD". @param {number} ms */
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** "Thursday, October 9" @param {number} ms */
const longDay = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
/** "October 2" (with the year when it isn't this year) @param {number} ms */
const shortDay = (ms) => new Date(ms).toLocaleDateString([], {
  month: 'long', day: 'numeric', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
});
/** @param {number} ms */
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** Stable small hash, so the day's surfaced entry doesn't change on every render. @param {string} s */
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Moment's water styles, one per day in turn (glass, storm, boil, glass…). ?water=<id> overrides for a look. @param {number} ms */
function styleForDay(ms) {
  const o = new URLSearchParams(location.search).get('water');
  if (o && STYLES.includes(o)) return o;
  const d = new Date(ms);
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); // local calendar day number
  return STYLES[n % STYLES.length];
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** Water level for n things kept today: low and empty-ish at 0, rising a step per entry, never over the words. @param {number} n */
const levelFor = (n) => Math.min(0.56, 0.16 + 0.065 * n);

// ---------- Pieces

/** @param {Entry} e @param {{time?:boolean}} [o] */
function keptItem(e, o = {}) {
  return h('li', null, h('button', { type: 'button', class: 'kept', on: { click: () => editEntry(e) } },
    h('span', { class: 'kept-text' }, e.text),
    o.time ? h('span', { class: 'kept-time' }, clock(e.createdAt)) : null));
}

/** Edit or delete one entry in a sheet. @param {Entry} e */
function editEntry(e) {
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'compose-input', rows: 2, maxLength: 2000, 'aria-label': 'Edit' }));
  input.value = e.text;
  let confirming = false;
  const del = h('button', {
    type: 'button', class: 'btn-text',
    on: {
      click: async () => {
        if (!confirming) { confirming = true; del.textContent = 'Tap again to delete'; del.classList.add('is-confirming'); return; }
        await save({ ...e, text: '', deleted: true }); // a tombstone, so the delete reaches other devices
        entries = entries.filter((x) => x.id !== e.id);
        close();
        render({ keepScroll: true });
      },
    },
  }, 'Delete');
  const saveBtn = h('button', {
    type: 'button', class: 'pill pill-sand',
    on: {
      click: async () => {
        const text = input.value.trim();
        if (!text) return;
        const next = { ...e, text };
        await save(next);
        entries = entries.map((x) => (x.id === e.id ? next : x));
        close();
        render({ keepScroll: true });
      },
    },
  }, 'Save');
  input.addEventListener('input', () => { autosize(input); /** @type {HTMLButtonElement} */ (saveBtn).disabled = !input.value.trim(); });
  const close = openSheet({
    title: `${longDay(e.createdAt)} · ${clock(e.createdAt)}`,
    content: [input, h('div', { class: 'sheet-actions' }, del, saveBtn)],
  });
  requestAnimationFrame(() => autosize(input));
}

// ---------- Screens

/** @param {HTMLElement} view */
function renderToday(view) {
  const now = Date.now();
  const today = dayKey(now);
  const todays = entries.filter((e) => dayKey(e.createdAt) === today).reverse();
  setDim(0);
  setLevel(levelFor(todays.length));

  const titleFor = (/** @type {number} */ n) => (n ? 'What else?' : 'What are you grateful for?');
  const heading = h('h1', { class: 'title', tabindex: '-1' }, titleFor(todays.length));
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'compose-input', rows: 2, maxLength: 2000, enterKeyHint: 'done', 'aria-label': 'What are you grateful for?',
  }));
  input.dataset.autofocus = '';
  input.value = draft;
  const keep = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'pill pill-sand', disabled: true }, 'Keep it'));

  // No prompt unless asked. The first tap starts somewhere random; each tap after moves to the next.
  let pi = -1;
  const promptLine = h('p', { class: 'prompt-line', 'aria-live': 'polite', hidden: true });
  const promptBtn = h('button', {
    type: 'button', class: 'btn-text prompt-btn',
    on: {
      pointerdown: (/** @type {Event} */ e) => e.preventDefault(), // keep the keyboard up
      click: () => {
        pi = pi < 0 ? Math.floor(Math.random() * PROMPTS.length) : (pi + 1) % PROMPTS.length;
        promptLine.hidden = false;
        promptLine.classList.remove('is-new');
        void promptLine.offsetWidth; // restart the fade
        promptLine.classList.add('is-new');
        promptLine.textContent = PROMPTS[pi];
        promptBtn.textContent = 'Another';
      },
    },
  }, 'Prompt me');
  const resetPrompt = () => { pi = -1; promptLine.hidden = true; promptBtn.textContent = 'Prompt me'; };
  const list = h('ul', { class: 'kept-list on-water', 'aria-label': 'Kept today' }, todays.map((e) => keptItem(e)));

  const form = /** @type {HTMLFormElement} */ (h('form', {
    class: 'compose',
    on: {
      submit: async (/** @type {Event} */ ev) => {
        ev.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        /** @type {Entry} */
        const e = { id: newId(), text, createdAt: Date.now(), updatedAt: Date.now() };
        await save(e);
        entries.push(e);
        input.value = '';
        draft = '';
        keep.disabled = true;
        autosize(input);
        const li = keptItem(e);
        li.firstElementChild?.classList.add('is-new');
        list.prepend(li);
        const n = list.children.length;
        heading.textContent = titleFor(n);
        setLevel(levelFor(n));
        drop(0.5, 1.3);
        resetPrompt();
        input.focus({ preventScroll: true });
      },
    },
  }, promptLine, input, h('div', { class: 'compose-actions' }, promptBtn, keep)));

  input.addEventListener('input', () => { draft = input.value; keep.disabled = !input.value.trim(); autosize(input); });
  keep.disabled = !draft.trim();
  if (draft) requestAnimationFrame(() => autosize(input));
  // Return keeps it; Shift+Return for a new line.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  view.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'topbar-date' }, longDay(now)),
      h('a', { class: 'topbar-link', href: '#/past' }, 'Look back')),
    heading, form, list,
  );

  // One older entry floats up each day.
  const older = entries.filter((e) => dayKey(e.createdAt) !== today);
  if (older.length) {
    const s = older[hash(today) % older.length];
    view.append(h('aside', { class: 'surfaced', 'aria-label': 'From before' },
      h('p', { class: 'surfaced-label' }, `From ${shortDay(s.createdAt)}`),
      h('p', { class: 'surfaced-text' }, s.text)));
  }
}

/** @param {HTMLElement} view */
function renderPast(view) {
  setDim(0.35);
  setLevel(0.05);

  view.append(
    h('header', { class: 'topbar' }, h('a', { class: 'topbar-link', href: '#/today' }, '‹ Today')),
    h('h1', { class: 'title', tabindex: '-1' }, 'Look back'),
  );

  if (!entries.length) {
    view.append(h('p', { class: 'empty' }, 'Nothing kept yet. It starts with one.'));
  } else {
    const days = /** @type {Map<string, Entry[]>} */ (new Map());
    for (const e of [...entries].reverse()) {
      const k = dayKey(e.createdAt);
      if (!days.has(k)) days.set(k, []);
      days.get(k)?.push(e);
    }
    const first = entries[0].createdAt;
    view.append(
      h('p', { class: 'count-line' }, `${entries.length} kept since ${shortDay(first)}`),
      h('div', { class: 'days' }, [...days.values()].map((list) => h('section', { class: 'day' },
        h('h2', { class: 'day-title' }, longDay(list[0].createdAt)),
        h('ul', { class: 'kept-list' }, [...list].reverse().map((e) => keptItem(e, { time: true })))))),
    );
  }

  const status = h('p', { class: 'notice', role: 'status' });
  const file = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'application/json,.json', hidden: true }));
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const n = await importJSON(await f.text());
      status.textContent = n ? `Added ${n}.` : 'Nothing new in that file.';
      if (n) setTimeout(() => render({ keepScroll: true }), 900);
    } catch (e) {
      console.warn(e);
      status.textContent = 'That file couldn’t be read.';
    }
  });
  view.append(
    h('nav', { class: 'data-links', 'aria-label': 'Your data' },
      h('button', { type: 'button', class: 'link', on: { click: exportJSON } }, 'Export'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', class: 'link', on: { click: () => file.click() } }, 'Import'),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('button', { type: 'button', class: 'link', on: { click: openBackup } }, 'Backup link')),
    status, file,
  );
  if (db.memory) status.textContent = 'This browser isn’t saving. Export before you close it.';
}

// ---------- Data

/** The backup link, and a place to paste one (a Home Screen app can't be opened by a link). */
function openBackup() {
  const link = backupLink();
  const copy = h('button', {
    type: 'button', class: 'pill',
    on: { click: async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select it above to copy'; } } },
  }, 'Copy link');
  const paste = /** @type {HTMLInputElement} */ (h('input', { class: 'paste-input', type: 'url', placeholder: 'Paste a backup link', autocomplete: 'off', 'aria-label': 'Paste a backup link' }));
  const msg = h('p', { class: 'notice', role: 'status' });
  const use = h('button', {
    type: 'button', class: 'btn-text',
    on: {
      click: async () => {
        if (!(await adoptLink(paste.value))) { msg.textContent = 'That isn’t a backup link.'; return; }
        await loadEntries();
        close();
        render({ keepScroll: true });
      },
    },
  }, 'Use this link');
  const close = openSheet({
    title: 'Backup link',
    content: [
      h('p', { class: 'muted small' }, 'Your entries are backed up, encrypted, as you write. To bring them to a new phone, open this link there, or paste it below in Gratitude. Anyone with the link can read your entries, so keep it private.'),
      h('p', { class: 'backup-link' }, link),
      h('div', { class: 'sheet-actions' }, h('span'), copy),
      h('p', { class: 'muted small' }, 'Moment’s link works here too: both apps then share one backup.'),
      paste,
      h('div', { class: 'sheet-actions' }, msg, use),
    ],
  });
}

async function exportJSON() {
  const body = JSON.stringify({ app: 'gratitude', version: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
  const name = `gratitude-${dayKey(Date.now())}.json`;
  const blob = new Blob([body], { type: 'application/json' });
  // On iPhone the share sheet is the way to save a file (Files, AirDrop, Mail).
  const shareFile = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [shareFile] })) {
    try { await navigator.share({ files: [shareFile] }); return; } catch (e) { if (/** @type {any} */ (e)?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Merge entries from an export; returns how many were new. @param {string} text */
async function importJSON(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(list)) throw new Error('no entries');
  const have = new Set(entries.map((e) => e.id));
  /** @type {Entry[]} */
  const fresh = list
    .filter((e) => e && typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.id) && typeof e.text === 'string' && e.text.trim()
      && Number.isFinite(e.createdAt) && !e.deleted && !have.has(e.id))
    .map((e) => ({ id: e.id, text: e.text, createdAt: e.createdAt, updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : e.createdAt, writer: writerId() }));
  if (fresh.length) {
    await db.putMany(fresh);
    schedule();
    entries = [...entries, ...fresh].sort((a, b) => a.createdAt - b.createdAt);
  }
  return fresh.length;
}

// ---------- Shell

/** @param {{keepScroll?:boolean}} [o] keepScroll after an edit or a sync, so the page doesn't jump to the top */
function render(o = {}) {
  const y = window.scrollY;
  const typing = document.activeElement?.matches?.('.view textarea');
  const route = location.hash === '#/past' ? 'past' : 'today';
  const view = h('div', { class: 'view' });
  if (route === 'past') renderPast(view);
  else renderToday(view);
  clear(root).append(view);
  if (o.keepScroll) {
    window.scrollTo(0, y);
    if (typing) /** @type {HTMLElement|null} */ (view.querySelector('[data-autofocus]'))?.focus({ preventScroll: true });
    return;
  }
  window.scrollTo(0, 0);
  // Today opens with the cursor in the box; elsewhere focus the heading (VoiceOver).
  /** @type {HTMLElement|null} */ (view.querySelector('[data-autofocus]') || view.querySelector('h1'))?.focus({ preventScroll: true });
}

function applyMotion() {
  const sys = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.dataset.motion = sys ? 'reduce' : 'full';
}

async function boot() {
  applyMotion();
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
  mountWater();
  setStyle(styleForDay(Date.now()));
  db = await openDB();
  await loadEntries();
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }

  await startSync(db, async () => { await loadEntries(); render({ keepScroll: true }); });
  // Opened from a backup link: take on that identity, then drop the secret from the address bar.
  if (location.hash.startsWith('#/restore/')) {
    const token = location.hash;
    history.replaceState(null, '', '#/today');
    if (await adoptLink(token)) await loadEntries();
  }
  if (location.hash !== '#/past' && location.hash !== '#/today') history.replaceState(null, '', '#/today');
  window.addEventListener('hashchange', async () => {
    if (location.hash.startsWith('#/restore/')) {
      const token = location.hash;
      history.replaceState(null, '', '#/today');
      if (await adoptLink(token)) await loadEntries();
    }
    render();
  });
  // Coming back on a new day: start the day fresh.
  let shownDay = dayKey(Date.now());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const d = dayKey(Date.now());
    if (d !== shownDay) { shownDay = d; setStyle(styleForDay(Date.now())); render(); }
  });
  // Touching empty space drops a ripple into the water.
  document.addEventListener('pointerdown', (e) => {
    if (/** @type {Element} */ (e.target).closest?.('button, a, input, textarea, label, .sheet-root')) return;
    drop(e.clientX / window.innerWidth, 0.6);
  });
  render();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('SW registration failed', e));
}

boot();
