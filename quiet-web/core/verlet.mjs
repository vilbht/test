// verlet.mjs — position-based soft-body solver. Drives the fox's tail and the vines.
//
// One solver, two features. Verlet integration stores previous positions instead
// of velocities, so distance constraints can be satisfied by simply moving points
// — stable under stiff constraints where a force-based spring chain would explode.

/**
 * @param count    number of point masses
 * @param segment  base rest length between neighbours (px)
 * @param taper    per-segment shortening, giving a flame that narrows to a tip
 */
export function createChain({ x = 0, y = 0, count = 10, segment = 4.2, taper = 0.045 }) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({ x, y: y + i * segment, px: x, py: y + i * segment });
  }
  return {
    points, segment, taper,
    spread: 1,        // current length multiplier
    spreadTarget: 1,  // where it is heading
  };
}

/** Rest length of the i-th link at the chain's current spread. */
export function restLength(chain, i) {
  return chain.segment * chain.spread * (1 - chain.taper * i);
}

/**
 * Advance the chain one step.
 *
 * The prototype for this found that snapping `spread` between values makes the
 * chain visibly bunch, so the multiplier is always eased toward its target here
 * rather than assigned — callers set `spreadTarget` and let the solver smooth it.
 *
 * @param opts.anchorX/anchorY  where point 0 is pinned (the fox's hips)
 * @param opts.gravity          px/s²
 * @param opts.damping          per-step velocity retention (0.985 ≈ airy)
 * @param opts.iterations       constraint relaxation passes; 6 is stable
 * @param opts.wind             {x, y} force applied to every point
 * @param opts.spreadRate       how fast spread eases toward spreadTarget
 */
export function stepChain(chain, dt, opts) {
  const {
    anchorX, anchorY,
    gravity = 900,
    damping = 0.985,
    iterations = 6,
    wind = null,
    spreadRate = 6,
  } = opts;

  // ease the length multiplier — snapping it makes the chain bunch
  chain.spread += (chain.spreadTarget - chain.spread) *
    Math.min(1, spreadRate * dt);

  const p = chain.points;
  const gdt = gravity * dt * dt;
  const wx = wind ? wind.x * dt * dt : 0;
  const wy = wind ? wind.y * dt * dt : 0;

  for (let i = 1; i < p.length; i++) {
    const vx = (p[i].x - p[i].px) * damping;
    const vy = (p[i].y - p[i].py) * damping;
    p[i].px = p[i].x;
    p[i].py = p[i].y;
    p[i].x += vx + wx;
    p[i].y += vy + gdt + wy;
  }

  // pin the root; its implied velocity is what whips the rest of the chain
  p[0].x = anchorX; p[0].y = anchorY;
  p[0].px = anchorX; p[0].py = anchorY;

  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = ((d - restLength(chain, i)) / d) * 0.5;
      const mx = dx * diff, my = dy * diff;
      if (i > 0) { a.x += mx; a.y += my; }
      b.x -= mx; b.y -= my;
    }
    p[0].x = anchorX; p[0].y = anchorY;
  }
  return chain;
}

/** Largest point speed in px/s — used by tests to assert the chain never blows up. */
export function maxPointSpeed(chain, dt) {
  let m = 0;
  for (const q of chain.points) m = Math.max(m, Math.hypot(q.x - q.px, q.y - q.py) / dt);
  return m;
}

/**
 * A vine: pinned at the top, free at the bottom, and grabbable. Swinging is
 * driven by adding tangential velocity at the grab point rather than by
 * torque, which stays stable inside a position-based solver.
 */
export function createVine({ x, y, count = 12, segment = 9 }) {
  const chain = createChain({ x, y, count, segment, taper: 0 });
  return { chain, x, y, held: false };
}

export function pumpVine(vine, dir, strength = 26) {
  const p = vine.chain.points;
  const tip = p[p.length - 1];
  tip.px -= dir * strength * (1 / 120);
}

/** Velocity of the chain tip, so a released swing carries momentum into the jump. */
export function tipVelocity(chain, dt) {
  const t = chain.points[chain.points.length - 1];
  return { vx: (t.x - t.px) / dt, vy: (t.y - t.py) / dt };
}
