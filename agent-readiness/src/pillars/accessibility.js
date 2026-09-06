// Pillar 4 - Site accessibility: is the agent allowed in, and can it move around?
import { AGENT_CRAWLERS, robotsVerdict } from '../fetcher.js';

const CHALLENGE_RE = /(cf-browser-verification|cf_chl_|checking your browser|just a moment|_Incapsula_|imperva|px-captcha|perimeterx|akamai bot manager|datadome|captcha-delivery|distil_r_captcha|are you a robot|enable javascript and cookies to continue)/i;

export default function accessibility(ctx) {
  const { agentView, humanView, robots, wellKnown, signals, url } = ctx;
  const path = new URL(url).pathname;
  const checks = [];

  // 1. robots.txt posture towards the named AI crawlers.
  const verdicts = robots
    ? AGENT_CRAWLERS.map((c) => ({ ...c, ...robotsVerdict(robots, c.id, path) }))
    : [];
  const blocked = verdicts.filter((v) => v.decision === 'blocked');
  const explicitAllow = verdicts.filter((v) => v.decision === 'allowed' && v.source === 'explicit');
  checks.push({
    id: 'robots_agents',
    label: 'AI shopping crawlers permitted in robots.txt',
    weight: 8,
    ...(!robots
      ? { status: 'partial', score: 0.5, agent: 'No robots.txt found. Crawling is implicitly allowed, but nothing is stated - some agents treat silence as caution.' }
      : blocked.length === 0
        ? { status: 'pass', score: 1, agent: `All ${verdicts.length} major agent crawlers may fetch this path${explicitAllow.length ? `; ${explicitAllow.length} named explicitly.` : ' under the wildcard group.'}` }
        : blocked.length >= 3
          ? { status: 'fail', score: 0, agent: `Blocked for ${blocked.length}/${verdicts.length} agent crawlers: ${blocked.map((b) => b.label).join(', ')}. The catalogue is invisible in those assistants.` }
          : { status: 'partial', score: 0.4, agent: `Blocked for ${blocked.map((b) => b.label).join(', ')}; allowed for the rest. Losing even one surface removes a whole assistant's users.` }),
    human: 'robots.txt has no effect on a shopper.',
    fix: 'Decide crawler policy deliberately per bot. Blocking training bots is a valid choice; blocking the live-fetch and search bots removes you from the buying journey.',
    talkTrack: 'Most blocks were added by an SEO or security team years ago and never revisited by commerce. Worth a joint review.',
    detail: verdicts,
  });

  // 2. Bot wall / challenge page.
  const challenged = CHALLENGE_RE.test(agentView.body) || agentView.status === 403 || agentView.status === 429;
  const humanOk = humanView ? humanView.status >= 200 && humanView.status < 300 && !CHALLENGE_RE.test(humanView.html || '') : null;
  checks.push({
    id: 'bot_wall',
    label: 'No bot challenge in front of the agent',
    weight: 8,
    ...(challenged
      ? { status: 'fail', score: 0, agent: `Agent request was challenged or refused (HTTP ${agentView.status}${CHALLENGE_RE.test(agentView.body) ? ', bot-management interstitial detected' : ''}).${humanOk ? ' A browser request to the same URL succeeded.' : ''}` }
      : { status: 'pass', score: 1, agent: `Clean HTTP ${agentView.status} to an agent user-agent, no challenge page.` }),
    human: humanOk === false ? 'A browser was also challenged.' : 'Passes silently, or solves the challenge invisibly.',
    fix: 'Allowlist verified agent traffic (by published IP ranges or signed agent identity) in the WAF/bot manager instead of blocking by user-agent.',
    talkTrack: 'This is a WAF conversation, not a web-team one. Bring security into the room early.',
  });

  // 3. Meta robots / X-Robots-Tag.
  const xrt = agentView.headers['x-robots-tag'] || '';
  const noai = /noai|noimageai/i.test(`${signals.metaRobots || ''} ${xrt}`);
  const noindex = /noindex/i.test(`${signals.metaRobots || ''} ${xrt}`);
  checks.push({
    id: 'meta_robots',
    label: 'Page-level indexing directives',
    weight: 3,
    ...(noindex
      ? { status: 'fail', score: 0, agent: `noindex is set (${signals.metaRobots || xrt}). The page is excluded from the indexes agents shop from.` }
      : noai
        ? { status: 'partial', score: 0.4, agent: `noai directive present (${signals.metaRobots || xrt}).` }
        : { status: 'pass', score: 1, agent: `No blocking directive${signals.metaRobots ? ` (robots meta: ${signals.metaRobots})` : ''}.` }),
    human: 'No effect.',
    fix: 'Keep PDPs indexable. Apply noindex only to genuinely private pages.',
  });

  // 4. Response speed and weight.
  const ms = agentView.ms;
  checks.push({
    id: 'performance',
    label: 'Fast, light server response',
    weight: 4,
    ...(ms < 1200 && agentView.bytes < 900_000
      ? { status: 'pass', score: 1, agent: `${ms} ms, ${kb(agentView.bytes)}.` }
      : ms < 3500
        ? { status: 'partial', score: 0.55, agent: `${ms} ms, ${kb(agentView.bytes)}. Agents run tight per-request budgets and compare several merchants in parallel.` }
        : { status: 'fail', score: 0.1, agent: `${ms} ms, ${kb(agentView.bytes)}. Slow enough that an agent may abandon this merchant mid-comparison.` }),
    human: 'Perceives speed after the browser paints, and will wait a second or two.',
    fix: 'Target sub-second TTFB for PDPs served to non-browser clients, and keep the HTML payload lean.',
  });

  // 5. Semantic structure and alt text (also EAA compliance ground).
  const altRatio = signals.imageCount ? signals.imagesWithAlt / signals.imageCount : 0;
  const landmarks = signals.semanticLandmarks.length;
  const semanticOk = signals.headings.h1 === 1 && landmarks >= 3 && altRatio >= 0.8;
  checks.push({
    id: 'semantics',
    label: 'Semantic HTML, headings and alt text',
    weight: 4,
    ...(semanticOk
      ? { status: 'pass', score: 1, agent: `One h1, ${landmarks} landmark elements, ${Math.round(altRatio * 100)}% of images have alt text.` }
      : { status: signals.headings.h1 === 0 || altRatio < 0.4 ? 'fail' : 'partial', score: signals.headings.h1 === 0 || altRatio < 0.4 ? 0.2 : 0.55, agent: `${signals.headings.h1} h1 element(s), ${landmarks} landmarks, ${Math.round(altRatio * 100)}% of images have alt text. Agents fall back on this structure whenever structured data is thin.` }),
    human: 'Reads the visual hierarchy; screen-reader users depend on exactly the same markup.',
    fix: 'One h1 per page, real landmark elements, descriptive alt text. This doubles as European Accessibility Act groundwork.',
    talkTrack: 'The EAA has applied to e-commerce since June 2025. Agent readability and accessibility compliance are the same investment.',
  });

  // 6. Agent-facing documentation surfaces.
  const surfaces = ['llms', 'acp', 'mcp', 'aiplugin', 'agentcard'].filter((k) => wellKnown[k]?.found);
  checks.push({
    id: 'agent_surfaces',
    label: 'Explicit agent-facing surfaces (llms.txt, MCP, agent card)',
    weight: 3,
    ...(surfaces.length
      ? { status: 'pass', score: 1, agent: `Found: ${surfaces.map((s) => wellKnown[s].label).join(', ')}.` }
      : { status: 'partial', score: 0.2, agent: 'None of llms.txt, .well-known/mcp.json, agent.json or ai-plugin.json is published. The merchant has no declared interface for agents.' }),
    human: 'Not applicable.',
    fix: 'Publish llms.txt describing the catalogue and policies, and expose an MCP or ACP endpoint when ready to transact.',
    talkTrack: 'This is the forward-looking ask. Most merchants in the region are at zero here, which makes it a differentiator rather than a criticism.',
  });

  // 7. HTTPS / redirect hygiene.
  const https = agentView.finalUrl.startsWith('https://');
  checks.push({
    id: 'transport',
    label: 'HTTPS and clean redirects',
    weight: 2,
    ...(https && !/\/\/[^/]+\/.*\/\//.test(agentView.finalUrl)
      ? { status: 'pass', score: 1, agent: `Served over HTTPS${agentView.redirected ? ` after a redirect to ${agentView.finalUrl}` : ''}.` }
      : { status: 'fail', score: 0, agent: 'Not served over HTTPS on the final URL.' }),
    human: 'Sees the padlock.',
    fix: 'HTTPS everywhere and avoid geo/consent redirect chains, which agents frequently fail to follow.',
  });

  return { id: 'accessibility', checks };
}

const kb = (b) => `${Math.max(1, Math.round((b || 0) / 1024))} KB`;
