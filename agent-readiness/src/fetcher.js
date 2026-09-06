// Network layer: fetches a page the way a shopping agent would, the way a
// browser would, and probes the side files agents rely on.

export const AGENT_UA =
  'Mozilla/5.0 (compatible; AgentVisibilityTester/1.0; +https://mastercard.com) ShoppingAgent/1.0';
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = 20000;
const MAX_BYTES = 4_000_000;

export async function httpGet(url, { ua = AGENT_UA, timeout = DEFAULT_TIMEOUT, method = 'GET', accept } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': ua,
        accept: accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en,de;q=0.9,cs;q=0.8,pl;q=0.8',
      },
    });
    let body = '';
    let bytes = 0;
    if (method !== 'HEAD' && res.body) {
      const reader = res.body.getReader();
      const chunks = [];
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        chunks.push(value);
      }
      try { await reader.cancel(); } catch { /* already closed */ }
      body = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    }
    clearTimeout(timer);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      redirected: res.redirected,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      bytes,
      ms: Date.now() - started,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      error: err.name === 'AbortError' ? `timeout after ${timeout}ms` : String(err.message || err),
      headers: {},
      body: '',
      bytes: 0,
      ms: Date.now() - started,
    };
  }
}

export function originOf(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

// The crawlers that actually matter for agentic shopping surfaces today.
export const AGENT_CRAWLERS = [
  { id: 'GPTBot', label: 'GPTBot', owner: 'OpenAI', role: 'training + browsing corpus' },
  { id: 'OAI-SearchBot', label: 'OAI-SearchBot', owner: 'OpenAI', role: 'ChatGPT search index' },
  { id: 'ChatGPT-User', label: 'ChatGPT-User', owner: 'OpenAI', role: 'live fetch during a user task' },
  { id: 'ClaudeBot', label: 'ClaudeBot', owner: 'Anthropic', role: 'index + retrieval' },
  { id: 'Claude-User', label: 'Claude-User', owner: 'Anthropic', role: 'live fetch during a user task' },
  { id: 'PerplexityBot', label: 'PerplexityBot', owner: 'Perplexity', role: 'answer index' },
  { id: 'Google-Extended', label: 'Google-Extended', owner: 'Google', role: 'Gemini / AI Overviews' },
  { id: 'Applebot-Extended', label: 'Applebot-Extended', owner: 'Apple', role: 'Apple Intelligence' },
  { id: 'meta-externalagent', label: 'meta-externalagent', owner: 'Meta', role: 'Meta AI' },
  { id: 'Amazonbot', label: 'Amazonbot', owner: 'Amazon', role: 'Alexa / Rufus' },
];

// Parse robots.txt into per-user-agent rule groups and evaluate a path.
export function parseRobots(txt = '') {
  const groups = [];
  let current = null;
  let lastWasUa = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(':');
    const field = rawField.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (field === 'user-agent') {
      if (!current || !lastWasUa) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasUa = true;
    } else if (current) {
      lastWasUa = false;
      if (field === 'allow' || field === 'disallow') current.rules.push({ type: field, path: value });
      if (field === 'crawl-delay') current.crawlDelay = Number(value) || null;
    }
  }
  const sitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  return { groups, sitemaps, raw: txt };
}

function matchRule(path, pattern) {
  if (pattern === '') return false;
  let p = pattern;
  let anchored = false;
  if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
  const parts = p.split('*');
  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i === 0) {
      if (!path.startsWith(seg)) return false;
      idx = seg.length;
    } else if (seg === '') {
      // trailing wildcard
    } else {
      const found = path.indexOf(seg, idx);
      if (found === -1) return false;
      idx = found + seg.length;
    }
  }
  if (anchored && !p.includes('*')) return path === p;
  return true;
}

export function robotsVerdict(robots, uaToken, path = '/') {
  const ua = uaToken.toLowerCase();
  const groups = robots.groups || [];
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && (ua.includes(a) || a.includes(ua))));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const chosen = specific.length ? specific : wildcard;
  if (!chosen.length) return { decision: 'unspecified', matched: null, source: null };
  let best = null;
  for (const g of chosen) {
    for (const r of g.rules) {
      if (matchRule(path, r.path)) {
        const len = r.path.length;
        if (!best || len > best.path.length || (len === best.path.length && r.type === 'allow')) {
          best = { ...r, len };
        }
      }
    }
  }
  const source = specific.length ? 'explicit' : 'wildcard';
  if (!best) return { decision: 'allowed', matched: null, source };
  return { decision: best.type === 'allow' ? 'allowed' : 'blocked', matched: best.path, source };
}

// Files an agent looks for before it trusts a merchant.
export const WELL_KNOWN_PROBES = [
  { path: '/robots.txt', id: 'robots', label: 'robots.txt' },
  { path: '/llms.txt', id: 'llms', label: 'llms.txt' },
  { path: '/sitemap.xml', id: 'sitemap', label: 'sitemap.xml' },
  { path: '/.well-known/agentic-commerce', id: 'acp', label: '.well-known/agentic-commerce' },
  { path: '/.well-known/agent.json', id: 'agentcard', label: '.well-known/agent.json (A2A agent card)' },
  { path: '/.well-known/ai-plugin.json', id: 'aiplugin', label: '.well-known/ai-plugin.json' },
  { path: '/.well-known/mcp.json', id: 'mcp', label: '.well-known/mcp.json (MCP endpoint)' },
  { path: '/.well-known/apple-app-site-association', id: 'aasa', label: 'app deep links' },
  { path: '/.well-known/security.txt', id: 'securitytxt', label: 'security.txt' },
];

export async function probeWellKnown(origin) {
  const results = {};
  await Promise.all(
    WELL_KNOWN_PROBES.map(async (p) => {
      const r = await httpGet(origin + p.path, { timeout: 8000 });
      const isHtml = /<html/i.test(r.body.slice(0, 400));
      results[p.id] = {
        ...p,
        url: origin + p.path,
        status: r.status,
        // Many shops answer every path with the SPA shell; that is not a real file.
        found: r.status >= 200 && r.status < 300 && r.body.trim().length > 0 && !(p.id !== 'sitemap' && isHtml),
        bytes: r.bytes,
        body: r.body.slice(0, 20000),
        error: r.error || null,
      };
    })
  );
  return results;
}
