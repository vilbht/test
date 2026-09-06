// Pillar 1 - Product read: can an agent retrieve and parse the product at all?
export default function productRead(ctx) {
  const { agentView, humanView, extracted, signals, wellKnown, delta } = ctx;
  const p = extracted.product;
  const checks = [];

  checks.push({
    id: 'reachable',
    label: 'Page returns content to a non-browser client',
    weight: 3,
    ...(agentView.status >= 200 && agentView.status < 300 && agentView.body.length > 500
      ? { status: 'pass', score: 1, agent: `HTTP ${agentView.status}, ${fmtKb(agentView.bytes)} of HTML returned to an agent user-agent.` }
      : agentView.status === 0
        ? { status: 'fail', score: 0, agent: `Request failed: ${agentView.error}.` }
        : { status: 'fail', score: 0, agent: `HTTP ${agentView.status} returned to an agent user-agent.` }),
    human: `A browser loads this page at ${humanView?.status || agentView.status}.`,
    fix: 'Serve the same HTTP 200 HTML to non-browser clients. Do not gate on user-agent or JavaScript execution.',
  });

  checks.push({
    id: 'structured_product',
    label: 'Machine-readable Product markup in the raw HTML',
    weight: 8,
    ...(extracted.hasProductNode
      ? { status: 'pass', score: 1, agent: `schema.org Product found in JSON-LD (${extracted.ldBlockCount} block(s), types: ${extracted.ldTypes.slice(0, 6).join(', ') || 'n/a'}).` }
      : extracted.microdata.types.some((t) => /product/i.test(t))
        ? { status: 'partial', score: 0.55, agent: 'Only microdata Product markup found. Parsed by most agents, but thinner and more error-prone than JSON-LD.' }
        : extracted.og.type && /product/i.test(extracted.og.type)
          ? { status: 'partial', score: 0.35, agent: 'Only Open Graph product tags found. Enough for a link preview, not enough to transact.' }
          : { status: 'fail', score: 0, agent: 'No Product schema. The agent must guess the product from prose, which it will do inconsistently or not at all.' }),
    human: 'A shopper reads the product name, price and images from the rendered layout.',
    fix: 'Emit schema.org/Product as JSON-LD on every PDP, server-side, including offers, sku/gtin and availability.',
    talkTrack: 'Ask who owns structured data on their side. It is usually SEO, not commerce, and nobody has re-scoped it for agents.',
  });

  checks.push({
    id: 'ssr_price',
    label: 'Price present without running JavaScript',
    weight: 6,
    ...(p.price
      ? { status: 'pass', score: 1, agent: `Price ${p.price} ${p.priceCurrency || ''} readable straight from markup.` }
      : signals.prices.length
        ? { status: 'partial', score: 0.5, agent: `No price field in structured data. A price-shaped string ("${signals.prices[0]}") appears in the text and would have to be scraped.` }
        : { status: 'fail', score: 0, agent: 'No price anywhere in the server HTML.' }),
    human: 'The price is rendered on screen, usually by client-side JavaScript.',
    fix: 'Render price server-side and mirror it in offers.price + offers.priceCurrency.',
  });

  checks.push({
    id: 'js_dependency',
    label: 'Content survives without a JavaScript engine',
    weight: 6,
    ...jsDependencyVerdict(delta, signals),
    human: 'A browser executes the full JS bundle, so the shopper sees everything.',
    fix: 'Server-render or pre-render product content. Most shopping agents fetch HTML and never execute your bundle.',
    talkTrack: 'This is the single biggest silent failure. A site can look perfect and be invisible.',
  });

  checks.push({
    id: 'crawlable_links',
    label: 'Products reachable through real <a href> links',
    weight: 3,
    ...(signals.internalLinks >= 10
      ? { status: 'pass', score: 1, agent: `${signals.internalLinks} internal href links available to follow.` }
      : signals.internalLinks > 0
        ? { status: 'partial', score: 0.5, agent: `Only ${signals.internalLinks} internal links, and ${signals.hashOnlyLinks} javascript:/# stubs. Catalogue traversal will be shallow.` }
        : { status: 'fail', score: 0, agent: 'No crawlable internal links. Navigation is JS-only, so the agent cannot walk the catalogue.' }),
    human: 'Menus and grids work because the router handles clicks.',
    fix: 'Every category and product must be an <a href> to a real URL, not a click handler.',
  });

  checks.push({
    id: 'sitemap',
    label: 'Catalogue discoverable via sitemap',
    weight: 2,
    ...(wellKnown.sitemap?.found
      ? { status: 'pass', score: 1, agent: `sitemap.xml served (${fmtKb(wellKnown.sitemap.bytes)}${/sitemapindex/i.test(wellKnown.sitemap.body) ? ', sitemap index' : ''}).` }
      : { status: 'fail', score: 0, agent: 'No sitemap.xml at the root. Agents fall back to link-walking and will miss long-tail SKUs.' }),
    human: 'Irrelevant to a shopper.',
    fix: 'Publish a product sitemap index with lastmod, and reference it from robots.txt.',
  });

  checks.push({
    id: 'canonical',
    label: 'Canonical URL and stable identity',
    weight: 2,
    ...(signals.canonical
      ? { status: 'pass', score: 1, agent: `Canonical: ${signals.canonical}` }
      : { status: 'partial', score: 0.3, agent: 'No canonical link. Agents may treat parameter variants as separate products and split their view of stock and price.' }),
    human: 'Never sees a canonical tag.',
    fix: 'Set rel=canonical on every PDP and keep the product URL stable across sessions.',
  });

  return { id: 'product_read', checks };
}

function jsDependencyVerdict(delta, signals) {
  if (!delta) {
    // No rendered comparison available - infer from raw HTML density.
    if (signals.wordCount > 250) return { status: 'pass', score: 0.85, agent: `${signals.wordCount} words of text in the server response - content is server-rendered.` };
    if (signals.wordCount > 60) return { status: 'partial', score: 0.45, agent: `Only ${signals.wordCount} words in the server response. Much of the page is likely assembled client-side.` };
    return { status: 'fail', score: 0.05, agent: `Server response carries ${signals.wordCount} words. This is an empty shell; an agent sees almost nothing.` };
  }
  const kept = delta.textRatio;
  if (kept >= 0.8) return { status: 'pass', score: 1, agent: `${pct(kept)} of the rendered text is already in the server HTML.` };
  if (kept >= 0.45) return { status: 'partial', score: 0.5, agent: `Only ${pct(kept)} of what the browser renders is in the server HTML. ${delta.missingHighlights.slice(0, 3).join(' ') || ''}` };
  return { status: 'fail', score: 0.1, agent: `${pct(kept)} of the rendered content reaches a non-JS client. The agent is reading a shell.` };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const fmtKb = (b) => `${Math.max(1, Math.round((b || 0) / 1024))} KB`;
