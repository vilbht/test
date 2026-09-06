// Minimal dependency-free HTML inspection helpers.
// Deliberately tolerant: retailer HTML in the wild is rarely well-formed.

export function stripTags(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function visibleText(html = '') {
  return stripTags(html);
}

export function tagCount(html = '', tag) {
  const m = html.match(new RegExp(`<${tag}\\b`, 'gi'));
  return m ? m.length : 0;
}

export function attrOf(tagHtml = '', attr) {
  const re = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tagHtml.match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
}

export function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function allTags(html = '', tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  return html.match(re) || [];
}

export function metaContent(html = '', { name, property } = {}) {
  for (const tag of allTags(html, 'meta')) {
    const n = (attrOf(tag, 'name') || '').toLowerCase();
    const p = (attrOf(tag, 'property') || '').toLowerCase();
    if (name && n === name.toLowerCase()) return attrOf(tag, 'content');
    if (property && p === property.toLowerCase()) return attrOf(tag, 'content');
  }
  return null;
}

export function links(html = '') {
  return allTags(html, 'a')
    .map((t) => ({ href: attrOf(t, 'href'), rel: attrOf(t, 'rel'), tag: t }))
    .filter((l) => l.href);
}

export function linkRel(html = '', rel) {
  for (const tag of allTags(html, 'link')) {
    const r = (attrOf(tag, 'rel') || '').toLowerCase();
    if (r.split(/\s+/).includes(rel.toLowerCase())) return attrOf(tag, 'href');
  }
  return null;
}

export function linkRelAll(html = '', rel) {
  const out = [];
  for (const tag of allTags(html, 'link')) {
    const r = (attrOf(tag, 'rel') || '').toLowerCase();
    if (r.split(/\s+/).includes(rel.toLowerCase())) out.push({ href: attrOf(tag, 'href'), tag });
  }
  return out;
}

export function images(html = '') {
  return allTags(html, 'img').map((t) => ({
    src: attrOf(t, 'src') || attrOf(t, 'data-src') || attrOf(t, 'srcset'),
    alt: attrOf(t, 'alt'),
    hasAlt: /\balt\s*=/.test(t),
  }));
}

export function forms(html = '') {
  const re = /<form\b[^>]*>[\s\S]*?<\/form>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const open = m[0].match(/<form\b[^>]*>/i)?.[0] || '';
    out.push({
      action: attrOf(open, 'action'),
      method: (attrOf(open, 'method') || 'get').toLowerCase(),
      html: m[0],
      text: stripTags(m[0]),
    });
  }
  return out;
}

// Extract all JSON-LD blocks, tolerating trailing commas and multiple objects.
export function jsonLdBlocks(html = '') {
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '');
    try {
      out.push(JSON.parse(raw));
    } catch {
      try {
        out.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch {
        out.push({ __parseError: true, __raw: raw.slice(0, 400) });
      }
    }
  }
  return out;
}

// Flatten @graph / arrays into a list of typed nodes.
export function flattenLd(blocks = []) {
  const nodes = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n['@graph']) n['@graph'].forEach ? n['@graph'].forEach(walk) : walk(n['@graph']);
    if (n['@type'] || n['@context']) nodes.push(n);
    for (const v of Object.values(n)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  blocks.forEach(walk);
  return nodes;
}

export function typeList(node) {
  const t = node?.['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((x) => String(x).replace(/^https?:\/\/schema\.org\//i, ''));
}

export function hasType(node, ...types) {
  const list = typeList(node).map((t) => t.toLowerCase());
  return types.some((t) => list.includes(t.toLowerCase()));
}

// Microdata: crude but catches the common itemtype=".../Product" pattern.
export function microdataTypes(html = '') {
  const out = new Set();
  const re = /itemtype\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) out.add(m[1].replace(/^https?:\/\/schema\.org\//i, ''));
  return [...out];
}

export function microdataProps(html = '') {
  const out = new Set();
  const re = /itemprop\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) m[1].split(/\s+/).forEach((p) => out.add(p));
  return [...out];
}

export function lang(html = '') {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  return attrOf(htmlTag, 'lang');
}

export function title(html = '') {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

export const PRICE_RE =
  /(?:€|EUR|CZK|Kč|PLN|zł|HUF|Ft|RON|lei|BGN|лв|USD|\$|£)\s?\d[\d .,]*|\d[\d .,]*\s?(?:€|EUR|CZK|Kč|PLN|zł|HUF|Ft|RON|lei|BGN|USD)/gi;

export function pricesInText(text = '') {
  return [...new Set((text.match(PRICE_RE) || []).map((s) => s.trim()))];
}
