// facts.mjs — one privacy fact per beacon. Plain, accurate, no scare tactics.
//
// Accuracy matters more than punch here: a calm game that misinforms is worse
// than one that says nothing. Each line is written to be true as stated, with
// no implied absolute ("blocks all tracking", "makes you anonymous") that a
// browser feature cannot actually deliver.

export /**
 * Every fact names a real Firefox setting, and every setting can be switched on
 * from the card that raised it.
 *
 *   name    the real feature, phrased as the thing you would go and do
 *   does    what switching it on changes about this run — shown once it is on,
 *           so the card never promises an effect it has not delivered yet
 *   effect  which of the three pressures it eases. Grouped rather than given
 *           nine bespoke mechanics: the game has exactly one antagonist, so
 *           every privacy feature reasonably reduces tracker pressure, and
 *           inventing nine separate systems would have meant inventing eight
 *           analogies that do not hold.
 *
 *     shed     a clinging tracker lets go on its own, sooner per protection
 *     notice   trackers have to get closer before they can cling
 *     burden   each clinging tracker slows you less
 */
const FACTS = Object.freeze([
  {
    title: 'Third-party cookies',
    body: 'A cookie set by an embedded widget can be read again on every other site that embeds it, which is how one company builds a picture of your browsing across many sites.',
    protect: { name: 'Block third-party cookies', effect: 'shed', does: 'trackers let go of you sooner' },
  },
  {
    title: 'Cookie jars',
    body: "Firefox's Total Cookie Protection keeps each site's cookies in a separate jar, so a tracker embedded on two sites cannot join the two visits through its cookie.",
    protect: { name: 'Turn on Total Cookie Protection', effect: 'shed', does: 'trackers let go of you sooner' },
  },
  {
    title: 'Fingerprinting',
    body: 'Your fonts, screen size, timezone and graphics quirks combine into a fairly distinctive signature. It can identify a browser without storing anything on it — which is why clearing cookies does not clear it.',
    protect: { name: 'Block known fingerprinters', effect: 'notice', does: 'trackers have to get closer to catch you' },
  },
  {
    title: 'HTTPS',
    body: 'HTTPS encrypts the contents of a page in transit, so a network operator sees which site you contacted but not what you read or typed on it.',
    protect: { name: 'Turn on HTTPS-Only Mode', effect: 'burden', does: 'a tracker that does catch you costs less' },
  },
  {
    title: 'DNS queries',
    body: 'Looking up a domain name is a separate step from loading it. Plain DNS sends that name unencrypted; DNS-over-HTTPS hides it from the network, though your chosen resolver still sees it.',
    protect: { name: 'Turn on DNS over HTTPS', effect: 'notice', does: 'trackers have to get closer to catch you' },
  },
  {
    title: 'Private browsing',
    body: 'Private windows discard cookies and history when you close them. They do not hide your activity from the sites you visit, your employer, or your internet provider.',
    protect: { name: 'Open a private window', effect: 'notice', does: 'trackers have to get closer to catch you' },
  },
  {
    title: 'Global Privacy Control',
    body: 'Do Not Track was a request sites could ignore, and most did. Global Privacy Control sends a similar signal that some privacy laws treat as a legally binding opt-out.',
    protect: { name: 'Send Global Privacy Control', effect: 'burden', does: 'a tracker that does catch you costs less' },
  },
  {
    title: 'Tracking pixels',
    body: 'A one-pixel image in an email tells the sender you opened it, roughly where you were and on what device. Blocking remote images stops that request from being made.',
    protect: { name: 'Block remote images in email', effect: 'shed', does: 'trackers let go of you sooner' },
  },
  {
    title: 'Reused passwords',
    body: 'When one site is breached, attackers try the same email and password everywhere else. A unique password per site keeps one breach from becoming several.',
    protect: { name: 'Use a unique password here', effect: 'burden', does: 'a tracker that does catch you costs less' },
  },
]);

/**
 * One-off notices — the same card as a fact, raised by something happening
 * rather than by a beacon.
 *
 * Held to the same standard as the facts: the sentence about the real web has
 * to be true as stated, and the sentence about the game has to be true of the
 * game. A tutorial prompt dressed as a privacy fact would undermine both.
 */
export const NOTICES = Object.freeze({
  tracker: {
    title: 'A tracker has spotted you',
    body: 'It will cling and slow you down until you shake it off. On the real web these are third-party scripts and images embedded in pages you visit, which is how one company follows you from site to site.',
    // No protection to switch on: this one is a thing to do, not a setting to
    // change, so the call to action names the key that does it.
    act: { key: 'Shift', label: 'Shield pulse — scatter it' },
  },
});
