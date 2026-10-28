/** ?mode=day swaps the night for a plain, bright forest: no flashlight, no dark, nothing scary. Night (the default) is the real game. */
export const DAY = new URLSearchParams(location.search).get('mode') === 'day';
