// Pillar 2 - Product completeness: does the record contain what is needed to
// compare, qualify and buy without a human filling the gaps?
export default function completeness(ctx) {
  const { extracted, signals, market } = ctx;
  const p = extracted.product;
  const checks = [];

  const field = (id, label, weight, value, opts = {}) => {
    const present = Array.isArray(value) ? value.length > 0 : value != null && value !== '';
    checks.push({
      id,
      label,
      weight,
      status: present ? 'pass' : opts.soft ? 'partial' : 'fail',
      score: present ? 1 : opts.soft ? 0.4 : 0,
      agent: present ? `${opts.agentPrefix || label}: ${truncate(Array.isArray(value) ? value.join(', ') : String(value))}` : opts.missing || `Not present in the machine-readable record.`,
      human: opts.human || 'Visible on the page, if the shopper scrolls to it.',
      fix: opts.fix,
      talkTrack: opts.talkTrack,
    });
  };

  field('name', 'Product name', 4, p.name, { human: 'Reads it as the page headline.' , fix: 'Populate Product.name with the full merchandising title.' });
  field('description', 'Description', 3, p.description, { fix: 'Populate Product.description with the real copy, not the meta boilerplate.' });
  field('images', 'Product images', 3, p.imageCount ? `${p.imageCount} image(s)` : null, {
    human: 'Sees a full gallery, zoom and often video.',
    missing: 'No image in the structured record. The agent cannot show the shopper what it is about to buy.',
    fix: 'Include an image array (multiple angles, absolute HTTPS URLs) in Product.image.',
  });
  field('price', 'Price and currency', 6, p.price ? `${p.price} ${p.priceCurrency || '(no currency!)'}` : null, {
    fix: 'Always pair offers.price with offers.priceCurrency.',
  });
  field('identifier', 'GTIN / EAN / MPN', 5, p.gtin || p.mpn, {
    agentPrefix: 'Identifier',
    missing: 'No GTIN/EAN/MPN. The agent cannot confirm this is the same product it found elsewhere, so it cannot price-compare or re-order it.',
    human: 'Does not care - recognises the product from the photo.',
    fix: 'Publish gtin13/ean and mpn on every offer. This is the join key for the whole agentic ecosystem.',
    talkTrack: 'Missing GTINs is the most common blocker and the cheapest to fix. It is usually already in the PIM.',
  });
  field('sku', 'SKU', 2, p.sku, { soft: true, fix: 'Expose the merchant SKU so order and stock calls can be reconciled.' });
  field('brand', 'Brand', 3, p.brand, { fix: 'Populate Product.brand as an Organization or Brand node.' });
  field('variants', 'Variants (size, colour) exposed', 4, p.variantCount ? `${p.variantCount} variant offer(s)` : (p.color || p.size), {
    human: 'Picks size and colour from swatches.',
    missing: 'Variants are not in the structured data, so the agent cannot pick a size or colour. It will stop and hand back to the human.',
    fix: 'Model variants with ProductGroup + hasVariant, each with its own sku, gtin, price and availability.',
    talkTrack: 'Fashion and footwear clients fail here almost universally.',
  });
  field('shipping', 'Shipping cost and delivery time', 4, p.shipping ? [p.shipping.rate && `${p.shipping.rate} ${p.shipping.currency || ''}`, p.shipping.destination, p.shipping.transitTime && 'transit time'].filter(Boolean).join(' / ') : null, {
    human: 'Discovers shipping cost at checkout, and tolerates it.',
    missing: 'No shippingDetails. Landed cost is unknown until checkout, so the agent cannot rank this offer against a competitor.',
    fix: 'Add offers.shippingDetails with rate, destination country and deliveryTime.',
    talkTrack: 'Agents rank on landed cost. An unlisted shipping fee means losing the comparison before checkout.',
  });
  field('returns', 'Return policy', 3, p.returns ? `${p.returns.days || '?'} days, ${p.returns.category || 'policy stated'}` : null, {
    missing: 'No machine-readable return policy. In the EU the 14-day withdrawal right applies anyway - say so in markup.',
    fix: 'Add hasMerchantReturnPolicy with merchantReturnDays, returnFees and applicableCountry.',
  });
  field('rating', 'Ratings and reviews', 2, p.rating ? `${p.rating.value} (${p.rating.count} reviews)` : null, {
    soft: true,
    fix: 'Expose aggregateRating - it is a primary ranking signal when an agent shortlists.',
  });
  field('condition', 'Item condition', 1, p.condition, { soft: true, fix: 'Set itemCondition, especially for refurbished and marketplace stock.' });
  field('price_validity', 'Price validity / promotion window', 2, p.priceValidUntil, {
    soft: true,
    missing: 'No priceValidUntil. An agent may cache a promotional price and present a stale offer.',
    fix: 'Set priceValidUntil on promotional offers so agents expire the price.',
  });

  // EU / market specific completeness.
  const langOk = signals.lang && market.languages.some((l) => (signals.lang || '').toLowerCase().startsWith(l));
  checks.push({
    id: 'locale',
    label: `Locale and currency match the market (${market.name})`,
    weight: 3,
    status: langOk && (!p.priceCurrency || p.priceCurrency === market.currency) ? 'pass' : signals.lang ? 'partial' : 'fail',
    score: langOk && (!p.priceCurrency || p.priceCurrency === market.currency) ? 1 : signals.lang ? 0.5 : 0,
    agent: `lang="${signals.lang || 'not set'}", currency ${p.priceCurrency || 'not declared'}, ${signals.hreflang.length} hreflang alternate(s). Expected ${market.currency} for ${market.name}.`,
    human: 'Sees the right language because the site geo-redirected them.',
    fix: 'Set <html lang>, hreflang alternates per market, and declare priceCurrency explicitly. Geo-redirects that depend on IP break agent fetches from foreign infrastructure.',
    talkTrack: `Agents often fetch from outside ${market.name}. IP-based redirects mean the agent sees the wrong country's catalogue and price.`,
  });

  checks.push({
    id: 'unit_price',
    label: 'VAT-inclusive and unit pricing stated (EU price indication rules)',
    weight: 2,
    status: p.unitPrice || p.priceSpecification ? 'pass' : 'manual',
    score: p.unitPrice || p.priceSpecification ? 1 : 0.4,
    agent: p.unitPrice || p.priceSpecification
      ? 'priceSpecification present - tax treatment is explicit.'
      : 'Only a bare price. Whether it includes VAT is ambiguous to a machine, and unit price is absent.',
    human: 'Reads "incl. VAT" in small print under the price.',
    fix: 'Use PriceSpecification with valueAddedTaxIncluded=true, and unitPriceSpecification where unit pricing is required.',
  });

  return { id: 'completeness', checks };
}

const truncate = (s, n = 110) => (s && s.length > n ? `${s.slice(0, n)}...` : s);
