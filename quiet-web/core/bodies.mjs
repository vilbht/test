// bodies.mjs — set-piece physics: wind fields, see-saw planks, pushable crates.
//
// All three reuse the AABB vocabulary from physics.mjs rather than introducing a
// second collision system. The see-saw in particular exposes itself as a strip of
// ordinary rects, so the character controller needs no knowledge of rotation.

import { overlaps } from './physics.mjs';

// ---------------------------------------------------------------- wind

/**
 * A rectangular region applying a steady force, plus a gentle sinusoidal gust so
 * it never reads as a constant. Acts on the fox, the tail and loose leaves alike.
 */
export function createWind({ x, y, w, h, fx = 90, fy = -10, gust = 0.35, phase = 0 }) {
  return { x, y, w, h, fx, fy, gust, phase };
}

/** Summed wind force at a point. `t` is elapsed seconds, driving the gust. */
export function windAt(fields, x, y, t = 0) {
  let ax = 0, ay = 0;
  for (const f of fields) {
    if (x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) continue;
    const g = 1 + f.gust * Math.sin(t * 1.7 + f.phase);
    ax += f.fx * g;
    ay += f.fy * g;
  }
  return { x: ax, y: ay };
}

// ---------------------------------------------------------------- see-saw

/**
 * A plank with a single rotational degree of freedom about its pivot.
 *
 * Torque comes from where load sits along the plank, opposed by a spring pulling
 * it level and a damper stopping it ringing. Modelling one DOF rather than a free
 * rigid body is what keeps it predictable to stand on.
 *
 * @param maxAngle  radians of travel each way; the plank stops hard at its ends
 */
export function createSeesaw({ x, y, len = 150, maxAngle = 0.42, stiffness = 5.5, damping = 2.4 }) {
  return { x, y, len, maxAngle, stiffness, damping, angle: 0, omega: 0, load: 0 };
}

/**
 * @param loads  [{ x, weight }] — anything standing on the plank this step
 */
export function stepSeesaw(s, loads, dt) {
  let torque = 0;
  let total = 0;
  for (const l of loads) {
    const offset = Math.max(-s.len / 2, Math.min(s.len / 2, l.x - s.x));
    torque += (offset / (s.len / 2)) * l.weight;
    total += l.weight;
  }
  s.load = total;

  // spring back to level, damped; inertia scales with plank length
  const inertia = 0.9 + s.len / 240;
  const accel = (torque * 5.2 - s.stiffness * s.angle - s.damping * s.omega) / inertia;
  s.omega += accel * dt;
  s.angle += s.omega * dt;

  if (s.angle > s.maxAngle) { s.angle = s.maxAngle; s.omega = Math.min(0, s.omega); }
  if (s.angle < -s.maxAngle) { s.angle = -s.maxAngle; s.omega = Math.max(0, s.omega); }
  return s;
}

/** Surface height of the plank at a given world x. */
export function seesawSurfaceY(s, x) {
  const offset = Math.max(-s.len / 2, Math.min(s.len / 2, x - s.x));
  return s.y + Math.sin(s.angle) * offset;
}

/**
 * The plank as a strip of one-way rects, so the existing collision routine can
 * walk it with no special case. Stair-stepping is invisible at these angles.
 */
export function seesawRects(s, slices = 9) {
  const out = [];
  const sliceW = s.len / slices;
  for (let i = 0; i < slices; i++) {
    const cx = s.x - s.len / 2 + sliceW * (i + 0.5);
    out.push({
      x: cx - sliceW / 2,
      y: seesawSurfaceY(s, cx) - 3,
      w: sliceW,
      h: 8,
      oneWay: true,
      seesaw: s,
    });
  }
  return out;
}

// ---------------------------------------------------------------- crates

export function createCrate({ x, y, size = 30 }) {
  return { x, y, w: size, h: size, vx: 0, vy: 0, onGround: false };
}

function crateBox(c, x = c.x, y = c.y) {
  return { x, y, w: c.w, h: c.h };
}

/**
 * Crates fall, slide to a stop and shove each other aside.
 *
 * Resolution is deliberately shallow — one pass between pairs, no stacking
 * solver. Stacked boxes are where naive impulse solvers start jittering, and the
 * levels are built so a stack is never required.
 */
export function stepCrates(crates, rects, dt, { gravity = 1900, friction = 1400, maxFall = 700 } = {}) {
  for (const c of crates) {
    c.vy = Math.min(maxFall, c.vy + gravity * dt);

    const drag = friction * dt;
    if (Math.abs(c.vx) <= drag) c.vx = 0;
    else c.vx -= Math.sign(c.vx) * drag;

    const dist = Math.max(Math.abs(c.vx), Math.abs(c.vy)) * dt;
    const steps = Math.max(1, Math.ceil(dist / 6));
    const sdt = dt / steps;
    c.onGround = false;

    for (let s = 0; s < steps; s++) {
      c.x += c.vx * sdt;
      for (const r of rects) {
        if (r.oneWay) continue;
        if (!overlaps(crateBox(c), r)) continue;
        c.x = c.vx > 0 ? r.x - c.w : r.x + r.w;
        c.vx = 0;
      }

      const prevBottom = c.y + c.h;
      c.y += c.vy * sdt;
      for (const r of rects) {
        if (!overlaps(crateBox(c), r)) continue;
        if (r.oneWay && (c.vy < 0 || prevBottom > r.y + 0.5)) continue;
        if (c.vy > 0) { c.y = r.y - c.h; c.onGround = true; }
        else c.y = r.y + r.h;
        c.vy = 0;
      }
    }
  }

  // crate-vs-crate: separate along the shallower overlap, once
  for (let i = 0; i < crates.length; i++) {
    for (let j = i + 1; j < crates.length; j++) {
      const a = crates[i], b = crates[j];
      if (!overlaps(crateBox(a), crateBox(b))) continue;
      const ox = Math.min(a.x + a.w - b.x, b.x + b.w - a.x);
      const oy = Math.min(a.y + a.h - b.y, b.y + b.h - a.y);
      if (ox < oy) {
        const push = (a.x < b.x ? -1 : 1) * ox / 2;
        a.x += push; b.x -= push;
        a.vx = b.vx = 0;
      } else {
        if (a.y < b.y) { a.y -= oy; a.vy = Math.min(a.vy, 0); a.onGround = true; }
        else { b.y -= oy; b.vy = Math.min(b.vy, 0); b.onGround = true; }
      }
    }
  }
  return crates;
}

/**
 * The fox shoving a crate.
 *
 * Call order is: stepCharacter, then this, then stepCrates. By the time we run,
 * the character's own collision has already pinned the fox flush against the
 * crate — so there is never an overlap to detect, only contact. We therefore
 * look for a fox edge resting on a crate edge while it is still pressing into
 * it, and answer by setting the crate's *velocity*. Letting stepCrates integrate
 * that is what keeps a shoved crate honest about walls and ledges; moving its x
 * directly here would let the fox push a crate straight through a canyon wall.
 *
 * The fox needs no extra speed clamp: it re-collides with the crate's new
 * position every step, so it advances at exactly the crate's pace.
 *
 * @param move  the fox's input direction this step, -1..1
 * @returns     how many crates are being pushed, for footstep/scrape audio
 */
export function pushCrates(body, crates, move, dt, speed = 84) {
  if (!move) return 0;
  const dir = Math.sign(move);
  const top = body.y - body.h;
  const bottom = body.y;
  const tol = 3;
  let pushing = 0;

  for (const c of crates) {
    if (bottom <= c.y + 6) continue;                    // standing on the lid
    if (top >= c.y + c.h || bottom <= c.y) continue;    // no shoulder-to-side contact
    const foxEdge = body.x + dir * (body.w / 2);
    const crateEdge = dir > 0 ? c.x : c.x + c.w;
    if (Math.abs(foxEdge - crateEdge) > tol) continue;
    c.vx = dir * speed;
    pushing++;
  }
  return pushing;
}

/** Crates as static rects, so the character controller can stand on them. */
export function crateRects(crates) {
  return crates.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, crate: c }));
}
