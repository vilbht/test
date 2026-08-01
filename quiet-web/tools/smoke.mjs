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

// ---- gravity carries the fox down the mountain with no input at all
const before = await page.evaluate(() => window.__quiet.rider.x);
await page.waitForTimeout(1200);
const after = await page.evaluate(() => window.__quiet.rider.x);
check('the slope moves the fox on its own', after > before + 100,
  `${before.toFixed(0)} → ${after.toFixed(0)}`);
check('and it is carrying speed',
  await page.evaluate(() => window.__quiet.rider.speed > 140));

// ---- one button: a tap leaves the ground
const airborne = await page.evaluate(async () => {
  const q = window.__quiet;
  for (let attempt = 0; attempt < 6; attempt++) {
    q.press();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!q.rider.onGround) { q.release(); return true; }
    }
    q.release();
  }
  return false;
});
check('a tap leaves the ground', airborne);

// ---- holding the button in the air rotates the fox
const spun = await page.evaluate(async () => {
  const q = window.__quiet;
  for (let attempt = 0; attempt < 8; attempt++) {
    q.press();
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      peak = Math.max(peak, Math.abs(q.rider.rotation));
      if (q.rider.onGround && i > 10) break;
    }
    q.release();
    if (peak > 1.5) return peak;
  }
  return 0;
});
check('holding the button spins a backflip', spun > 1.5, `${spun.toFixed(2)} rad`);

await page.waitForTimeout(400);

// ---- nothing has gone non-finite
const finite = await page.evaluate(() => {
  const q = window.__quiet;
  const nums = [q.rider.x, q.rider.y, q.rider.speed, q.rider.angle, q.rider.rotation];
  const tail = q.tail.points.flatMap((p) => [p.x, p.y]);
  return [...nums, ...tail].every(Number.isFinite);
});
check('no NaN in the rider or tail', finite);

// ---- a campfire lights as the fox passes, with no need to stop
const lit = await page.evaluate(async () => {
  const q = window.__quiet;
  const b = q.level.beacons.find((x) => !x.lit);
  q.rider.x = b.x;
  q.rider.y = b.y;
  for (let i = 0; i < 200; i++) {
    if (b.lit) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
});
check('riding past a campfire lights it', lit);
check('lighting a campfire shows its fact',
  await page.evaluate(() => !document.getElementById('fact').hidden));

// ---- the day/night cycle actually advances
const cycled = await page.evaluate(async () => {
  const q = window.__quiet;
  const read = () => document.getElementById('chapter').textContent;
  q.rider.x = 200;
  await new Promise((r) => requestAnimationFrame(r));
  const dawn = read();
  q.rider.x = q.level.length - 400;
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
  return { dawn, night: read() };
});
check('the light changes over the descent', cycled.dawn !== cycled.night,
  `${cycled.dawn} → ${cycled.night}`);

// ---- frame budget, measured while the game is actually running
const fps = await page.evaluate(async () => {
  window.__quiet.rider.x = 1200;
  const t0 = performance.now();
  let frames = 0;
  while (performance.now() - t0 < 2000) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
  }
  return (frames * 1000) / (performance.now() - t0);
});
check('holds frame rate', fps >= 50, `${fps.toFixed(1)} fps`);

// ---- falling into a chasm lifts the fox out; a no-fail game keeps your score
const rescued = await page.evaluate(async () => {
  const q = window.__quiet;
  const chasm = q.terrain.chasms[1] || q.terrain.chasms[0];
  const kept = q.run.coins;
  q.rider.x = chasm.x0 + 8;
  q.rider.onGround = false;
  q.rider.vx = 40;
  q.rider.vy = 300;
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (q.rider.onGround && q.rider.x > chasm.x1) return q.run.coins >= kept;
  }
  return false;
});
check('falling into a chasm lifts the fox out, losing nothing', rescued);

check('still no errors after play', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
