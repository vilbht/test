// smoke.mjs — browser checks the node tests cannot make.
//
//   node tools/smoke.mjs [url]
//
// The unit tests prove the simulation is correct in isolation. This proves the
// thing a player actually loads is wired up: that modules resolve, the canvas
// paints, input reaches the character controller, and the frame budget holds.
//
// Run it against dist/quiet-web.html as well as the dev page. The bundle is a
// separate artifact built by a script that rewrites every module into one
// scope, so "the dev page works" is not evidence that the shipped file does.

import { createRequire } from 'node:module';

// Resolved through createRequire rather than a static import: ESM ignores
// NODE_PATH, so a globally installed Playwright — which is how CI and most
// sandboxes provide it, this repo having no package.json by convention — is
// invisible to `import`. PLAYWRIGHT_PATH overrides for anything unusual.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const spec of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) {
    try { return require(spec); } catch { /* try the next candidate */ }
  }
  console.error('Playwright not found. Install it, or set PLAYWRIGHT_PATH to its directory.');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const url = process.argv[2] || 'http://localhost:8000/index.html';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

check('page loads with no errors', errors.length === 0, errors.join(' | '));
check('game state is exposed', await page.evaluate(() => typeof window.__quiet === 'object'));

// ---- the canvas is actually painted, not a blank rectangle
const painted = await page.evaluate(() => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const { data } = g.getImageData(0, 0, c.width, c.height);
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4 * 997) {
    seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return seen.size;
});
check('canvas renders varied pixels', painted > 12, `${painted} distinct samples`);

await page.click('#begin');
await page.waitForTimeout(300);

// ---- input reaches the character controller
const before = await page.evaluate(() => window.__quiet.body.x);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(900);
const after = await page.evaluate(() => window.__quiet.body.x);
check('running right moves the fox', after > before + 60, `${before.toFixed(0)} → ${after.toFixed(0)}`);

// ---- jumping leaves the ground
await page.keyboard.down('Space');
const airborne = await page.evaluate(async () => {
  for (let i = 0; i < 40; i++) {
    if (!window.__quiet.body.onGround) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
});
await page.keyboard.up('Space');
check('jump leaves the ground', airborne);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(500);

// ---- nothing has gone non-finite
const finite = await page.evaluate(() => {
  const q = window.__quiet;
  const nums = [q.body.x, q.body.y, q.body.vx, q.body.vy];
  const tail = q.tail.points.flatMap((p) => [p.x, p.y]);
  return [...nums, ...tail].every(Number.isFinite);
});
check('no NaN in the body or tail', finite);

// ---- a beacon lights when the fox stands by it
const lit = await page.evaluate(async () => {
  const q = window.__quiet;
  const b = q.level.beacons.find((x) => !x.lit);
  q.body.x = b.x;
  q.body.y = b.y;
  q.body.vx = 0;
  q.body.vy = 0;
  for (let i = 0; i < 400; i++) {
    if (b.lit) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
});
check('standing by a beacon lights it', lit);
// The card is drawn on the canvas above the beacon now, not in the DOM, so the
// check is on the state that feeds it — plus that the fox is actually looking up
// at it, which is the whole point of moving it into the world.
const reading = await page.evaluate(async () => {
  const q = globalThis.__quiet;
  // the look-up is sprung, so sample its peak rather than the frame it started on
  let peak = 0;
  for (let i = 0; i < 45; i++) {
    peak = Math.max(peak, q.gaze.value);
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { fact: q.run.fact?.title || null, beacon: !!q.run.factBeacon, gaze: peak };
});
check('lighting a beacon raises its fact card', !!reading.fact && reading.beacon,
  reading.fact || 'no fact');
check('and the fox looks up to read it', reading.gaze > 0.3,
  `gaze ${reading.gaze.toFixed(2)}`);

// ---- the shield pulse spins the fox into the Firefox mark and back
const flourish = await page.evaluate(async () => {
  const q = window.__quiet;
  q.run.focus = 1;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));

  let peak = 0;
  let spun = false;
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (q.spin.active) spun = true;
    peak = Math.max(peak, q.spin.angle);
    if (spun && !q.spin.active) break;
  }
  return { spun, peak, restAngle: q.spin.angle, active: q.spin.active };
});
check('the pulse spins the fox', flourish.spun && flourish.peak > 6,
  `peaked at ${(flourish.peak / (Math.PI * 2)).toFixed(2)} turns`);
check('and the fox ends upright, not left tilted',
  !flourish.active && flourish.restAngle === 0);

// ---- frame budget, measured while the game is actually running
await page.keyboard.down('ArrowRight');
const fps = await page.evaluate(async () => {
  const t0 = performance.now();
  let frames = 0;
  while (performance.now() - t0 < 2000) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
  }
  return (frames * 1000) / (performance.now() - t0);
});
await page.keyboard.up('ArrowRight');
check('holds frame rate', fps >= 50, `${fps.toFixed(1)} fps`);

// ---- fall recovery: a no-fail game must lift the fox back out
const rescued = await page.evaluate(async () => {
  const q = window.__quiet;
  const kept = q.run.sparkles;
  q.body.y = 3000;
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (q.body.y < 1000) return q.run.sparkles === kept;
  }
  return false;
});
check('falling lifts the fox back, losing nothing', rescued);

check('still no errors after play', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
