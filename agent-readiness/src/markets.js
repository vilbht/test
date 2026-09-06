// Central Europe market context. Used to sanity-check locale/currency and to
// give account managers the local payment nuance an agent has to satisfy.
export const MARKETS = {
  DE: { code: 'DE', name: 'Germany', currency: 'EUR', languages: ['de'], tlds: ['.de'],
    methods: ['Cards', 'PayPal', 'Klarna / invoice', 'SEPA direct debit', 'girocard'],
    note: 'Buy-now-pay-later and open-invoice are dominant. An agent that can only present a card is filtered out of much of the basket mix.' },
  PL: { code: 'PL', name: 'Poland', currency: 'PLN', languages: ['pl'], tlds: ['.pl'],
    methods: ['BLIK', 'Cards', 'Przelewy24 / pay-by-link', 'PayPo (BNPL)'],
    note: 'BLIK is a one-time 6-digit code confirmed in a banking app. It is human-in-the-loop by design, so agentic flows need a card or token fallback.' },
  CZ: { code: 'CZ', name: 'Czechia', currency: 'CZK', languages: ['cs'], tlds: ['.cz'],
    methods: ['Cards', 'Bank transfer', 'Cash on delivery', 'Apple Pay / Google Pay'],
    note: 'Cash on delivery is still material. Agentic checkout only works on the card and wallet share, so quantify that share early.' },
  SK: { code: 'SK', name: 'Slovakia', currency: 'EUR', languages: ['sk'], tlds: ['.sk'],
    methods: ['Cards', 'Bank transfer', 'Cash on delivery'],
    note: 'Similar profile to Czechia, usually served from the same platform. Check whether the .sk storefront has the same structured data as the .cz one.' },
  SI: { code: 'SI', name: 'Slovenia', currency: 'EUR', languages: ['sl'], tlds: ['.si'],
    methods: ['Cards', 'Bank transfer', 'PayPal'],
    note: 'Small market, often a localised instance of a regional platform. Localisation gaps in structured data are common.' },
  GR: { code: 'GR', name: 'Greece', currency: 'EUR', languages: ['el'], tlds: ['.gr'],
    methods: ['Cards', 'IRIS instant payments', 'Cash on delivery', 'Instalments on card'],
    note: 'Card instalment plans are a strong local expectation. Instalment eligibility is almost never machine-readable, so agents cannot present it.' },
  MT: { code: 'MT', name: 'Malta', currency: 'EUR', languages: ['mt', 'en'], tlds: ['.mt'],
    methods: ['Cards', 'PayPal'],
    note: 'English-language storefronts, often cross-border fulfilment. Check that eligibleRegion actually includes MT.' },
  CY: { code: 'CY', name: 'Cyprus', currency: 'EUR', languages: ['el', 'en'], tlds: ['.cy', '.com.cy'],
    methods: ['Cards', 'PayPal', 'Cash on delivery'],
    note: 'Frequently served by Greek or UK platforms. Confirm which entity is the merchant of record for agent-initiated payments.' },
  EU: { code: 'EU', name: 'Europe (generic)', currency: 'EUR', languages: ['en', 'de', 'fr'], tlds: [],
    methods: ['Cards', 'Wallets'], note: 'No country detected from the domain. Select the market manually for sharper guidance.' },
};

export function detectMarket(url, explicit) {
  if (explicit && MARKETS[explicit]) return MARKETS[explicit];
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  const ordered = Object.values(MARKETS).filter((m) => m.tlds.length);
  for (const m of ordered) {
    for (const t of m.tlds) if (host.endsWith(t)) return m;
  }
  if (/\/(de|pl|cz|sk|si|gr|mt|cy)([/?]|$)/i.test(url)) {
    const code = url.match(/\/(de|pl|cz|sk|si|gr|mt|cy)([/?]|$)/i)[1].toUpperCase();
    if (MARKETS[code]) return MARKETS[code];
  }
  return MARKETS.EU;
}
