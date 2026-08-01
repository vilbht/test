// main.js — the only file that touches the DOM: loop, input, camera, HUD.
//
// Everything simulated lives in core/ and is unit-tested there. This file is
// deliberately thin glue so that "does it feel right" is a question about
// core/physics.mjs, not about rendering.

import {
  FIXED_DT, TUNING, createBody, stepCharacter, createClock, advance,
} from '../core/physics.mjs';
import { createChain, stepChain, tipVelocity } from '../core/verlet.mjs';
import { createSpring, stepSpring, squashStretch } from '../core/springs.mjs';
import {
  windAt, stepSeesaw, seesawRects, seesawSurfaceY,
  stepCrates, pushCrates, crateRects,
} from '../core/bodies.mjs';
import { generateLevel, zoneAt } from '../core/level.mjs';
import { createSpin, triggerSpin, stepSpin, markMix, foxMix, spinDelta } from '../core/spin.mjs';
import { createRun, stepRules, stepTrackers, RULES } from '../core/rules.mjs';
import {
  ProceduralFox, GreyboxFox, createSpriteFox, foxTailForces, foxTailSpread,
} from './art/fox.js';
import { drawSky, drawSun, drawParallax, drawGround } from './art/scenery.js';
import {
  drawSparkle, drawBeacon, drawTracker, drawCrumb, drawCrate, drawSeesaw,
  drawVine, drawWindStreaks, drawLeaf, drawPulseRing,
} from './art/entities.js';
import { drawFirefoxMark } from './art/logo.js';
import { createAudio } from './audio.js';

const VW = 960;
const VH = 540;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = {
  zone: document.getElementById('zone'),
  sparkles: document.getElementById('sparkles'),
  beacons: document.getElementById('beacons'),
  focus: document.getElementById('focus'),
  fact: document.getElementById('fact'),
  factTitle: document.getElementById('fact-title'),
  factBody: document.getElementById('fact-body'),
  debug: document.getElementById('debug'),
  start: document.getElementById('start'),
  begin: document.getElementById('begin'),
  mute: document.getElementById('mute'),
};

// ---------------------------------------------------------------- input

const held = new Set();
const pressed = new Set();

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
  drop: ['ArrowDown', 'KeyS'],
  pulse: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
};

const isDown = (action) => BINDINGS[action].some((c) => held.has(c));
const wasPressed = (action) => BINDINGS[action].some((c) => pressed.has(c));

addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { el.debug.hidden = !el.debug.hidden; return; }
  if (e.code === 'KeyM') { el.mute.hidden = !audio.toggleMute(); return; }
  if (Object.values(BINDINGS).flat().includes(e.code)) e.preventDefault();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => { held.clear(); pressed.clear(); });

// ---------------------------------------------------------------- state

const seed = Number(new URLSearchParams(location.search).get('seed')) || 7;
const level = generateLevel(seed);
const body = createBody({ x: level.start.x, y: level.start.y });
const run = createRun();
const clock = createClock();

// Short and fat, not long and fat. The reference mascot's tail is about as long
// as its body but carries as much visual mass, so the links sum to ~29px at rest
// and near 60px unfurled at a sprint, paired with the wide taper in fox.js.
const tail = createChain({ x: body.x, y: body.y - 20, count: 11, segment: 3.4, taper: 0.045 });
const lean = createSpring(0);
const cam = { x: 0, y: 0, shake: 0 };
let camFocusY = level.start.y;

// ?art=grey falls back to flat boxes, for judging movement without art in the way.
// ?art=sprite loads assets/fox.png — see assets/README.md for the sheet layout.
const artMode = new URLSearchParams(location.search).get('art');
let fox = artMode === 'grey' ? GreyboxFox : ProceduralFox;

if (artMode === 'sprite') {
  const sheet = new Image();
  sheet.src = new URLSearchParams(location.search).get('sheet') || 'assets/fox.png';
  // Swapped in only once it has actually decoded. Failing back to the procedural
  // fox matters more than it sounds: a missing sheet would otherwise leave an
  // invisible player character with no error to explain why.
  sheet.addEventListener('load', () => { fox = createSpriteFox(sheet); });
  sheet.addEventListener('error', () => {
    console.warn(`fox sheet "${sheet.src}" did not load — keeping the procedural fox`);
  });
}

let elapsed = 0;
let gait = 0;
let landImpulse = 0;
let running = false;
let grabbed = null;      // { vine, index } while swinging
let fps = 60;

// where the last shield pulse fired, so its ring stays put in the world
// instead of following the fox as it runs on
const pulseAt = { x: body.x, y: body.y };

// The shield-pulse flourish: spin up, become the Firefox mark, unwind back.
const spin = createSpin();

const audio = createAudio();
let audioZone = null;

// ---------------------------------------------------------------- simulation

function collisionRects() {
  const rects = level.rects.slice();
  for (const s of level.seesaws) rects.push(...seesawRects(s));
  rects.push(...crateRects(level.crates));
  return rects;
}

function step(dt) {
  elapsed += dt;

  const move = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  const jumpPressed = wasPressed('jump');

  if (grabbed) {
    swing(dt, move, jumpPressed);
  } else {
    const input = {
      move: move * run.speedScale,
      jumpHeld: isDown('jump'),
      jumpPressed,
      dropHeld: isDown('drop'),
    };

    const rects = collisionRects();
    const events = stepCharacter(body, input, rects, dt);

    // wind nudges the fox as well as the tail, so a gust is felt not just seen
    const w = windAt(level.winds, body.x, body.y - body.h / 2, elapsed);
    body.vx += w.x * dt * 0.42;
    if (!body.onGround) body.vy += w.y * dt * 0.42;

    pushCrates(body, level.crates, move, dt);

    if (events.landed) {
      landImpulse = Math.min(0.34, Math.abs(body.vy) / TUNING.maxFall + 0.14);
      cam.shake = Math.min(5, landImpulse * 13);
      audio.land(landImpulse);
    }
    tryGrab();
  }

  landImpulse *= 0.86;
  cam.shake *= 0.87;

  stepCrates(level.crates, level.rects, dt);

  for (const s of level.seesaws) {
    const onPlank = !grabbed && body.onGround &&
      Math.abs(body.x - s.x) < s.len / 2 + 8 &&
      Math.abs(body.y - seesawSurfaceY(s, body.x)) < 10;
    stepSeesaw(s, onPlank ? [{ x: body.x, weight: 1 }] : [], dt);
  }

  for (const v of level.vines) {
    const w = windAt(level.winds, v.x, v.y, elapsed);
    stepChain(v.chain, dt, {
      anchorX: v.x, anchorY: v.y, gravity: 1100, damping: 0.992,
      iterations: 7, wind: w.x || w.y ? w : null,
    });
  }

  stepTail(dt);
  stepLeaves(dt);
  stepTrackers(level, body, dt, elapsed);

  const ruleEvents = stepRules(run, level, body, { pulsePressed: wasPressed('pulse') }, dt);
  if (ruleEvents.pulsed) {
    pulseAt.x = body.x;
    pulseAt.y = body.y - body.h / 2;
    audio.pulse();
    triggerSpin(spin);
  }
  stepSpin(spin, dt);
  if (ruleEvents.collected) audio.sparkle();
  if (ruleEvents.litBeacon) audio.beacon(run.lit - 1);

  const zoneKey = zoneAt(body.x).key;
  if (zoneKey !== audioZone) {
    audioZone = zoneKey;
    audio.setZone(zoneKey);
  }

  pressed.clear();
}

/**
 * Tail spread is the speed-reactive part of the brief: compact at idle, unfurled
 * to full drama at a sprint or mid-leap. The solver eases it; we only set a target.
 */
function stepTail(dt) {
  const facing = facingOf();
  tail.spreadTarget = foxTailSpread(body.vx, !body.onGround, TUNING.runSpeed);

  const w = windAt(level.winds, body.x, body.y - body.h / 2, elapsed);
  stepChain(tail, dt, {
    // Anchored at the rump, high and to the rear, matching where the tail root
    // sits on the body silhouette. Anchoring it nearer the middle buried the
    // first third of the plume inside the fox.
    anchorX: body.x - facing * 12,
    anchorY: body.y - 21,
    ...foxTailForces({ facing, vx: body.vx, vy: body.vy, wind: w }),
  });
}

let lastFacing = 1;
function facingOf() {
  if (body.vx > 12) lastFacing = 1;
  else if (body.vx < -12) lastFacing = -1;
  return lastFacing;
}

// ---------------------------------------------------------------- vines

function tryGrab() {
  if (body.onGround || body.vy < -60) return;
  for (const v of level.vines) {
    const p = v.chain.points;
    for (let i = 4; i < p.length; i++) {
      if (Math.hypot(p[i].x - body.x, p[i].y - (body.y - body.h / 2)) > 24) continue;
      grabbed = { vine: v, index: i };
      v.held = true;
      return;
    }
  }
}

function swing(dt, move, jumpPressed) {
  const { vine, index } = grabbed;
  const p = vine.chain.points[index];

  // Pumping adds tangential velocity at the grab point rather than torque —
  // position-based solvers stay stable under that, and it maps to how a swing
  // actually works: you drive it, you do not rotate it.
  if (move) p.px -= move * 34 * dt;

  const w = windAt(level.winds, vine.x, vine.y, elapsed);
  stepChain(vine.chain, dt, {
    anchorX: vine.x, anchorY: vine.y, gravity: 1100, damping: 0.994,
    iterations: 7, wind: w.x || w.y ? w : null,
  });

  body.px = body.x;
  body.py = body.y;
  body.x = p.x;
  body.y = p.y + body.h / 2;
  body.vx = (p.x - p.px) / dt;
  body.vy = (p.y - p.py) / dt;
  body.onGround = false;

  if (jumpPressed) {
    const t = tipVelocity(vine.chain, dt);
    body.vx = Math.max(-460, Math.min(460, t.vx * 0.6 + body.vx * 0.5));
    body.vy = Math.max(-520, TUNING.jumpVelocity * 0.72 + Math.min(0, body.vy));
    vine.held = false;
    grabbed = null;
  }
}

// ---------------------------------------------------------------- render

function render(alpha) {
  const ix = body.px + (body.x - body.px) * alpha;
  const iy = body.py + (body.y - body.py) * alpha;

  // camera: lead the fox in the direction of travel, clamp to the world
  const lead = Math.max(-90, Math.min(140, body.vx * 0.34));
  const targetX = ix - VW * 0.36 + lead;

  // Vertical follow tracks the ground the fox is standing on, not the fox
  // itself, so jumping never bobs the horizon. Mid-air the anchor only moves
  // once the fox is further than `slack` from it — enough to keep a fall or a
  // vine swing in frame without reacting to a hop.
  //
  // A plain dead zone was tried first and is wrong: it has no restoring force,
  // so the camera that pans down to follow one fall stays down forever after,
  // leaving the fox pinned near the top of the screen for the rest of the run.
  // Anchoring to a value that is itself re-established on every landing is what
  // makes the camera recover.
  const slack = 150;
  if (body.onGround) camFocusY = iy;
  else if (iy > camFocusY + slack) camFocusY = iy - slack;
  else if (iy < camFocusY - slack) camFocusY = iy + slack;

  const targetY = Math.max(-300, Math.min(400, camFocusY - VH * 0.74));

  cam.x += (targetX - cam.x) * 0.09;
  cam.y += (targetY - cam.y) * 0.08;
  cam.x = Math.max(0, Math.min(level.width - VW, cam.x));

  const shakeX = (Math.random() - 0.5) * cam.shake;
  const shakeY = (Math.random() - 0.5) * cam.shake;

  const zone = zoneAt(ix);

  // sky, sun and parallax are screen space, before the camera transform
  drawSky(ctx, zone.key, VW, VH, cam.y);
  drawSun(ctx, zone.key, VW, VH, cam);
  drawParallax(ctx, zone.key, cam, VW, VH, elapsed);

  ctx.save();
  ctx.translate(-Math.round(cam.x + shakeX), -Math.round(cam.y + shakeY));

  drawWorld(zone.key, ix);
  drawEntities();

  stepSpring(lean, Math.max(-0.5, Math.min(0.5, body.vx / TUNING.runSpeed * 0.34)), FIXED_DT, 7);
  gait += Math.abs(body.vx) * FIXED_DT * 0.09;

  drawPlayer(ix, iy);

  ctx.restore();
  drawHud(zone);
}

/** Height of the fox's centre of mass above its paws — what a spin turns about. */
const FOX_PIVOT = 17;

function foxState() {
  return {
    w: body.w,
    h: body.h,
    facing: facingOf(),
    phase: gait,
    airborne: !body.onGround,
    onGround: body.onGround,
    blocking: run.pulse / 0.38,
    tail,
    squash: squashStretch(body.vy, landImpulse, TUNING.maxFall),
    lean: lean.value,
    speed: Math.abs(body.vx),
  };
}

/**
 * The fox, or — during a shield pulse — the fox spinning into the Firefox mark
 * and back out again.
 *
 * Motion blur is done by redrawing the subject along the arc it swept since the
 * last frame, fading out behind it. That is cheap, needs no filters, and is
 * honest: the smear covers exactly the angles actually travelled, so it thickens
 * as the spin accelerates and vanishes as it settles, with nothing to tune.
 */
function drawPlayer(ix, iy) {
  if (!spin.active) {
    fox.draw(ctx, ix, iy, foxState());
    return;
  }

  const delta = spinDelta(spin);
  const mark = markMix(spin);
  const fade = foxMix(spin);
  const ghosts = Math.min(7, Math.floor(Math.abs(delta) / 0.055));

  // Trailing copies first, brightest last, so the leading edge stays crisp.
  for (let i = ghosts; i >= 0; i--) {
    const lag = (i / (ghosts + 1)) * delta * 1.9;
    const alpha = i === 0 ? 1 : 0.5 * (1 - i / (ghosts + 1));
    drawSpinFrame(ix, iy, spin.angle - lag, mark, fade, alpha);
  }
}

function drawSpinFrame(ix, iy, angle, mark, fade, alpha) {
  const cx = ix;
  const cy = iy - FOX_PIVOT;

  if (fade > 0.01) {
    ctx.save();
    ctx.globalAlpha = alpha * fade;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);
    // The tail is suppressed mid-spin: it is a physics chain anchored in world
    // space, so it cannot follow the body round, and the flame it becomes is
    // already there in the mark.
    fox.draw(ctx, ix, iy, { ...foxState(), tail: fade > 0.9 ? tail : null, shadow: false });
    ctx.restore();
  }

  if (mark > 0.01) {
    // Grows as it fades in, so the mark arrives rather than appears. Ends up
    // noticeably bigger than the fox: it is a flourish, and one that has to
    // survive being seen only through motion blur.
    drawFirefoxMark(ctx, cx, cy, 18 + mark * 26, angle, alpha * mark);
  }
}

function drawWorld(zoneKey, ix) {
  const l = cam.x - 80;
  const r = cam.x + VW + 80;
  const inView = (x, pad = 80) => x > l - pad && x < r + pad;

  for (const w of level.winds) {
    if (!inView(w.x + w.w / 2, w.w)) continue;
    drawWindStreaks(ctx, w, elapsed);
  }

  drawGround(ctx, level.rects, cam, VW, VH);

  for (const v of level.vines) if (inView(v.x, 60)) drawVine(ctx, v, elapsed);
  for (const s of level.seesaws) if (inView(s.x, s.len)) drawSeesaw(ctx, s);
  for (const c of level.crates) if (inView(c.x)) drawCrate(ctx, c);

  for (const leaf of leaves) drawLeaf(ctx, leaf, zoneKey);
  void ix;
}

function drawEntities() {
  const l = cam.x - 60;
  const r = cam.x + VW + 60;
  const inView = (x) => x > l && x < r;

  for (const s of level.sparkles) {
    if (s.got || !inView(s.x)) continue;
    drawSparkle(ctx, s.x, s.y, 8, elapsed, s.phase);
  }
  for (const b of level.beacons) if (inView(b.x)) drawBeacon(ctx, b, elapsed);
  for (const k of level.trackers) {
    if (k.dispersed || !inView(k.x)) continue;
    drawTracker(ctx, k, elapsed);
  }
  for (const c of level.crumbs) {
    if (c.dispersed || !inView(c.x)) continue;
    drawCrumb(ctx, c);
  }
  if (run.pulse > 0) {
    drawPulseRing(ctx, pulseAt.x, pulseAt.y, run.pulse / 0.38, RULES.pulseRadius);
  }
}

// ---------------------------------------------------------------- leaves

/**
 * Leaves advected by the wind fields. They are the only reason a wind zone is
 * legible before you walk into it, so they are seeded across the whole field
 * rather than emitted from an edge.
 */
const leaves = [];

function seedLeaves() {
  for (const w of level.winds) {
    for (let i = 0; i < 16; i++) {
      leaves.push({
        x: w.x + Math.random() * w.w,
        y: w.y + Math.random() * w.h,
        field: w,
        r: 2.4 + Math.random() * 2.6,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 3,
        alpha: 0.35 + Math.random() * 0.4,
        gold: Math.random() < 0.35,
        drift: (Math.random() - 0.5) * 26,
      });
    }
  }
}

function stepLeaves(dt) {
  for (const leaf of leaves) {
    const f = leaf.field;
    const w = windAt([f], leaf.x, leaf.y, elapsed);
    leaf.x += (w.x * 0.55 + 12) * dt;
    leaf.y += (w.y * 0.5 + leaf.drift + Math.sin(elapsed * 1.7 + leaf.spin) * 14) * dt;
    leaf.spin += leaf.vspin * dt;

    // wrap inside the field, so a zone never empties out
    if (leaf.x > f.x + f.w) leaf.x = f.x;
    if (leaf.x < f.x) leaf.x = f.x + f.w;
    if (leaf.y > f.y + f.h) leaf.y = f.y;
    if (leaf.y < f.y) leaf.y = f.y + f.h;
  }
}


// ---------------------------------------------------------------- HUD

let lastFactShown = null;

function drawHud(zone) {
  el.zone.textContent = zone.name;
  el.sparkles.textContent = `✦ ${run.sparkles}`;
  el.beacons.textContent = `◈ ${run.lit} / ${level.beacons.length}`;
  el.focus.style.transform = `scaleX(${run.focus})`;

  if (run.fact !== lastFactShown) {
    lastFactShown = run.fact;
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
      `fps      ${fps.toFixed(0)}`,
      `x y      ${body.x.toFixed(0)} ${body.y.toFixed(0)}`,
      `vx vy    ${body.vx.toFixed(0)} ${body.vy.toFixed(0)}`,
      `ground   ${body.onGround}`,
      `coyote   ${body.coyote.toFixed(3)}`,
      `buffer   ${body.buffer.toFixed(3)}`,
      `spread   ${tail.spread.toFixed(2)}`,
      `cling    ${run.clung}  (x${run.speedScale.toFixed(2)})`,
      `swinging ${grabbed ? 'yes' : 'no'}`,
      `zone     ${zone.key}`,
    ].join('\n');
  }
}

// ---------------------------------------------------------------- loop

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = VW * dpr;
  canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
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

el.begin.addEventListener('click', () => {
  el.start.hidden = true;
  running = true;
  audio.start();
  last = 0;
  canvas.focus();
});

seedLeaves();
resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

// a first paint behind the start overlay, so the world is visible immediately
render(0);

// exposed for the smoke test to drive the game without synthetic key events
globalThis.__quiet = { body, run, level, tail, spin, start: () => el.begin.click() };
