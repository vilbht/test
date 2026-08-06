// physics.mjs — fixed-step kinematic character controller and AABB world collision.
//
// Deliberately hand-rolled rather than using a rigid-body library: friction-driven
// solvers make platformer characters slide, snag on seams and feel floaty. A
// kinematic controller gives exact, tunable, deterministic motion — and being
// DOM-free it is directly unit-testable under `node --test`.

/**
 * Tuning is derived from desired feel, not guessed:
 *   v0     = 2h/t   (h = peak height, t = time to apex)
 *   gRise  = 2h/t²
 * For h = 90px and t = 0.34s that gives 529 and 1557. Falling uses heavier
 * gravity than rising because asymmetric arcs read as "weighty" to players.
 */
export const TUNING = Object.freeze({
  // vertical
  jumpVelocity: -529,
  gravityRise: 1557,
  gravityFall: 2491,
  apexBand: 90,             // |vy| under this counts as the apex
  apexGravityScale: 0.55,   // float a little at the top of the arc
  maxFall: 860,
  jumpCutGravity: 2.6,      // extra gravity while rising with jump released

  // horizontal
  runSpeed: 235,
  groundAccel: 1900,
  groundFriction: 2600,
  airAccel: 1150,
  airDrag: 280,

  // affordances that make a platformer forgiving
  coyoteTime: 0.10,
  jumpBuffer: 0.13,

  // derived level constraint: airtime 2t = 0.68s at runSpeed = 160px reach.
  // Gaps are capped well inside that so a jump is never a leap of faith.
  maxSafeGap: 99,
});

/** Fixed physics step. Small enough for stable verlet, cheap enough for 60fps. */
export const FIXED_DT = 1 / 120;
/** Cap on steps per frame so a backgrounded tab doesn't spiral on resume. */
export const MAX_STEPS = 4;

export function createBody({ x, y, w = 22, h = 34 }) {
  return {
    x, y, w, h,
    vx: 0, vy: 0,
    onGround: false,
    coyote: 0,
    buffer: 0,
    dropTimer: 0,
    // previous position, for render interpolation
    px: x, py: y,
  };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Body's AABB with its origin at the feet-centre. */
function boxOf(b, x = b.x, y = b.y) {
  return { x: x - b.w / 2, y: y - b.h, w: b.w, h: b.h };
}

/**
 * A one-way platform only blocks when the body is falling onto it and its feet
 * were at or above the surface before the move — otherwise you'd be trapped
 * when jumping up through it.
 */
function blocks(rect, body, prevFeetY, movingDown, dropping) {
  if (!rect.oneWay) return true;
  if (dropping) return false;
  if (!movingDown) return false;
  return prevFeetY <= rect.y + 0.5;
}

/**
 * Advance one fixed step.
 *
 * @param body   from createBody
 * @param input  { move: -1..1, jumpHeld, jumpPressed, dropHeld }
 * @param rects  static world boxes; `oneWay: true` for jump-through platforms
 * @param dt     seconds (use FIXED_DT)
 * @param T      tuning
 * @returns      { landed, jumped, headBump } — edges worth reacting to
 */
export function stepCharacter(body, input, rects, dt = FIXED_DT, T = TUNING) {
  const events = { landed: false, jumped: false, headBump: false };
  const move = Math.max(-1, Math.min(1, input.move || 0));

  body.px = body.x;
  body.py = body.y;

  // ---- horizontal: accelerate toward target, or apply friction when idle
  const target = move * T.runSpeed;
  if (move !== 0) {
    const accel = body.onGround ? T.groundAccel : T.airAccel;
    if (body.vx < target) body.vx = Math.min(target, body.vx + accel * dt);
    else if (body.vx > target) body.vx = Math.max(target, body.vx - accel * dt);
  } else {
    const drag = (body.onGround ? T.groundFriction : T.airDrag) * dt;
    if (Math.abs(body.vx) <= drag) body.vx = 0;
    else body.vx -= Math.sign(body.vx) * drag;
  }

  // ---- jump affordances
  body.buffer = input.jumpPressed ? T.jumpBuffer : Math.max(0, body.buffer - dt);
  body.coyote = body.onGround ? T.coyoteTime : Math.max(0, body.coyote - dt);
  if (body.buffer > 0 && body.coyote > 0) {
    body.vy = T.jumpVelocity;
    body.onGround = false;
    body.coyote = 0;
    body.buffer = 0;
    events.jumped = true;
  }

  // ---- gravity: lighter at the apex, heavier falling, heavier still if the
  // player let go of jump early (variable jump height)
  let g;
  if (body.vy < 0) g = input.jumpHeld ? T.gravityRise : T.gravityRise * T.jumpCutGravity;
  else g = T.gravityFall;
  if (Math.abs(body.vy) < T.apexBand) g *= T.apexGravityScale;
  body.vy = Math.min(T.maxFall, body.vy + g * dt);

  body.dropTimer = input.dropHeld ? 0.12 : Math.max(0, body.dropTimer - dt);
  const dropping = body.dropTimer > 0;

  // ---- integrate, substepped so nothing tunnels through a thin platform
  const dist = Math.max(Math.abs(body.vx), Math.abs(body.vy)) * dt;
  const steps = Math.max(1, Math.ceil(dist / 6));
  const sdt = dt / steps;
  const wasOnGround = body.onGround;
  body.onGround = false;

  for (let s = 0; s < steps; s++) {
    // Which way the body was travelling when it entered these rects. Captured
    // before the loop, not read from body.v* inside it, because the first
    // contact zeroes the velocity — and then a second overlapping rect would be
    // resolved as if the body had been moving the *other* way.
    //
    // Overlapping rects are normal: crates sit on slabs, and abutting slabs of
    // different heights overlap at their seam. Reading a zeroed vy there put a
    // falling body through the head-bump branch and teleported it to the
    // underside of the ground, 900px down. It looked like the floor had a hole
    // in it, in exactly one place, on one seed.
    const movingRight = body.vx > 0;
    const falling = body.vy > 0;

    // X axis
    body.x += body.vx * sdt;
    let box = boxOf(body);
    for (const r of rects) {
      if (r.oneWay) continue;            // never blocked horizontally by a ledge
      if (!overlaps(box, r)) continue;
      body.x = movingRight ? r.x - body.w / 2 : r.x + r.w + body.w / 2;
      body.vx = 0;
      box = boxOf(body);
    }

    // Y axis
    const prevFeet = body.y;
    body.y += body.vy * sdt;
    box = boxOf(body);
    for (const r of rects) {
      if (!overlaps(box, r)) continue;
      if (!blocks(r, body, prevFeet, falling, dropping)) continue;
      if (falling) {
        body.y = r.y;
        body.onGround = true;
      } else {
        body.y = r.y + r.h + body.h;
        events.headBump = true;
      }
      body.vy = 0;
      box = boxOf(body);
    }
  }

  // Ground probe: a 1px feeler under the feet. Catches the seam between two
  // abutting platforms, where per-axis resolution alone can report airborne
  // for a frame and break coyote time.
  if (!body.onGround && body.vy >= 0) {
    const feeler = { x: body.x - body.w / 2 + 1, y: body.y, w: body.w - 2, h: 1.5 };
    for (const r of rects) {
      if (!overlaps(feeler, r)) continue;
      if (r.oneWay && (dropping || body.y > r.y + 2)) continue;
      body.onGround = true;
      break;
    }
  }

  if (body.onGround && !wasOnGround) events.landed = true;
  return events;
}

/**
 * Fixed-timestep accumulator. Keeps simulation deterministic regardless of
 * display refresh rate, and returns the leftover fraction so rendering can
 * interpolate between the last two states instead of stuttering.
 */
export function createClock() {
  return { acc: 0, alpha: 0 };
}

export function advance(clock, frameDt, step) {
  clock.acc += Math.min(frameDt, MAX_STEPS * FIXED_DT);
  let n = 0;
  while (clock.acc >= FIXED_DT && n < MAX_STEPS) {
    step(FIXED_DT);
    clock.acc -= FIXED_DT;
    n++;
  }
  clock.alpha = clock.acc / FIXED_DT;
  return n;
}
