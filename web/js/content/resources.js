// @ts-check
/** More help sheet resources (§6.12), keyed by locale for later expansion. DD-034 */

/**
 * @typedef {{text:string, links:{label:string, href:string}[]}} Resource
 * @typedef {{items:Resource[], footer:string}} ResourceSet
 */

/** @type {Record<string, ResourceSet>} */
export const RESOURCES = {
  'en-US': {
    items: [
      { text: "In danger or someone's hurt: 911", links: [{ label: 'Call 911', href: 'tel:911' }] },
      {
        text: '988 Suicide & Crisis Lifeline: call or text 988',
        links: [{ label: 'Call 988', href: 'tel:988' }, { label: 'Text 988', href: 'sms:988' }],
      },
      {
        text: 'SAMHSA National Helpline, free and 24/7: 1-800-662-4357',
        links: [{ label: 'Call 1-800-662-4357', href: 'tel:18006624357' }],
      },
    ],
    footer: 'US numbers.',
  },
};

/** @param {string} [locale] @returns {ResourceSet} */
export function resourcesFor(locale = 'en-US') {
  return RESOURCES[locale] || RESOURCES['en-US'];
}
