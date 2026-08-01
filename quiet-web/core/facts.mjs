// facts.mjs — one privacy fact per beacon. Plain, accurate, no scare tactics.
//
// Accuracy matters more than punch here: a calm game that misinforms is worse
// than one that says nothing. Each line is written to be true as stated, with
// no implied absolute ("blocks all tracking", "makes you anonymous") that a
// browser feature cannot actually deliver.

export const FACTS = Object.freeze([
  {
    title: 'Third-party cookies',
    body: 'A cookie set by an embedded widget can be read again on every other site that embeds it, which is how one company builds a picture of your browsing across many sites.',
  },
  {
    title: 'Cookie jars',
    body: "Firefox's Total Cookie Protection keeps each site's cookies in a separate jar, so a tracker embedded on two sites cannot join the two visits through its cookie.",
  },
  {
    title: 'Fingerprinting',
    body: 'Your fonts, screen size, timezone and graphics quirks combine into a fairly distinctive signature. It can identify a browser without storing anything on it — which is why clearing cookies does not clear it.',
  },
  {
    title: 'HTTPS',
    body: 'HTTPS encrypts the contents of a page in transit, so a network operator sees which site you contacted but not what you read or typed on it.',
  },
  {
    title: 'DNS queries',
    body: 'Looking up a domain name is a separate step from loading it. Plain DNS sends that name unencrypted; DNS-over-HTTPS hides it from the network, though your chosen resolver still sees it.',
  },
  {
    title: 'Private browsing',
    body: 'Private windows discard cookies and history when you close them. They do not hide your activity from the sites you visit, your employer, or your internet provider.',
  },
  {
    title: 'Global Privacy Control',
    body: 'Do Not Track was a request sites could ignore, and most did. Global Privacy Control sends a similar signal that some privacy laws treat as a legally binding opt-out.',
  },
  {
    title: 'Tracking pixels',
    body: 'A one-pixel image in an email tells the sender you opened it, roughly where you were and on what device. Blocking remote images stops that request from being made.',
  },
  {
    title: 'Reused passwords',
    body: 'When one site is breached, attackers try the same email and password everywhere else. A unique password per site keeps one breach from becoming several.',
  },
]);
