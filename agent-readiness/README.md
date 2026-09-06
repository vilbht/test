# Agent Visibility Tester

An internal tool for account management teams in retail and commerce: paste a
retailer's product URL and get a scored, evidence-backed read on how ready that
merchant is for **agentic commerce** — plus a side-by-side view of what a
shopper sees versus what a shopping agent actually gets.

Built for the Central Europe markets (DE, PL, CZ, SK, SI, GR, MT, CY), with
local payment and regulatory context folded into the output.

## Why side by side

A retail site can look flawless in a browser and be close to invisible to an
agent. The tool fetches the same URL twice:

| | Human column | Agent column |
|---|---|---|
| Client | Chromium, JavaScript on | raw HTTP fetch, no JS engine |
| Output | screenshot + rendered stats | the JSON record an agent can actually build |

The gap between the two columns is the conversation.

## Scoring

Five weighted pillars, 0–100 overall:

| Pillar | Weight | Question |
|---|---|---|
| Product read | 25% | Can an agent retrieve and parse the product at all? |
| Product completeness | 20% | Does the record contain what is needed to compare and buy? |
| Stock availability | 15% | Can the agent trust that this is buyable right now? |
| Site accessibility | 20% | Is the agent allowed in, and can it move around? |
| Checkout | 20% | Can the transaction complete, and be authorised? |

Bands: **80+ agent ready**, **60–79 emerging**, **35–59 limited**,
**under 35 effectively invisible**.

Every check reports its status (`pass` / `partial` / `fail` / `ask the client`),
what the human sees, what the agent got, a concrete fix, and — where useful — a
talk track for the client meeting. Findings are ranked by how many points of
overall score each fix unlocks.

Checks marked **ask the client** cannot be observed from outside the funnel
(SCA handling, PSP arrangements, stock APIs). They are scored conservatively and
surfaced as discovery questions rather than guesses.

## What it actually inspects

- **Structured data** — schema.org Product in JSON-LD, microdata and Open Graph;
  name, price, currency, GTIN/EAN/MPN/SKU, brand, variants, images, ratings,
  shipping, return policy, VAT and unit pricing.
- **JavaScript dependency** — the measured delta between the rendered DOM and the
  raw HTML: how much of the price, stock and copy exists only after the bundle runs.
- **Availability** — enum correctness, per-variant stock, inventory levels,
  cache and freshness headers.
- **Bot policy** — `robots.txt` evaluated per crawler for GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Google-Extended,
  Applebot-Extended, meta-externalagent and Amazonbot; plus meta robots,
  `X-Robots-Tag` and bot-management interstitials (Cloudflare, Akamai, DataDome,
  PerimeterX, Imperva).
- **Agent surfaces** — `llms.txt`, `sitemap.xml`, `.well-known/agentic-commerce`,
  `.well-known/mcp.json`, `agent.json`, `ai-plugin.json`.
- **Checkout** — add-to-cart as a real form vs a JS handler, cart deep links,
  guest checkout, declared payment methods, wallet and tokenisation rails,
  3-D Secure signals, post-purchase machine readability.
- **Market fit** — `lang`, `hreflang`, currency against the detected market.

## Beyond the score

The report closes with ten dimensions no crawler can measure but that decide
whether agentic commerce goes live: agent identity and trust, SCA under PSD2,
liability and disputes, merchant of record and cross-border VAT, post-purchase,
promotion and loyalty integrity, agent traffic economics and observability, data
rights and brand control, European regulation (EAA, GPSR, consumer law), and
internal ownership. Each comes with a question to put to the client.

## Running it

```bash
npm install                      # playwright is optional but recommended
npx playwright install chromium  # for the human column screenshot
npm start                        # http://localhost:4173
```

Without Playwright the tool still runs: the agent column, all scoring and the
bot-policy analysis are pure HTTP. Only the screenshot and the measured
JavaScript delta need a browser. If the machine already has a Chromium build,
point at it with `AVT_CHROMIUM_PATH=/path/to/chrome`.

Everything runs locally — no URL, page or report leaves the machine.

### Demo fixtures

```bash
npm run fixtures   # :4901 an agent-ready shop, :4902 a JavaScript-only shop
```

Both are linked as one-click examples in the UI, which makes for a clean before
and after in a client meeting.

### Tests

```bash
npm test           # 22 end-to-end and unit checks against the fixtures
```

## Notes and limits

- The score reflects one URL. Scan two or three PDPs plus a category page for a
  representative picture of a large catalogue.
- Scores are heuristic, not a certification, and the agent ecosystem is moving.
  Re-check `src/fetcher.js` (`AGENT_CRAWLERS`, `WELL_KNOWN_PROBES`) as protocols
  settle.
- Some merchants serve different HTML by IP or user-agent. A scan run from an
  office network can differ from one run elsewhere; that difference is itself a
  finding.
