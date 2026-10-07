// @ts-check
/**
 * Prefilled lists (§11). Built-in ids are stable so two devices restoring defaults
 * converge on the same records under sync instead of duplicating them. DD-038
 */

/** @typedef {'body'|'place'|'hands'|'mind'} Category */
/** @typedef {{id:string,label:string,category:Category,effort:'low'|'medium'}} DistractDefault */

/** @type {DistractDefault[]} */
export const DISTRACT_DEFAULTS = [
  { id: 'd-shower', label: 'Take a shower', category: 'body', effort: 'low' },
  { id: 'd-water', label: 'Drink a glass of cold water', category: 'body', effort: 'low' },
  { id: 'd-eat', label: 'Eat something', category: 'body', effort: 'low' },
  { id: 'd-blanket', label: 'Lie down under a blanket', category: 'body', effort: 'low' },
  { id: 'd-stretch', label: 'Stretch for five minutes', category: 'body', effort: 'low' },
  { id: 'd-walk', label: 'Walk around the block', category: 'body', effort: 'medium' },
  { id: 'd-room', label: 'Go to a different room', category: 'place', effort: 'low' },
  { id: 'd-outside', label: 'Step outside', category: 'place', effort: 'low' },
  { id: 'd-public', label: 'Go somewhere public', category: 'place', effort: 'medium' },
  { id: 'd-tea', label: 'Make tea', category: 'hands', effort: 'low' },
  { id: 'd-tidy', label: 'Tidy one small thing', category: 'hands', effort: 'low' },
  { id: 'd-dishes', label: 'Wash the dishes', category: 'hands', effort: 'medium' },
  { id: 'd-show', label: "Put on a show you've seen before", category: 'mind', effort: 'low' },
  { id: 'd-listen', label: 'Listen to a podcast or album', category: 'mind', effort: 'low' },
  { id: 'd-game', label: 'Play a simple phone game', category: 'mind', effort: 'low' },
  { id: 'd-text', label: 'Text someone about anything else', category: 'mind', effort: 'low' },
];

/** @type {{id:string,label:string,group:'halt'|'context'}[]} */
export const TRIGGER_DEFAULTS = [
  { id: 't-hungry', label: 'Hungry', group: 'halt' },
  { id: 't-angry', label: 'Angry', group: 'halt' },
  { id: 't-lonely', label: 'Lonely', group: 'halt' },
  { id: 't-tired', label: 'Tired', group: 'halt' },
  { id: 't-person', label: 'A person', group: 'context' },
  { id: 't-place', label: 'A place', group: 'context' },
  { id: 't-time', label: 'Time of day', group: 'context' },
  { id: 't-message', label: 'A message or app', group: 'context' },
  { id: 't-stress', label: 'Stress', group: 'context' },
  { id: 't-boredom', label: 'Boredom', group: 'context' },
  { id: 't-celebrating', label: 'Celebrating', group: 'context' },
  { id: 't-sleep', label: "Can't sleep", group: 'context' },
  { id: 't-money', label: 'Money came in', group: 'context' },
];

/** @type {{id:string,thought:string,counter:string}[]} */
export const THOUGHT_DEFAULTS = [
  { id: 'p-once', thought: 'Just once.', counter: 'I know where once goes. This will pass without it.' },
  { id: 'p-earned', thought: "I've earned it.", counter: "I've earned a good night. There are other ways to give myself one." },
  { id: 'p-handle', thought: 'I can handle it.', counter: 'Handling it means not testing it tonight.' },
  { id: 'p-tomorrow', thought: "I'll start fresh tomorrow.", counter: 'Tomorrow-me needs me to get through tonight.' },
  { id: 'p-know', thought: 'No one will know.', counter: "I'll know, and I'm the one waking up tomorrow." },
  { id: 'p-feeling', thought: "I can't take this feeling.", counter: "It's strong and it's temporary. I can watch it peak and fall." },
  { id: 'p-nothing', thought: 'Nothing else will help.', counter: 'Nothing will feel as fast. Something can still help a little.' },
];

/** Default settings (§5.2). */
export const SETTINGS_DEFAULTS = {
  checkinsEnabled: true,
  quietStart: '00:00',
  quietEnd: '07:00',
  eveningTime: '20:00',
  morningTime: '09:00',
  delayMinutes: 15, // options 5, 10, 15, 20
  ratingPromptSec: 120,
  reducedMotion: 'system', // system | on | off
  shadowPrompt: true,
  breathVisual: 'wave', // DD-081: wave | silk | ink | shallows | pendulum | murmuration
};

/** Default profile (§5.2). thoughtsReviewed is an addition for Setup completeness. DD-039 */
export const PROFILE_DEFAULTS = {
  reasons: /** @type {string[]} */ ([]),
  messageToSelf: '',
  ifThenPlans: /** @type {{id:string,triggerTagId:string,thenText:string,distractOptionId?:string}[]} */ ([]),
  thoughtsReviewed: false,
};

export const LIMITS = {
  reasons: 7,
  reasonChars: 120,
  message: 400,
  plans: 6,
  label: 80,
  thought: 160,
  tapeNote: 400,
};

export const BODY_LOCATIONS = ['head', 'jaw', 'throat', 'chest', 'stomach', 'hands', 'legs', 'whole', 'unsure'];
export const SENSATIONS = ['tight', 'hot', 'buzzing', 'restless', 'heavy', 'hollow', 'racing', 'other'];
export const SEEKING = ['relief', 'energy', 'connection', 'escape', 'confidence', 'other'];
