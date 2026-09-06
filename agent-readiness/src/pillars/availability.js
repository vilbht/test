// Pillar 3 - Stock availability: can an agent trust that this is buyable now?
export default function availability(ctx) {
  const { extracted, agentView, delta, signals } = ctx;
  const p = extracted.product;
  const checks = [];

  const av = p.availability;
  const known = ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'LimitedAvailability', 'SoldOut', 'Discontinued', 'InStoreOnly', 'OnlineOnly'];
  const avKnown = av && known.some((k) => av.toLowerCase().includes(k.toLowerCase()));

  checks.push({
    id: 'availability_field',
    label: 'Availability stated in machine-readable form',
    weight: 8,
    ...(avKnown
      ? { status: 'pass', score: 1, agent: `offers.availability = ${av}` }
      : av
        ? { status: 'partial', score: 0.5, agent: `Availability present but non-standard ("${av}"). Agents may not map it correctly.` }
        : { status: 'fail', score: 0, agent: 'No availability field. The agent cannot tell whether this can be bought, so it will either skip the product or promise stock that does not exist.' }),
    human: 'Sees a green "In stock" badge, or a greyed-out button.',
    fix: 'Set offers.availability to a schema.org enumeration on every PDP and keep it in sync with the stock system.',
    talkTrack: 'An agent that promises out-of-stock goods creates a dispute. This is where scheme-level trust gets tested.',
  });

  checks.push({
    id: 'availability_ssr',
    label: 'Availability visible without JavaScript',
    weight: 5,
    ...(av && !delta?.availabilityJsOnly
      ? { status: 'pass', score: 1, agent: 'Availability is in the server response, so it is read on the first fetch.' }
      : delta?.availabilityJsOnly
        ? { status: 'fail', score: 0, agent: 'Availability only appears after JavaScript runs. Agents fetching raw HTML see nothing.' }
        : { status: 'fail', score: 0, agent: 'No availability in the server response.' }),
    human: 'Stock badge hydrates in a few hundred milliseconds.',
    fix: 'Render stock state server-side, or expose it through a documented JSON endpoint on the same origin.',
  });

  checks.push({
    id: 'variant_availability',
    label: 'Per-variant stock, not just product-level',
    weight: 5,
    ...(p.variantAvailability.length
      ? { status: 'pass', score: 1, agent: `${p.variantAvailability.length} variant(s) carry their own availability.` }
      : p.variantCount
        ? { status: 'partial', score: 0.4, agent: `${p.variantCount} variants exposed but stock is stated once at product level. The agent cannot tell which size is actually buyable.` }
        : { status: 'fail', score: 0, agent: 'No per-variant stock. For any sized or coloured product this makes autonomous purchase unsafe.' }),
    human: 'Greyed-out size buttons show what is gone.',
    fix: 'Give every variant offer its own availability and inventoryLevel.',
  });

  checks.push({
    id: 'inventory_level',
    label: 'Quantity or scarcity signal',
    weight: 3,
    ...(p.inventoryLevel != null
      ? { status: 'pass', score: 1, agent: `inventoryLevel = ${JSON.stringify(p.inventoryLevel)}` }
      : { status: 'partial', score: 0.3, agent: 'Binary in/out of stock only. Agents cannot size a multi-unit or basket order safely.' }),
    human: 'Sees "only 3 left" nudges.',
    fix: 'Expose inventoryLevel (exact or banded) so agents can order more than one unit.',
  });

  const cc = String(agentView.headers['cache-control'] || '');
  const longCache = /max-age=(\d+)/i.exec(cc);
  const cacheSeconds = longCache ? Number(longCache[1]) : null;
  checks.push({
    id: 'freshness',
    label: 'Cache and freshness headers appropriate for stock data',
    weight: 3,
    ...(cacheSeconds != null && cacheSeconds > 3600
      ? { status: 'partial', score: 0.35, agent: `Cache-Control max-age=${cacheSeconds}s (${Math.round(cacheSeconds / 3600)}h). Agents and CDNs will serve stale stock and price.` }
      : cc || agentView.headers.etag || agentView.headers['last-modified']
        ? { status: 'pass', score: 1, agent: `Freshness signalled (${[cc && `Cache-Control: ${cc}`, agentView.headers.etag && 'ETag', agentView.headers['last-modified'] && 'Last-Modified'].filter(Boolean).join('; ')}).` }
        : { status: 'partial', score: 0.4, agent: 'No cache or validator headers. Agents cannot tell whether a cached copy is still valid.' }),
    human: 'Unaffected - the browser reloads on demand.',
    fix: 'Short max-age plus ETag on PDPs. Reserve long caching for assets, never for price and stock.',
  });

  checks.push({
    id: 'stock_api',
    label: 'Queryable stock/price endpoint for agents',
    weight: 3,
    status: 'manual',
    score: 0.3,
    agent: 'Not detectable from the page. Agents currently re-fetch the whole PDP to re-check stock, which is slow and gets rate-limited.',
    human: 'Not applicable.',
    fix: 'Offer a documented, cacheable availability API keyed by GTIN/SKU, or an MCP endpoint. Confirm with the merchant whether one exists.',
    talkTrack: 'Ask: "if an agent needs to re-check stock for 200 SKUs before checkout, what does that do to your infrastructure?"',
  });

  checks.push({
    id: 'store_stock',
    label: 'Store / click-and-collect availability',
    weight: 2,
    status: /(click|collect|abholung|filiale|na prodejn|odbi[oó]r|paralavi|pickup in store)/i.test(signals.textSample) ? 'partial' : 'manual',
    score: 0.3,
    agent: 'No structured store-level availability found (AvailableAtOrFrom / LocalBusiness offers).',
    human: 'Uses a store picker with a postcode.',
    fix: 'Model store stock with offers.availableAtOrFrom so agents can route to same-day pickup.',
  });

  return { id: 'availability', checks };
}
