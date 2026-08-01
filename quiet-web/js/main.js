// main.js — the only file that touches the DOM: loop, input, camera, HUD.
//
// One button. Tap to jump, hold in the air to backflip, and that is the whole
// control scheme — everything else is the mountain doing the work. The
// simulation lives in core/ and is unit-tested there, so this file stays thin
// glue and "does it feel right" remains a question about core/ride.mjs.

import { FIXED_DT, createClock, advance } from '../core/physics.mjs';
import { createRider, stepRider, speedFraction, surfaceBasis, RIDE } from '../core/ride.mjs';
import { surfaceY, angleAt } from '../core/terrain.mjs';
import { generateLevel, progressAt, chapterAt } from '../core/level.mjs';
import { paletteAt } from '../core/daylight.mjs';
import { createRun, stepRules, stepTrackers } from '../core/rules.mjs';
import { createChain, stepChain } from '../core/verlet.mjs';
import { createSpring, stepSpring, squashStretch } from '../core/springs.mjs';
import { windAt } from '../core/bodies.mjs';
import { ProceduralFox, foxTailForces, foxTailSpread } from './art/fox.js';
import {
  drawSky, drawStars, drawSun, drawClouds, drawMountains,
  drawSlope, drawTrees, drawSnowfall, drawBirds, drawShootingStar,
} from './art/scenery.js';
import {
  drawCoin, drawCampfire, drawRock, drawTracker, drawRail,
  drawSpray, drawFlipBurst, drawTrickLabel,
} from './art/entities.js';
import { createAudio } from './audio.js';

const VW = 960;
const VH = 540;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = {
  chapter: document.getElementById('chapter'),
  coins: document.getElementById('coins'),
  flips: document.getElementById('flips'),
  distance: document.getElementById('distance'),
  speed: document.getElementById('speed'),
  mute: document.getElementById('mute'),
  fact: document.getElementById('fact'),
  factTitle: document.getElementById('fact-title'),
  factBody: document.getElementById('fact-body'),
  debug: document.getElementById('debug'),
  start: document.getElementById('start'),
  begin: document.getElementById('begin'),
  finish: document.getElementById('finish'),
  summary: document.getElementById('summary'),
  again: document.getElementById('again'),
};

// ---------------------------------------------------------------- input

const KEYS = ['Space', 'ArrowUp', 'KeyW', 'Enter'];
let held = false;
let pressed = false;

function press() { if (!held) pressed = true; held = true; }
function release() { held = false; }

addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { el.debug.hidden = !el.debug.hidden; return; }
  if (e.code === 'KeyM') { el.mute.hidden = !audio.toggleMute(); return; }
  if (!KEYS.includes(e.code)) return;
  e.preventDefault();
  if (!e.repeat) press();
});
addEventListener('keyup', (e) => { if (KEYS.includes(e.code)) release(); });
addEventListener('blur', release);
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

// ---------------------------------------------------------------- state

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 7;

const level = generateLevel(seed);
const { terrain } = level;
const rider = createRider(terrain);
const run = createRun();
const clock = createClock();
const audio = createAudio();

const tail = createChain({ x: rider.x, y: rider.y - 18, count: 11, segment: 3.0, taper: 0.05 });
const zoomSpring = createSpring(1);

const cam = { x: 0, y: 0, shake: 0, zoom: 1 };
let camFocusY = rider.y;

const spray = [];
let flipBurst = 0;
let flipBurstAt = { x: 0, y: 0 };
let trickLabel = null;
let trickTimer = 0;

let elapsed = 0;
let ridePhase = 0;
let landImpulse = 0;
let running = false;
let fps = 60;
let palette = paletteAt(0);

// ---------------------------------------------------------------- simulation

function step(dt) {
  elapsed += dt;
  ridePhase += (Math.abs(rider.speed) / 90) * dt;

  const input = { jumpPressed: pressed, jumpHeld: held };
  const events = stepRider(rider, terrain, level.rails, input, dt);
  pressed = false;

  const ruleEvents = stepRules(run, level, rider, events, dt);
  stepTrackers(level, rider, dt, elapsed);
  stepTail(dt);
  stepSpray(dt);

  const progress = progressAt(level, rider.x);
  palette = paletteAt(progress);
  audio.setProgress(progress);

  if (events.landed) {
    landImpulse = Math.min(0.34, Math.abs(rider.vy) / 900 + 0.1);
    cam.shake = Math.min(6, landImpulse * 14);
    audio.land(landImpulse);
  }
  if (events.launched) audio.launch();
  if (events.grindStart) audio.grind();
  if (events.tumbled) { cam.shake = 7; audio.tumble(); }
  if (events.rescued) cam.shake = 5;

  if (events.flips > 0) {
    flipBurst = 1;
    flipBurstAt = { x: rider.x, y: rider.y - 18 };
    trickLabel = events.flips > 1 ? `${events.flips}× BACKFLIP` : 'BACKFLIP';
    trickTimer = 1;
    audio.trick(events.flips);
  }
  if (ruleEvents.coins > 0) audio.coin();
  if (ruleEvents.litBeacon) audio.campfire(run.lit - 1);
  if (ruleEvents.rock) { cam.shake = 5; audio.tumble(); }

  landImpulse *= 0.86;
  cam.shake *= 0.87;
  flipBurst = Math.max(0, flipBurst - dt * 1.6);
  trickTimer = Math.max(0, trickTimer - dt * 0.7);

  if (run.finished && el.finish.hidden) showSummary();
}

function stepTail(dt) {
  tail.spreadTarget = foxTailSpread(rider.speed, !rider.onGround, RIDE.maxSpeed * 0.55);
  const w = windAt(level.winds, rider.x, rider.y - 20, elapsed);
  const a = rider.angle;

  // anchored at the hips, which rotate with the fox during a flip
  stepChain(tail, dt, {
    anchorX: rider.x - Math.cos(a) * 8,
    anchorY: rider.y - 18 - Math.sin(a) * 8,
    ...foxTailForces({ facing: 1, vx: rider.vx, vy: rider.vy, wind: w }),
  });
}

/**
 * Snow thrown off the paws.
 *
 * Emitted backwards along the surface tangent, not straight up: this is snow
 * being cut by something crossing a slope, and a vertical puff would read as
 * dust on a flat floor.
 */
function stepSpray(dt) {
  if (rider.onGround && !rider.grinding) {
    const rate = speedFraction(rider);
    // Several grains per step, not one. A single particle per frame at speed
    // strings out into a dotted line trailing the fox; snow being cut has to
    // come off as a plume, which needs both a burst and a spread of angles.
    const grains = rate > 0.16 ? 1 + Math.floor(rate * 3) : 0;
    for (let i = 0; i < grains; i++) {
      const b = surfaceBasis(terrain, rider.x);
      const back = 0.25 + Math.random() * 0.5;
      const lift = 0.4 + Math.random() * 1.3;
      spray.push({
        x: rider.x - b.tx * 7 + (Math.random() - 0.5) * 7,
        y: rider.y - b.ty * 7 - Math.random() * 4,
        vx: -b.tx * rider.speed * back + (Math.random() - 0.5) * 70,
        vy: -b.ty * rider.speed * back - rider.speed * lift * 0.28 - 20,
        r: 0.9 + Math.random() * 2.2,
        life: 0.26 + Math.random() * 0.42,
        max: 0.68,
      });
    }
  }

  for (let i = spray.length - 1; i >= 0; i--) {
    const p = spray[i];
    p.life -= dt;
    if (p.life <= 0) { spray.splice(i, 1); continue; }
    p.vy += 520 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (spray.length > 400) spray.splice(0, spray.length - 400);
}

// ---------------------------------------------------------------- render

function render(alpha) {
  const ix = rider.px + (rider.x - rider.px) * alpha;
  const iy = rider.py + (rider.y - rider.py) * alpha;
  const fast = speedFraction(rider);

  // Pull the view back as speed rises, so the faster the fox goes the more of
  // the mountain it can read ahead of it. This is the one camera move that makes
  // high speed feel controllable rather than blind.
  stepSpring(zoomSpring, 1 - fast * 0.16, FIXED_DT, 2.2);
  cam.zoom = zoomSpring.value;

  const viewW = VW / cam.zoom;
  const viewH = VH / cam.zoom;

  const lead = 60 + fast * 180;
  cam.x += ((ix - viewW * 0.34 + lead) - cam.x) * 0.10;
  cam.x = Math.max(0, Math.min(level.length - viewW, cam.x));

  // Vertical follow anchors to the ground the fox last stood on, so airs and
  // rollers never bob the horizon; a long fall still drags the anchor with it.
  const slack = 170;
  if (rider.onGround) camFocusY = iy;
  else if (iy > camFocusY + slack) camFocusY = iy - slack;
  else if (iy < camFocusY - slack) camFocusY = iy + slack;
  cam.y += ((camFocusY - viewH * 0.62) - cam.y) * 0.07;

  drawSky(ctx, palette, VW, VH);
  drawStars(ctx, palette, cam, VW, VH, elapsed);
  drawShootingStar(ctx, palette, cam, VW, VH, elapsed);
  drawSun(ctx, palette, cam, VW, VH);
  drawClouds(ctx, palette, cam, VW, VH, elapsed);
  drawMountains(ctx, palette, cam, VW, VH);
  drawBirds(ctx, palette, cam, VW, VH, elapsed);

  const shakeX = (Math.random() - 0.5) * cam.shake;
  const shakeY = (Math.random() - 0.5) * cam.shake;

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-Math.round(cam.x + shakeX), -Math.round(cam.y + shakeY));

  drawSlope(ctx, terrain, palette, cam, viewW, viewH);
  drawTrees(ctx, terrain, palette, cam, viewW);
  drawWorld(viewW);
  drawSpray(ctx, spray, palette);

  drawFox(ix, iy);

  drawFlipBurst(ctx, flipBurstAt.x, flipBurstAt.y, flipBurst);
  if (trickLabel) drawTrickLabel(ctx, trickLabel, ix, iy - 54, trickTimer);

  ctx.restore();

  drawSnowfall(ctx, palette, cam, VW, VH, elapsed, 0.25 + palette.star * 0.35);
  drawHud();
}

function drawWorld(viewW) {
  const l = cam.x - 80;
  const r = cam.x + viewW + 80;
  const seen = (x) => x > l && x < r;

  for (const rail of level.rails) {
    if (rail.x1 < l || rail.x0 > r) continue;
    drawRail(ctx, terrain, rail, palette, elapsed, rider.grinding === rail);
  }
  for (const rock of level.rocks) if (seen(rock.x)) drawRock(ctx, terrain, rock, palette);
  for (const b of level.beacons) if (seen(b.x)) drawCampfire(ctx, b, palette, elapsed);
  for (const c of level.coins) if (!c.got && seen(c.x)) drawCoin(ctx, c, elapsed);
  for (const k of level.trackers) {
    if (k.dispersed || !seen(k.x)) continue;
    drawTracker(ctx, k, palette, elapsed);
  }
}

function drawFox(ix, iy) {
  ProceduralFox.draw(ctx, ix, iy, {
    w: 22,
    h: 34,
    facing: 1,
    angle: rider.angle,
    phase: ridePhase,
    airborne: !rider.onGround,
    onGround: rider.onGround,
    tail,
    squash: squashStretch(rider.vy, landImpulse, 900),
    speed: Math.abs(rider.speed),
    tumble: Math.min(1, rider.tumble / RIDE.tumbleTime),
    groundY: surfaceY(terrain, rider.x),
  });
}

// ---------------------------------------------------------------- HUD

let lastFact = null;

function drawHud() {
  const progress = progressAt(level, rider.x);
  el.chapter.textContent = `${chapterAt(progress).name} · ${palette.name}`;
  el.coins.textContent = `✦ ${run.coins}`;
  el.flips.textContent = `⟳ ${run.flips}`;
  el.distance.textContent = `${Math.round(rider.x / 10)} m`;
  el.speed.style.transform = `scaleX(${speedFraction(rider).toFixed(3)})`;

  if (run.fact !== lastFact) {
    lastFact = run.fact;
    if (run.fact) {
      el.factTitle.textContent = run.fact.title;
      el.factBody.textContent = run.fact.body;
      el.fact.hidden = false;
    } else {
      el.fact.hidden = true;
    }
  }

  if (!el.debug.hidden) {
    el.debug.textContent = [
      `fps       ${fps.toFixed(0)}`,
      `x y       ${rider.x.toFixed(0)} ${rider.y.toFixed(0)}`,
      `speed     ${rider.speed.toFixed(0)} (${(speedFraction(rider) * 100).toFixed(0)}%)`,
      `slope     ${(angleAt(terrain, rider.x) * 57.3).toFixed(1)}°`,
      `ground    ${rider.onGround}`,
      `air       ${rider.airTime.toFixed(2)}s`,
      `rotation  ${(rider.rotation / (Math.PI * 2)).toFixed(2)} turns`,
      `flips     ${run.flips}`,
      `grinding  ${rider.grinding ? 'yes' : 'no'}`,
      `cling     ${run.clung}`,
      `zoom      ${cam.zoom.toFixed(2)}`,
    ].join('\n');
  }
}

function showSummary() {
  el.summary.innerHTML = '';
  const rows = [
    ['Distance', `${Math.round(level.length / 10)} m`],
    ['Sparks', run.coins],
    ['Backflips', run.flips],
    ['Campfires lit', `${run.lit} / ${level.beacons.length}`],
    ['Grinds', run.grinds],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    el.summary.append(dt, dd);
  }
  el.finish.hidden = false;
}

// ---------------------------------------------------------------- loop

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = VW * dpr;
  canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;

  const dt = last ? Math.min(0.25, (now - last) / 1000) : FIXED_DT;
  last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.1;

  advance(clock, dt, step);
  render(clock.alpha);
}

el.begin.addEventListener('click', (e) => {
  e.stopPropagation();
  el.start.hidden = true;
  running = true;
  last = 0;
  audio.start();
});

el.again.addEventListener('click', () => location.reload());

resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);
render(0);

// exposed so the smoke test can drive the game without synthetic input
globalThis.__quiet = {
  rider, run, level, terrain, tail,
  start: () => el.begin.click(),
  press: () => { pressed = true; held = true; },
  release: () => { held = false; },
};
