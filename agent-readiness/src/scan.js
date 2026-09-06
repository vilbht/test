import { httpGet, originOf, probeWellKnown, parseRobots, AGENT_UA, BROWSER_UA } from './fetcher.js';
import { extractProduct, pageSignals } from './extract.js';
import { renderHuman, computeDelta } from './render.js';
import { detectMarket } from './markets.js';
import { PILLARS, scorePillar, overallScore, tierFor, priorities } from './score.js';
import productRead from './pillars/product-read.js';
import completeness from './pillars/completeness.js';
import availability from './pillars/availability.js';
import accessibility from './pillars/accessibility.js';
import checkout from './pillars/checkout.js';

const PILLAR_FNS = {
  product_read: productRead,
  completeness,
  availability,
  accessibility,
  checkout,
};

export function normaliseUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter a product or shop URL.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are supported.');
  return u.toString();
}

export async function scan(rawUrl, { market: marketCode, render = true, onProgress = () => {} } = {}) {
  const url = normaliseUrl(rawUrl);
  const origin = originOf(url);
  const market = detectMarket(url, marketCode);
  const startedAt = Date.now();

  onProgress({ step: 'agent', message: 'Fetching the page as a shopping agent' });
  const agentView = await httpGet(url, { ua: AGENT_UA });

  onProgress({ step: 'wellknown', message: 'Probing robots.txt and agent endpoints' });
  const [wellKnown, human] = await Promise.all([
    probeWellKnown(origin),
    render
      ? (onProgress({ step: 'human', message: 'Rendering the page in a real browser' }), renderHuman(url))
      : Promise.resolve({ available: false, reason: 'Browser rendering disabled for this scan.' }),
  ]);

  const robots = wellKnown.robots?.found ? parseRobots(wellKnown.robots.body) : null;

  // If the raw fetch was blocked but the browser got through, still analyse the
  // rendered HTML so the report shows what is being withheld from agents.
  const analysedHtml = agentView.body && agentView.body.length > 200 ? agentView.body : human.available ? human.html : agentView.body;

  onProgress({ step: 'analyse', message: 'Extracting the machine-readable record' });
  const extracted = extractProduct(analysedHtml, url);
  const signals = pageSignals(agentView.body || '', url);
  const delta = computeDelta(signals, human, extracted.product);

  const ctx = { url, origin, agentView, humanView: human.available ? human : null, human, extracted, signals, robots, wellKnown, delta, market };

  const pillarResults = {};
  const pillarScores = {};
  for (const p of PILLARS) {
    const res = PILLAR_FNS[p.id](ctx);
    pillarResults[p.id] = res;
    pillarScores[p.id] = scorePillar(res);
  }

  const total = overallScore(pillarScores);
  const tier = tierFor(total);

  return {
    url,
    origin,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    market: { code: market.code, name: market.name, currency: market.currency, methods: market.methods, note: market.note },
    score: total,
    tier,
    pillars: PILLARS.map((p) => ({ ...p, score: pillarScores[p.id], checks: pillarResults[p.id].checks })),
    priorities: priorities(pillarResults).slice(0, 8),
    sideBySide: buildSideBySide(ctx),
    agentPayload: buildAgentPayload(ctx),
    diagnostics: {
      agentStatus: agentView.status,
      agentError: agentView.error || null,
      agentMs: agentView.ms,
      agentBytes: agentView.bytes,
      renderAvailable: human.available,
      renderReason: human.reason || null,
      robotsFound: Boolean(robots),
      wellKnown: Object.fromEntries(Object.entries(wellKnown).map(([k, v]) => [k, { label: v.label, found: v.found, status: v.status, url: v.url }])),
      userAgents: { agent: AGENT_UA, browser: BROWSER_UA },
      ldBlocks: extracted.ldBlockCount,
      ldParseErrors: extracted.ldParseErrors,
      ldTypes: extracted.ldTypes,
    },
  };
}

function buildSideBySide(ctx) {
  const { human, signals, extracted, delta, agentView } = ctx;
  const p = extracted.product;
  const row = (label, humanValue, agentValue, ok) => ({ label, human: humanValue, agent: agentValue, ok });

  return {
    screenshot: human.available ? human.screenshot : null,
    renderNote: human.available ? null : human.reason,
    humanSummary: {
      title: human.available ? human.title : signals.title,
      h1: human.available ? human.h1 : null,
      words: human.available ? human.wordCount : signals.wordCount,
      images: human.available ? human.imageCount : signals.imageCount,
      buttons: human.available ? human.buttonCount : null,
      ms: human.available ? human.ms : null,
    },
    agentSummary: {
      status: agentView.status,
      words: signals.wordCount,
      images: signals.imageCount,
      bytes: agentView.bytes,
      ms: agentView.ms,
      structured: p.source || 'none',
    },
    delta,
    rows: [
      row('Product name', human.available ? human.h1 || human.title : signals.title || '—', p.name || 'not in machine-readable data', Boolean(p.name)),
      row('Price', delta?.priceJsOnly ? 'Rendered on screen by JavaScript' : signals.prices[0] || (human.available ? 'Shown on the page' : '—'), p.price ? `${p.price} ${p.priceCurrency || '(currency missing)'}` : 'no price field', Boolean(p.price)),
      row('Availability', 'Stock badge / disabled buttons', p.availability || 'no availability field', Boolean(p.availability)),
      row('Identifier', 'Not shown, and not needed', p.gtin || p.mpn || p.sku || 'no GTIN / MPN / SKU', Boolean(p.gtin || p.mpn || p.sku)),
      row('Images', `${human.available ? human.imageCount : signals.imageCount} rendered`, p.imageCount ? `${p.imageCount} in structured data` : 'none in structured data', p.imageCount > 0),
      row('Variants', 'Size and colour swatches', p.variantCount ? `${p.variantCount} variant offers` : 'not exposed', p.variantCount > 0),
      row('Shipping', 'Explained at checkout', p.shipping ? `${p.shipping.rate ?? '?'} ${p.shipping.currency || ''} to ${p.shipping.destination || '?'}` : 'not stated', Boolean(p.shipping)),
      row('Returns', 'Linked in the footer', p.returns ? `${p.returns.days || '?'} days` : 'not machine-readable', Boolean(p.returns)),
      row('Payment', 'Logos at checkout', p.acceptedPaymentMethod.length ? p.acceptedPaymentMethod.join(', ') : 'not declared', p.acceptedPaymentMethod.length > 0),
      row('Buy action', 'Clicks "Add to cart"', signals.forms.some((f) => /cart|basket|warenkorb|kosik|koszyk/i.test(f.action || '')) ? 'reproducible form POST' : signals.addToCart ? 'JavaScript-only button' : 'no buy affordance found', signals.forms.some((f) => /cart|basket/i.test(f.action || ''))),
    ],
  };
}

function buildAgentPayload(ctx) {
  const p = ctx.extracted.product;
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
  return clean({
    name: p.name,
    brand: p.brand,
    gtin: p.gtin,
    mpn: p.mpn,
    sku: p.sku,
    price: p.price,
    currency: p.priceCurrency,
    availability: p.availability,
    inventoryLevel: p.inventoryLevel,
    variants: p.variantCount || undefined,
    image: p.image,
    shipping: p.shipping,
    returns: p.returns,
    rating: p.rating,
    acceptedPaymentMethod: p.acceptedPaymentMethod,
    url: p.url,
    __source: p.source,
  });
}
