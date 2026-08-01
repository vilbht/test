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
import { generateLevel, zoneAt, GROUND_Y } from '../core/level.mjs';
import { createRun, stepRules, stepTrackers, RULES } from '../core/rules.mjs';
import { GreyboxFox } from './art/fox.js';

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

// Rest length is short on purpose: the tapered links sum to ~28px at spread 1,
// reaching ~65px unfurled at a sprint. Longer than that and a 34px-tall fox
// trails a whip instead of a brush.
const tail = createChain({ x: body.x, y: body.y - 20, count: 11, segment: 3.6, taper: 0.05 });
const lean = createSpring(0);
const cam = { x: 0, y: 0, shake: 0 };

const fox = GreyboxFox;

let elapsed = 0;
let gait = 0;
let landImpulse = 0;
let running = false;
let grabbed = null;      // { vine, index } while swinging
let fps = 60;

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
  stepTrackers(level, body, dt, elapsed);
  stepRules(run, level, body, { pulsePressed: wasPressed('pulse') }, dt);

  pressed.clear();
}

/**
 * Tail spread is the speed-reactive part of the brief: compact at idle, unfurled
 * to full drama at a sprint or mid-leap. The solver eases it; we only set a target.
 */
function stepTail(dt) {
  const speed = Math.abs(body.vx) / TUNING.runSpeed;
  const air = body.onGround ? 0 : 0.4;
  tail.spreadTarget = 1 + speed * 1.0 + air;

  const facing = facingOf();
  const anchorX = body.x - facing * 7;
  const anchorY = body.y - 21;
  const w = windAt(level.winds, body.x, body.y - body.h / 2, elapsed);

  stepChain(tail, dt, {
    anchorX, anchorY,
    gravity: 780,
    damping: 0.982,
    iterations: 6,
    wind: { x: w.x - body.vx * 1.7, y: w.y - body.vy * 0.55 },
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
  const targetY = Math.min(0, iy - VH * 0.72);
  cam.x += (targetX - cam.x) * 0.09;
  cam.y += (targetY - cam.y) * 0.06;
  cam.x = Math.max(0, Math.min(level.width - VW, cam.x));

  const shakeX = (Math.random() - 0.5) * cam.shake;
  const shakeY = (Math.random() - 0.5) * cam.shake;

  const zone = zoneAt(ix);
  drawSky(zone);
  drawParallax(zone);   // screen space, before the camera transform

  ctx.save();
  ctx.translate(-Math.round(cam.x + shakeX), -Math.round(cam.y + shakeY));

  drawWorld();
  drawEntities();

  stepSpring(lean, Math.max(-0.5, Math.min(0.5, body.vx / TUNING.runSpeed * 0.34)), FIXED_DT, 7);
  gait += Math.abs(body.vx) * FIXED_DT * 0.09;

  fox.draw(ctx, ix, iy, {
    w: body.w, h: body.h,
    facing: facingOf(),
    phase: gait,
    airborne: !body.onGround,
    onGround: body.onGround,
    blocking: run.pulse / 0.38,
    tail,
    squash: squashStretch(body.vy, landImpulse, TUNING.maxFall),
    lean: lean.value,
    speed: Math.abs(body.vx),
  });

  ctx.restore();
  drawHud(zone);
}

function drawSky(zone) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, zone.sky[0]);
  g.addColorStop(0.62, zone.sky[1]);
  g.addColorStop(1, zone.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
}

/**
 * Grey-box parallax: enough depth cue to judge camera feel, no scenery art yet.
 *
 * Drawn in screen space, before the camera transform, so a layer's scroll rate
 * is just a fraction of cam.x. Doing it inside world space means adding the
 * camera back on to cancel the translate, which is where the arithmetic goes
 * quietly wrong.
 */
function drawParallax(zone) {
  ctx.save();
  ctx.fillStyle = zone.hill;
  ctx.globalAlpha = 0.55;

  for (let layer = 0; layer < 2; layer++) {
    const rate = 0.25 + layer * 0.3;        // 0 = painted on the sky, 1 = ground speed
    const spacing = 180 + layer * 40;
    const offset = (cam.x * rate) % spacing;
    const base = GROUND_Y - cam.y + 40 + layer * 30;

    ctx.beginPath();
    ctx.moveTo(-spacing, VH + 200);
    for (let i = -1; i < Math.ceil(VW / spacing) + 2; i++) {
      const hx = i * spacing - offset;
      ctx.lineTo(hx, base - 60 - layer * 24 - ((i * 37) % 50));
      ctx.lineTo(hx + spacing / 2, base - layer * 10);
    }
    ctx.lineTo(VW + spacing, VH + 200);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld() {
  const l = cam.x - 60;
  const r = cam.x + VW + 60;

  for (const rect of level.rects) {
    if (rect.x > r || rect.x + rect.w < l) continue;
    if (rect.oneWay) {
      ctx.fillStyle = '#5B4A7A';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(rect.x, rect.y, rect.w, 2);
    } else {
      ctx.fillStyle = '#3A2A57';
      ctx.fillRect(rect.x, rect.y, rect.w, Math.min(rect.h, VH + 200));
      ctx.fillStyle = '#584379';
      ctx.fillRect(rect.x, rect.y, rect.w, 4);
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#9059FF';
  for (const w of level.winds) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.restore();

  for (const v of level.vines) {
    const p = v.chain.points;
    if (v.x > r + 60 || v.x < l - 60) continue;
    ctx.strokeStyle = v.held ? '#B58BFF' : '#6E5A93';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.stroke();
    const tip = p[p.length - 1];
    ctx.fillStyle = '#8B3DFF';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of level.seesaws) {
    if (s.x > r || s.x < l) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = '#7A5C3A';
    ctx.fillRect(-5, 0, 10, 62);
    ctx.rotate(s.angle);
    ctx.fillStyle = '#A9814F';
    ctx.fillRect(-s.len / 2, -5, s.len, 10);
    ctx.restore();
  }

  for (const c of level.crates) {
    if (c.x > r || c.x < l) continue;
    ctx.fillStyle = '#8A6A3E';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#C29A5E';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
  }
}

function drawEntities() {
  const l = cam.x - 40;
  const r = cam.x + VW + 40;

  for (const s of level.sparkles) {
    if (s.got || s.x > r || s.x < l) continue;
    const bob = Math.sin(elapsed * 2.2 + s.phase) * 3;
    drawStar(s.x, s.y + bob, 8, '#8B3DFF');
  }

  for (const b of level.beacons) {
    if (b.x > r || b.x < l) continue;
    ctx.fillStyle = '#2E1C4C';
    ctx.fillRect(b.x - 7, b.y - 44, 14, 44);
    const glow = b.lit ? 1 : b.charge;
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.30 + glow * 0.7;
      ctx.fillStyle = b.lit ? '#FFC93C' : '#8B3DFF';
      ctx.beginPath();
      ctx.arc(b.x, b.y - 52, 8 + glow * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!b.lit && b.charge > 0) {
      ctx.strokeStyle = '#FFC93C';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 52, 17, -Math.PI / 2, -Math.PI / 2 + b.charge * Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const t of level.trackers) {
    if (t.dispersed || t.x > r || t.x < l) continue;
    ctx.save();
    ctx.globalAlpha = t.clinging ? 1 : 0.82;
    ctx.fillStyle = t.clinging ? '#FF5C8A' : '#4B3A6B';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#150A2C';
    ctx.fillRect(t.x - 4, t.y - 1.5, 8, 3);
    ctx.restore();
  }

  for (const c of level.crumbs) {
    if (c.dispersed || c.x > r || c.x < l) continue;
    ctx.fillStyle = '#7A5230';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStar(x, y, r, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.quadraticCurveTo(Math.cos(a + 0.79) * r * 0.3, Math.sin(a + 0.79) * r * 0.3,
      Math.cos(a + 1.57) * r, Math.sin(a + 1.57) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  last = 0;
  canvas.focus();
});

resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

// a first paint behind the start overlay, so the world is visible immediately
render(0);

// exposed for the smoke test to drive the game without synthetic key events
globalThis.__quiet = { body, run, level, tail, start: () => el.begin.click() };
