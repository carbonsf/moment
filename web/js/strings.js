// @ts-check
/**
 * Every user-facing string (§12, P10). Keyed by screen. Screen modules MUST NOT contain literals.
 * Copy rules: second person, present tense, sentence case, no exclamation points,
 * no praise words, no shame/clinical words, no drug words outside `after` and `close.used`. DD-035
 */

/** @param {number} v */
function anchor(v) {
  // DD-029
  if (v <= 0) return 'Nothing';
  if (v <= 2) return 'Faint';
  if (v <= 4) return 'Noticeable';
  if (v <= 6) return 'Strong';
  if (v <= 8) return 'Very strong';
  return 'Most ever';
}

export const S = {
  appName: 'Moment',

  common: {
    moreHelp: 'More help',
    back: 'Back',
    next: 'Next',
    skip: 'Skip',
    done: 'Done',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    notNow: 'Not now',
    edit: 'Edit',
    delete: 'Delete',
    hide: 'Hide',
    show: 'Show',
    hidden: 'Hidden',
    moveUp: 'Move up',
    moveDown: 'Move down',
    add: 'Add',
    home: 'Home',
    continue: 'Continue',
    optional: '(optional)',
    moreBelow: 'More below',
    /** @param {number} n */
    charsLeft: (n) => `${n} characters left`,
  },

  banners: {
    memoryMode: 'Saving is off in this browser mode.',
    browserTab: 'Data here stays in this browser tab.',
    exportNow: 'Export',
  },

  slider: {
    anchor,
    /** @param {number} v */
    valueText: (v) => `${v} of 10, ${anchor(v)}`,
    label: 'Intensity, 0 to 10',
    noValue: 'Tap the line to set a number',
    min: '0',
    max: '10',
  },

  install: {
    title: 'Put Moment on your Home Screen',
    steps: [
      'Tap the Share icon in Safari.',
      'Choose "Add to Home Screen".',
      'Open Moment from your Home Screen.',
    ],
    note: 'Your data stays with the Home Screen app. Set it up there.',
    useBrowser: 'Use in the browser anyway',
  },

  home: {
    mainButton: "I'm in a moment",
    /** @param {string} time */
    nextCheckin: (time) => `Next check-in around ${time}`,
    stopForToday: 'Stop for today',
    unfinished: "Your last moment didn't get a check-out. Add one?",
    unfinishedAdd: 'Add one',
    dismiss: 'Dismiss',
    /** @param {number} n */
    cumulative: (n) => `Moments you've stayed with: ${n}`,
    setupTitle: 'When you have a calm minute',
    setupItem: {
      reasons: 'Write down why getting through these moments matters to you.',
      message: 'Write a note from steady you to craving you.',
      thoughts: 'Rewrite the answers to common thoughts in your own words.',
      plans: 'Make an if-then plan for something that sets it off.',
    },
    setupGo: 'Start',
    footer: { lookback: 'Look back', lists: 'My lists', learn: 'Learn', settings: 'Settings' },
  },

  steps: {
    label: 'Steps',
    delay: 'Delay',
    distract: 'Distract',
    decide: 'Decide',
    current: 'current step',
    imDone: "I'm done",
  },

  start: {
    title: 'Where is it right now?',
    skip: 'Skip',
    next: 'Next',
  },

  distance: {
    title: 'First, some distance.',
    body: 'If you can, move away from what set this off. Another room, outside, phone face down.',
    done: 'Done',
    notNow: 'Not right now',
  },

  surf: {
    guidance: [
      "You don't have to do anything with this. Just watch it.",
      'Where do you feel it?',
      "What's it like?",
      'What set it off? (optional)',
      'Breathe with the wave. In as it rises, out as it falls.',
      "Urges build, peak, and pass. You're watching one do that.",
      '', // evidence line, filled at runtime (§10.3)
      'Still here. Still watching.',
    ],
    breathText: 'In… 4. Out… 6.',
    next: 'Next',
    replay: 'Start the lines again',
    ratePrompt: 'Where is it now?',
    /** @param {string} t */
    delayLeft: (t) => `Delay · ${t} left`,
    delayUp: "Delay time's up. Where is it now?",
    delayDone: 'Delay · time is up',
    keepSurfing: 'Keep surfing',
    trySomething: 'Try something',
    talkItThrough: 'Talk it through',
    eased: "It's eased",
    /** @param {string} text */
    planCard: (text) => `Your plan: ${text}`,
    risingTitle: 'This is a big one.',
    risingPlace: 'Change where you are',
    risingEasy: 'Easiest options',
    risingHelp: 'More help',
    longText: 'Long one. You can keep going, or let me check on you through the day.',
    longKeep: 'Keep going',
    longCheck: 'Check on me',
    /** @param {number} n @param {number} a @param {number} b @param {number} p */
    waveSummary: (n, a, b, p) => `${n} ratings. Started at ${a}, now ${b}, peak ${p}.`,
    waveEmpty: 'No ratings yet.',
    waveLabel: 'Wave of your ratings over time',
    bodyLegend: 'Where you feel it',
    sensationLegend: "What it's like",
    triggerLegend: 'What set it off',
  },

  evidence: {
    /** @param {number} p @param {number} h */
    full: (p, h) => `Your recent moments peaked around ${p} min and eased by half around ${h} min.`,
    /** @param {number} p */
    peakOnly: (p) => `Your recent moments peaked around ${p} min.`,
  },

  trend: {
    faster: 'Lately they’re easing faster than before.',
    slower: 'Lately they’re taking longer to ease. Hard stretches happen.',
    same: 'About the same as before.',
  },

  body: {
    head: 'Head', jaw: 'Jaw', throat: 'Throat', chest: 'Chest', stomach: 'Stomach',
    hands: 'Hands', legs: 'Legs', whole: 'Whole body', unsure: 'Not sure',
  },
  sensation: {
    tight: 'Tight', hot: 'Hot', buzzing: 'Buzzing', restless: 'Restless', heavy: 'Heavy',
    hollow: 'Hollow', racing: 'Racing', other: 'Something else',
  },
  category: { body: 'Body', place: 'Place', hands: 'Hands', mind: 'Mind' },
  triggerGroup: { halt: 'Hungry, angry, lonely, tired', context: 'Around you' },

  distract: {
    title: "Pick one. Go do it. Come back when you're done.",
    lowEnergy: 'Low energy',
    somethingElse: 'Something else',
    addLabel: 'What will you do?',
    addSave: 'Add and pick it',
    empty: 'Nothing here with this filter.',
  },

  doing: {
    go: "Go. I'll be here.",
    back: "I'm back",
    other: 'Pick something else',
    /** @param {string} t */
    elapsed: (t) => `${t} so far`,
    ratePrompt: 'Where is it now?',
    saveRating: 'Back to the wave',
    skipRating: 'Skip',
  },

  decide: {
    title: 'Talk it through',
    tape: 'Play it forward',
    tapeSub: 'Walk through the next few hours.',
    thought: 'The thought',
    thoughtSub: 'Name the thought that says go ahead.',
    words: 'Your words',
    wordsSub: 'What you wrote when things were calmer.',
    plans: 'Your plans',
    /** @param {string} trig @param {string} then */
    planLine: (trig, then) => `If ${trig.toLowerCase()}, then ${then}`,
    /** @param {string} then */
    planNoTrigger: (then) => `Then ${then}`,
  },

  tape: {
    screens: [
      'If you went with the urge, what does the next hour look like?',
      'What about tonight?',
      'What about tomorrow morning?',
      'And if you ride this out, what does tomorrow morning look like?',
    ],
    write: 'Write it (optional)',
    noteLabel: 'Your note',
    next: 'Next',
    finish: 'Back to talking it through',
    /** @param {number} i @param {number} n */
    progress: (i, n) => `${i} of ${n}`,
  },

  thought: {
    title: 'Is one of these thoughts here?',
    none: 'None of these',
    another: 'Another thought',
    back: 'Back to talking it through',
  },

  words: {
    reasonsTitle: 'Why this matters to you',
    messageTitle: 'A note to you',
    empty: "You haven't written these yet. When things are calmer, Setup can help.",
    defaults: [
      "This feeling is strong, and it's temporary.",
      'Getting through the next hour is enough.',
    ],
    back: 'Back to talking it through',
  },

  close: {
    rateTitle: 'Where is it now?',
    outcomeTitle: 'Where are you now?',
    passed: 'It passed',
    quieter: "It's quieter",
    strong: 'Still strong',
    somethingElse: 'Something else',
    used: 'I used',
    stopped: 'I had to stop',
    private: 'Rather not say',
    strongTitle: "It's still strong.",
    anotherRound: 'Start another round',
    checkTen: 'Check on me in 10 min',
    continue: 'Continue',
    triggersTitle: 'What set it off?',
    seekingTitle: 'What was the urge trying to get for you?',
    seeking: {
      relief: 'Relief', energy: 'Energy', connection: 'Connection',
      escape: 'Escape', confidence: 'Confidence', other: 'Something else',
    },
    /** @param {string} d @param {number} a @param {number} b */
    summaryDrop: (d, a, b) => `You stayed with it ${d}. It went from ${a} to ${b}.`,
    /** @param {string} d */
    summary: (d) => `You stayed with it ${d}.`,
    offerTitle: 'Want me to check on you today?',
    yes: 'Yes',
    inTen: 'In 10 min',
    noThanks: 'No thanks',
    /** @param {string} t */
    activeTitle: (t) => `Check-ins are on. Next around ${t}.`,
    alsoTen: 'Also in 10 min',
    done: 'Done',
    next: 'Next',
    skip: 'Skip',
  },

  after: {
    title: "You're still here.",
    lead: "The day isn't over. Let's get you through the rest of it safely.",
    // Final copy (§6.5). Phone numbers become tel:/sms: links.
    bullets: [
      { text: 'Try not to be alone. If you are, Never Use Alone ({n}) stays on the line and sends help if you stop responding.', tel: '18004843731', display: '1-800-484-3731' },
      { text: 'Supply can contain fentanyl. Keep naloxone (Narcan) close if you can.' },
      { text: "Call {n} for chest pain, overheating, a seizure, trouble breathing, or if you're scared.", tel: '911', display: '911' },
      { text: 'Drink water. Eat something small. Rest when you can.' },
      { text: '{n} is there if things feel heavy.', tel: '988', sms: '988', display: '988', smsLabel: 'Text 988' },
    ],
    checkLater: 'Check on me later',
    home: 'Home',
  },

  checkin: {
    morning: "Morning. How's today starting?",
    other: "How's the next hour looking?",
    okay: 'Okay',
    rough: 'Rough',
    startMoment: 'Start a moment',
    inTen: 'In 10 min',
    stop: 'Stop for today',
    settingsLink: 'Turn check-ins off in Settings',
    roughTitle: 'What would help right now?',
    pickSomething: 'Pick something to do',
    again30: 'Check again in 30 min',
    notFound: 'This check-in has passed.',
    reach: (/** @type {string} */ name) => `Reach ${name}`,
  },

  notif: {
    deniedTitle: 'Notifications are off, so check-ins will show up when you open Moment.',
    ok: 'Okay',
  },

  lookback: {
    title: 'Look back',
    empty: 'After a few moments, patterns will show up here.',
    summary: 'Summary',
    /** @param {number} m */
    typicalEase: (m) => `They usually ease by half around ${m} min.`,
    waveTitle: 'Your recent waves',
    /** @param {number} n @param {number|null} peakMin */
    waveCaption: (n, peakMin) => `Your last ${n} moments over the first hour, with the middle line in bold.` + (peakMin != null ? ` The middle line peaks around ${peakMin} min.` : ''),
    easingTitle: 'Easing over time',
    /** @param {number} weeks */
    easingCaption: (weeks) => `Typical minutes to ease by half, per week, for the last ${weeks} weeks with enough moments.`,
    whenTitle: 'When',
    /** @param {string} day @param {string} block @param {number} n */
    whenCaption: (day, block, n) => `Most often: ${day} ${block.toLowerCase()} (${n}).`,
    blocks: ['Night', 'Morning', 'Afternoon', 'Evening'],
    blockHours: ['0–6', '6–12', '12–18', '18–24'],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    triggersTitle: 'What sets them off',
    bodyTitle: 'Where you feel it',
    helpTitle: 'What tends to help',
    helpCaption: 'Patterns in your moments, not proof.',
    /** @param {number} d */
    helpDrop: (d) => `typical change ${d > 0 ? '−' : d < 0 ? '+' : ''}${Math.abs(d)}`,
    decideTitle: 'Talking it through',
    /** @param {number} p */
    decidePct: (p) => `${p}% of your moments reached Decide.`,
    seekingTitle: 'What it was after',
    recentTitle: 'Recent moments',
    /** @param {string} label @param {number} n */
    countCaption: (label, n) => `Most common: ${label} (${n}).`,
    /** @param {number} p */
    peak: (p) => `peak ${p}`,
    noPeak: 'no rating',
    tableLabel: 'Data table',
  },

  detail: {
    title: 'Moment',
    curve: 'Your ratings',
    steps: 'Steps taken',
    distract: 'Things you did',
    triggers: 'What set it off',
    body: 'Where you felt it',
    ended: 'How it ended',
    notSet: 'Not set',
    deleteBtn: 'Delete this moment',
    deleteConfirm: 'Delete this moment? This can’t be undone.',
    deleteYes: 'Delete',
    step: { distance: 'Distance', surf: 'Surf', distract: 'Distract', decide: 'Decide', close: 'Close' },
    /** @param {number|null} a @param {number|null} b */
    change: (a, b) => (a == null || b == null ? '' : `${a} → ${b}`),
    missing: 'This moment is no longer here.',
  },

  lists: {
    title: 'My lists',
    tabs: { distract: 'Things to do', triggers: 'What sets it off', thoughts: 'Thoughts' },
    addNew: 'Add new',
    restore: 'Restore defaults',
    labelField: 'Label',
    categoryField: 'Kind',
    effortField: 'Energy',
    effort: { low: 'Low energy', medium: 'Some energy' },
    groupField: 'Group',
    thoughtField: 'Thought',
    counterField: 'Your answer',
    builtIn: 'Built in',
  },

  setup: {
    title: 'Setup',
    reasons: {
      title: 'Why getting through these moments matters to you.',
      placeholder: 'So I can wake up clear tomorrow.',
      add: 'Add a line',
      /** @param {number} n */
      max: (n) => `Up to ${n} lines.`,
    },
    message: {
      title: 'A note from steady you to craving you.',
      placeholder: "I know this feels endless. It isn't. Get to morning.",
    },
    thoughts: {
      title: 'Rewrite the answers in your own words.',
      reviewed: 'Done reviewing',
    },
    plans: {
      title: 'If [trigger], then I’ll…',
      trigger: 'If',
      thenOption: 'Then I’ll',
      orWrite: 'Or write your own',
      add: 'Add plan',
      /** @param {number} n */
      max: (n) => `Up to ${n} plans.`,
      needsReview: 'This plan’s trigger is hidden or gone. Pick another.',
      pickTrigger: 'Pick a trigger',
      pickOption: 'Pick something to do',
    },
    saved: 'Saved.',
    nextItem: 'Next',
    finish: 'Done',
    items: { reasons: 'Reasons', message: 'Message to yourself', thoughts: 'Thoughts and answers', plans: 'If-then plans' },
  },

  learn: { title: 'Learn' },

  settings: {
    title: 'Settings',
    checkins: 'Check-ins',
    checkinsOn: 'Check-ins after a moment',
    evening: 'Evening check-in',
    morning: 'Morning check-in',
    quietStart: 'Quiet hours start',
    quietEnd: 'Quiet hours end',
    notifications: 'Notifications',
    notifOn: 'On',
    notifOff: 'Off — turn on in iOS Settings → Notifications → Moment',
    notifUnsupported: 'Not supported here',
    notifTurnOn: 'Turn on notifications',
    moments: 'Moments',
    delayLength: 'Delay length',
    /** @param {number} n */
    minutes: (n) => `${n} min`,
    ratingInterval: 'Ask where it is every',
    shadow: 'Ask what the urge was after',
    motion: 'Motion',
    motionSystem: 'System',
    motionReduce: 'Reduce',
    motionFull: 'Full',
    setup: 'Setup',
    data: 'Your data',
    /** @param {string} ago */
    synced: (ago) => `Synced ${ago}`,
    neverSynced: 'Not synced yet',
    offline: 'Offline — will sync later',
    syncOff: 'Sync isn’t set up on this copy of Moment.',
    /** @param {number} n */
    pending: (n) => `${n} change${n === 1 ? '' : 's'} waiting to sync`,
    persistOn: 'This browser will keep your data.',
    persistOff: 'This browser may clear your data if space runs low. Your restore link can bring it back.',
    restoreTitle: 'Your restore link',
    restoreWarning: 'Anyone with this link can read your data. Keep it private.',
    restoreLost: 'If you lose this link and this device, the copy on the server can’t be read by anyone, including you.',
    restorePaste: 'Have a restore link? Paste it here.',
    restorePasteBtn: 'Use this link',
    reveal: 'Show link',
    copy: 'Copy link',
    copied: 'Copied.',
    exportBtn: 'Export',
    exportWarning: "This file isn't encrypted.",
    deleteAll: 'Delete everything',
    deleteExplain: 'This removes all your data from this device and the server. Type DELETE to confirm.',
    deleteWord: 'DELETE',
    deleteField: 'Type DELETE',
    deleteConfirm: 'Delete everything',
    deleting: 'Deleting…',
    support: 'Support person',
    supportName: 'Name',
    supportMethod: 'How to reach them',
    supportNumber: 'Number',
    supportMessage: 'Message to send',
    supportSms: 'Text',
    supportTel: 'Call',
    about: 'About',
    /** @param {string} v */
    version: (v) => `Version ${v}`,
    disclaimer: "Moment isn't medical care. In an emergency, call 911.",
    on: 'On',
    off: 'Off',
  },

  restore: {
    title: 'Restore your data',
    bad: "This link doesn't look right.",
    intro: 'This brings your data from the server onto this device.',
    hasData: 'This device already has data.',
    replace: "Replace this device's data",
    merge: 'Merge',
    go: 'Restore',
    working: 'Restoring…',
    done: 'Restored.',
    failed: "Couldn't reach the server. Nothing changed. Try again when you're online.",
    home: 'Home',
    iosNote: 'To restore into the Home Screen app, copy this link, open Moment from your Home Screen, and paste it in Settings.',
  },

  help: {
    title: 'More help',
    close: 'Close',
  },

  time: {
    lessThanMin: 'under a minute',
    /** @param {number} m */
    min: (m) => `${m} min`,
    /** @param {number} h @param {number} m */
    hourMin: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),
    justNow: 'just now',
    /** @param {number} m */
    minAgo: (m) => `${m} min ago`,
    /** @param {number} h */
    hAgo: (h) => `${h} h ago`,
    /** @param {number} d */
    dAgo: (d) => `${d} d ago`,
  },

  a11y: {
    selected: 'selected',
    newWindow: 'opens your phone app',
  },
};

/**
 * Format a template with {n}-style placeholders split into segments (for link insertion).
 * @param {string} text
 * @returns {string[]} segments split at "{n}"
 */
export function splitPlaceholder(text) {
  return text.split('{n}');
}
