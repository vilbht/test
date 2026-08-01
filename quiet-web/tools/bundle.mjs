// bundle.mjs — inline the whole game into one self-contained HTML file.
//
//   node tools/bundle.mjs   →   dist/quiet-web.html
//
// The published artifact runs under a CSP that blocks every external host and
// serves a single document, so no <link>, no ES module graph, and no fetch can
// survive. This flattens all of it into one file.
//
// Output goes to dist/ and never build/: the repo's .gitignore has an
// unanchored `build/` rule that would silently swallow the result.
//
// It is a deliberately small bundler — no minifier, no tree shaking, no
// circular-import handling — because the module graph here is a shallow tree
// and anything cleverer would be untested code standing between the game and
// the player. What it does do is refuse to emit a broken bundle: concatenating
// modules into one scope makes duplicate top-level names a real hazard, so it
// detects collisions and fails loudly instead of shipping a file whose symptom
// would be a blank canvas.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'js/main.js');
const OUT = resolve(ROOT, 'dist/quiet-web.html');
const OUT_FRAGMENT = resolve(ROOT, 'dist/quiet-web.fragment.html');

const IMPORT_RE = /^import\s+(?:\{[\s\S]*?\}|[\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const BARE_IMPORT_RE = /^import\s+['"]([^'"]+)['"];?\s*$/gm;

/** Depth-first walk of the module graph, deepest dependency first. */
function collect(file, seen = new Set(), order = []) {
  const key = resolve(file);
  if (seen.has(key)) return order;
  seen.add(key);

  const src = readFileSync(key, 'utf8');
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) deps.push(m[1]);
  for (const m of src.matchAll(BARE_IMPORT_RE)) deps.push(m[1]);

  for (const spec of deps) {
    if (!spec.startsWith('.')) {
      throw new Error(`${relative(ROOT, key)}: bare import "${spec}" cannot be inlined`);
    }
    collect(resolve(dirname(key), spec), seen, order);
  }

  order.push({ path: key, src });
  return order;
}

/** Remove the module syntax that has no meaning once everything shares a scope. */
function strip(src) {
  return src
    .replace(IMPORT_RE, '')
    .replace(BARE_IMPORT_RE, '')
    .replace(/^export\s+default\s+/gm, 'const __default = ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class|async)\b)/gm, '');
}

/** Top-level declarations, which is where a name collision would bite. */
function topLevelNames(src) {
  const names = [];
  const re = /^(?:const|let|var|function|class)\s+\*?\s*([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(re)) names.push(m[1]);
  return names;
}

function build() {
  const modules = collect(ENTRY);
  const owner = new Map();
  const chunks = [];

  for (const mod of modules) {
    const code = strip(mod.src);
    const name = relative(ROOT, mod.path);

    for (const id of topLevelNames(code)) {
      if (owner.has(id)) {
        throw new Error(
          `duplicate top-level name "${id}" in ${name} and ${owner.get(id)}. ` +
          'Inlined modules share one scope — rename one of them.',
        );
      }
      owner.set(id, name);
    }
    chunks.push(`/* ---- ${name} ---- */\n${code.trim()}\n`);
  }

  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(resolve(ROOT, 'css/styles.css'), 'utf8');

  const out = html
    .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
    .replace(
      /<script type="module" src="[^"]*"><\/script>/,
      `<script type="module">\n${chunks.join('\n')}\n</script>`,
    );

  if (out.includes('<link rel="stylesheet"') || out.includes('script type="module" src=')) {
    throw new Error('index.html shape changed — bundler did not substitute cleanly');
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);
  report(OUT, out, modules.length);

  // Second output for hosts that supply their own document skeleton and expect
  // page content only — a nested <html> there would be dropped by the parser,
  // taking the <style> and the game script with it.
  writeFileSync(OUT_FRAGMENT, toFragment(out));
  report(OUT_FRAGMENT, toFragment(out), modules.length);
}

function report(path, text, count) {
  const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
  console.log(`${relative(ROOT, path)}  ${kb} kB  (${count} modules inlined)`);
}

/** Strip the document wrapper, keeping <title>, <style> and everything in <body>. */
function toFragment(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'The Quiet Web';
  const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1];
  if (!body) throw new Error('could not find <body> to extract');
  return `<title>${title}</title>\n${style}\n${body.trim()}\n`;
}

build();
