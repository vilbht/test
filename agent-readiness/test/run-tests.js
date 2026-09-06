// End-to-end checks against the local fixture storefronts.
// Run: npm test   (starts the fixtures itself, no browser render)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.js';
import { parseRobots, robotsVerdict } from '../src/fetcher.js';
import { extractProduct } from '../src/extract.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  pass  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const fixtures = spawn(process.execPath, ['fixtures/serve.js'], { cwd: root, stdio: 'ignore' });
const stop = () => fixtures.kill();
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 700));

try {
  console.log('\nrobots.txt parsing');
  const r = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /private\n');
  ok('named crawler block wins over wildcard', robotsVerdict(r, 'GPTBot', '/p/x').decision === 'blocked');
  ok('unblocked crawler falls back to wildcard allow', robotsVerdict(r, 'PerplexityBot', '/p/x').decision === 'allowed');
  ok('path-scoped disallow only bites its path', robotsVerdict(r, 'ClaudeBot', '/p/x').decision === 'allowed');
  ok('path-scoped disallow bites inside its path', robotsVerdict(r, 'ClaudeBot', '/private/a').decision === 'blocked');

  console.log('\nstructured data extraction');
  const ld = extractProduct(`<html><script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"Product","name":"X","gtin13":"1234567890123",
    "offers":{"@type":"Offer","price":"10.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}]}
    </script></html>`, 'https://x.test/p');
  ok('reads Product out of an @graph', ld.product.name === 'X');
  ok('normalises the availability enum', ld.product.availability === 'InStock', ld.product.availability);
  ok('picks up gtin13', ld.product.gtin === '1234567890123');

  console.log('\nagent-ready fixture');
  const good = await scan('http://localhost:4901/p/alpine-trail-runner-gtx', { render: false });
  ok('scores in the ready band', good.score >= 80, `got ${good.score}`);
  ok('finds the product record', good.agentPayload.gtin === '4006381333931');
  ok('reads per-variant stock', good.pillars.find((p) => p.id === 'availability').checks.find((c) => c.id === 'variant_availability').status === 'pass');
  ok('sees the add-to-cart form', good.pillars.find((p) => p.id === 'checkout').checks.find((c) => c.id === 'add_to_cart').status === 'pass');
  ok('finds the agentic-commerce endpoint', good.pillars.find((p) => p.id === 'checkout').checks.find((c) => c.id === 'agentic_protocol').status === 'pass');
  ok('no gaps in the side-by-side', good.sideBySide.rows.filter((x) => !x.ok).length === 0);

  console.log('\nclient-side-rendered fixture');
  const bad = await scan('http://localhost:4902/', { render: false });
  ok('scores in the invisible band', bad.score < 35, `got ${bad.score}`);
  ok('reports no structured product', bad.agentPayload.__source === undefined);
  ok('flags the AI crawler block', bad.pillars.find((p) => p.id === 'accessibility').checks.find((c) => c.id === 'robots_agents').status === 'fail');
  ok('ranks structured data as the top fix', bad.priorities[0].id === 'structured_product', bad.priorities[0].id);
  ok('side-by-side shows the gaps', bad.sideBySide.rows.filter((x) => !x.ok).length >= 8);

  console.log('\nmarket detection');
  const { detectMarket } = await import('../src/markets.js');
  ok('.cz maps to Czechia', detectMarket('https://shop.cz/p').code === 'CZ');
  ok('.pl maps to Poland with PLN', detectMarket('https://shop.pl/p').currency === 'PLN');
  ok('unknown tld falls back to EU', detectMarket('https://shop.io/p').code === 'EU');
} finally {
  stop();
}

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
