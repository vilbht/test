export const PILLARS = [
  { id: 'product_read', name: 'Product read', weight: 25,
    blurb: 'Can an agent retrieve and parse the product at all?' },
  { id: 'completeness', name: 'Product completeness', weight: 20,
    blurb: 'Does the record contain what is needed to compare and buy?' },
  { id: 'availability', name: 'Stock availability', weight: 15,
    blurb: 'Can the agent trust that this is buyable right now?' },
  { id: 'accessibility', name: 'Site accessibility', weight: 20,
    blurb: 'Is the agent allowed in, and can it move around?' },
  { id: 'checkout', name: 'Checkout', weight: 20,
    blurb: 'Can the transaction actually complete, and be authorised?' },
];

export const TIERS = [
  { min: 80, id: 'ready', label: 'Agent ready', summary: 'Agents can find, understand and act on this catalogue. The remaining work is commercial: payment rails, authentication and liability.' },
  { min: 60, id: 'emerging', label: 'Emerging', summary: 'The fundamentals are there but an agent hits gaps that force a handover to the shopper. Targeted fixes move this quickly.' },
  { min: 35, id: 'limited', label: 'Limited', summary: 'An agent can see the shop but cannot reliably qualify or buy a product. Structured data and checkout access are the blockers.' },
  { min: 0, id: 'invisible', label: 'Effectively invisible', summary: 'To a shopping agent this merchant barely exists. Every agent-mediated sale is going to a competitor by default.' },
];

export function scorePillar(result) {
  const scored = result.checks.filter((c) => c.status !== 'na');
  const totalWeight = scored.reduce((a, c) => a + c.weight, 0) || 1;
  const earned = scored.reduce((a, c) => a + c.weight * (c.score ?? 0), 0);
  return Math.round((earned / totalWeight) * 100);
}

export function overallScore(pillarScores) {
  const total = PILLARS.reduce((a, p) => a + p.weight, 0);
  const earned = PILLARS.reduce((a, p) => a + p.weight * ((pillarScores[p.id] ?? 0) / 100), 0);
  return Math.round((earned / total) * 100);
}

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

// Rank the fixes by how much overall score they unlock per unit of effort.
export function priorities(pillarResults) {
  const items = [];
  for (const pillar of PILLARS) {
    const res = pillarResults[pillar.id];
    if (!res) continue;
    const pillarWeightTotal = res.checks.reduce((a, c) => a + c.weight, 0) || 1;
    for (const c of res.checks) {
      if (c.status === 'pass') continue;
      const gain = ((1 - (c.score ?? 0)) * c.weight / pillarWeightTotal) * pillar.weight;
      items.push({
        pillar: pillar.name,
        pillarId: pillar.id,
        id: c.id,
        label: c.label,
        status: c.status,
        gain: Math.round(gain * 10) / 10,
        fix: c.fix,
        talkTrack: c.talkTrack || null,
      });
    }
  }
  return items.sort((a, b) => b.gain - a.gain);
}
