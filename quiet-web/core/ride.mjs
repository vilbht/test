// ride.mjs — the slope rider: momentum, launches, backflips, grinding.
//
// The platformer controller this replaces held a constant run speed and treated
// terrain as an obstacle. A slope game inverts that: terrain is the *engine*.
// Speed is not chosen by the player at all — it is gravity resolved along the
// surface tangent, so a long descent winds you up, a rise bleeds you out, and
// the only real inputs are when to leave the ground and how to come back to it.
//
// Everything here is pure and DOM-free, so the whole ride is testable under
// `node --test` — including the one thing that matters most, which is that the
// widest chasm the generator can emit is actually clearable by the real
// controller rather than by an estimate of it.

import { slopeAt, angleAt, curvatureAt, surfaceY, groundY, inChasm } from './terrain.mjs';

export const RIDE = Object.freeze({
  // Floaty on purpose. A tighter arc gave barely enough hang time for exactly
  // one rotation, which meant a flip either just completed or just failed with
  // no margin the player could aim at. Air time is the budget tricks are spent
  // from, so it has to be generous enough to hold a choice.
  gravity: 1250,

  // Friction is proportional to speed, so each slope angle has its own terminal
  // velocity and the ride has a *range* instead of a cap the player can feel
  // themselves hitting. The constant is chosen from that equilibrium rather than
  // by taste: v = g·sinθ / k, so k = 0.85 puts the median 11° slope near 300px/s
  // and a steep 24° pitch near the 660 ceiling. Set it much lower — 0.30, as the
  // first pass did — and every descent saturates at maximum speed within a
  // second, which flattens the whole dynamic the terrain exists to create.
  friction: 0.85,
  minSpeed: 140,         // a gentle shove so an uphill can never stall the run
  maxSpeed: 660,

  jump: -640,
  // Fraction of existing vertical velocity carried into a jump. Adding the
  // impulse to the raw tangential velocity looks correct and plays terribly:
  // on a descent the fox is already moving *down* the slope, so the tap that
  // most needs height — the one at the lip of a chasm — is the one that gets
  // least. Downward motion is discarded, upward motion partly kept.
  jumpCarry: 0.35,
  coyote: 0.10,
  buffer: 0.12,

  // Backflip: one rotation per ~0.72s against a typical 1.0-1.3s air, so a good
  // launch holds one flip comfortably and a big one can reach two. The player
  // stops the spin by releasing, which is where the skill lives.
  spinRate: 8.7,
  spinDelay: 0.08,

  // How far from surface-parallel a landing may be before it costs you. Alto's
  // whole risk/reward sits in this number: generous enough that a committed
  // flip usually pays, tight enough that a lazy one does not.
  landTolerance: 0.70,
  // A landing arrives carrying far more speed than the cruise that preceded it,
  // because the fall itself accelerates the fox along the slope. At 0.5 a tumble
  // therefore only removed the bonus and left it at cruising pace — free. This
  // is set so a bad landing lands you visibly below cruising instead.
  tumblePenalty: 0.35,
  tumbleTime: 0.72,
  flipBoost: 30,

  grindAccel: 150,
  grindSnap: 20,
  chasmDepth: 150,       // how far below the lip counts as fallen in
  chasmRecovery: 0.52,
});

export function createRider(terrain, x = 60) {
  const y = surfaceY(terrain, x);
  return {
    x, y,
    px: x, py: y,        // previous position, for render interpolation
    speed: 205,          // scalar, along the surface tangent — the drop-in gives real motion at once
    vx: 150, vy: 0,      // only meaningful while airborne
    onGround: true,
    angle: angleAt(terrain, x),
    spin: 0,
    rotation: 0,         // radians accumulated this flight
    flips: 0,            // completed flips landed this run
    airTime: 0,
    tumble: 0,
    coyote: 0,
    buffer: 0,
    grinding: null,
    rescued: false,
  };
}

const TAU = Math.PI * 2;

/** Shortest signed distance between two angles, in [-π, π]. */
export function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Advance one fixed step.
 *
 * @param input { jumpPressed, jumpHeld }
 * @param rails grind rails: [{ x0, y0, x1, y1 }]
 * @returns events worth reacting to in audio and particles
 */
export function stepRider(rider, terrain, rails, input, dt) {
  const events = {
    launched: false, landed: false, tumbled: false,
    flips: 0, grindStart: false, grindEnd: false, rescued: false,
  };

  rider.px = rider.x;
  rider.py = rider.y;

  rider.buffer = input.jumpPressed ? RIDE.buffer : Math.max(0, rider.buffer - dt);
  rider.tumble = Math.max(0, rider.tumble - dt);

  if (rider.grinding) {
    stepGrind(rider, terrain, input, dt, events);
    return events;
  }

  if (rider.onGround) stepGrounded(rider, terrain, input, dt, events);
  else stepAirborne(rider, terrain, rails, input, dt, events);

  return events;
}

// ---------------------------------------------------------------- grounded

function stepGrounded(rider, terrain, input, dt, events) {
  rider.coyote = RIDE.coyote;
  const gradient = slopeAt(terrain, rider.x);   // dy/dx, reused for curvature below
  const theta = Math.atan(gradient);

  // gravity along the tangent, opposed by speed-proportional friction
  const accel = RIDE.gravity * Math.sin(theta) - RIDE.friction * rider.speed;
  rider.speed = Math.min(RIDE.maxSpeed, Math.max(RIDE.minSpeed, rider.speed + accel * dt));

  rider.vx = rider.speed * Math.cos(theta);
  rider.vy = rider.speed * Math.sin(theta);
  rider.angle += angleDelta(theta, rider.angle) * Math.min(1, 14 * dt);

  // a buffered tap leaves the ground now, carrying the tangential velocity
  if (rider.buffer > 0) {
    rider.buffer = 0;
    rider.coyote = 0;
    rider.onGround = false;
    rider.vy = Math.min(rider.vy * RIDE.jumpCarry, 0) + RIDE.jump;
    rider.rotation = 0;
    rider.airTime = 0;
    events.launched = true;
    return;
  }

  const nextX = rider.x + rider.vx * dt;
  const gy = groundY(terrain, nextX);

  // The launch test, stated as physics rather than as a step comparison.
  //
  // Following a curved surface requires centripetal acceleration v²·κ; the only
  // thing supplying it is the component of gravity pressing the fox onto the
  // slope, g·cosθ. Once the first exceeds the second, contact is over.
  //
  // The first version instead asked whether a one-frame ballistic step fell more
  // than half a pixel below the ground. That is the same idea with a timestep
  // baked into it, and it needed roughly four times the curvature a launch ramp
  // actually has — so the ramps did nothing, and a whole descent produced about
  // eight moments of air. This form has no dt in it at all, which also means the
  // ride does not change if the fixed step ever does.
  const curvature = curvatureAt(terrain, rider.x) / Math.pow(1 + gradient * gradient, 1.5);
  const flies = curvature > 0
    && rider.speed * rider.speed * curvature > RIDE.gravity * Math.cos(theta);

  if (gy === null || flies) {
    rider.x = nextX;
    rider.y = rider.y + rider.vy * dt + 0.5 * RIDE.gravity * dt * dt;
    rider.onGround = false;
    rider.rotation = 0;
    rider.airTime = 0;
    events.launched = true;
    return;
  }

  rider.x = nextX;
  rider.y = gy;
}

// ---------------------------------------------------------------- airborne

function stepAirborne(rider, terrain, rails, input, dt, events) {
  rider.coyote = Math.max(0, rider.coyote - dt);
  rider.airTime += dt;

  // a tap inside the coyote window still counts as a jump off the lip
  if (rider.buffer > 0 && rider.coyote > 0) {
    rider.buffer = 0;
    rider.coyote = 0;
    rider.vy = Math.min(rider.vy * RIDE.jumpCarry, 0) + RIDE.jump;
    events.launched = true;
  }

  if (input.jumpHeld && rider.airTime > RIDE.spinDelay) {
    rider.spin = -RIDE.spinRate;      // backflip, the direction of travel
  } else {
    rider.spin *= 0.90;
  }
  rider.angle += rider.spin * dt;
  rider.rotation += rider.spin * dt;

  rider.vy += RIDE.gravity * dt;
  rider.x += rider.vx * dt;
  rider.y += rider.vy * dt;

  if (tryGrind(rider, rails, events)) return;

  // fallen into a chasm: lift out on the far lip rather than ending the run
  const chasm = inChasm(terrain, rider.x);
  if (chasm && rider.y > surfaceY(terrain, rider.x) + RIDE.chasmDepth) {
    rider.x = chasm.x1 + 24;
    rider.y = surfaceY(terrain, rider.x);
    rider.speed = Math.max(RIDE.minSpeed, rider.speed * RIDE.chasmRecovery);
    rider.angle = angleAt(terrain, rider.x);
    rider.onGround = true;
    rider.spin = 0;
    rider.rotation = 0;
    rider.tumble = RIDE.tumbleTime;
    rider.rescued = true;
    events.rescued = true;
    return;
  }

  const gy = groundY(terrain, rider.x);
  if (gy === null || rider.y < gy) return;

  land(rider, terrain, gy, events);
}

function land(rider, terrain, gy, events) {
  const theta = angleAt(terrain, rider.x);

  // Only the component along the slope survives a landing — the ground absorbs
  // the rest. Scoring the landing against the raw 2D speed instead makes a long
  // fall arrive "fast" purely because it is falling hard, and a tumble after a
  // big drop then ends up *quicker* than the cruise that preceded it.
  const along = rider.vx * Math.cos(theta) + rider.vy * Math.sin(theta);

  // Rotation is scored on whole turns only: a three-quarter flip is a crash in
  // every trick game, and rounding it up would remove the reason to commit.
  const flips = Math.floor(Math.abs(rider.rotation) / TAU + 1e-9);
  const misalignment = Math.abs(angleDelta(rider.angle, theta));

  rider.y = gy;
  rider.onGround = true;
  rider.spin = 0;
  rider.rotation = 0;
  rider.angle = theta;
  events.landed = true;

  if (misalignment <= RIDE.landTolerance) {
    rider.speed = Math.min(RIDE.maxSpeed, Math.max(RIDE.minSpeed, along) + flips * RIDE.flipBoost);
    rider.flips += flips;
    events.flips = flips;
  } else {
    rider.speed = Math.max(RIDE.minSpeed, Math.abs(along) * RIDE.tumblePenalty);
    rider.tumble = RIDE.tumbleTime;
    events.tumbled = true;
  }
}

// ---------------------------------------------------------------- grinding

function railYAt(rail, x) {
  const t = (x - rail.x0) / (rail.x1 - rail.x0);
  return rail.y0 + (rail.y1 - rail.y0) * t;
}

function tryGrind(rider, rails, events) {
  if (!rails || rider.vy < 0) return false;
  for (const rail of rails) {
    if (rider.x < rail.x0 || rider.x > rail.x1) continue;
    const ry = railYAt(rail, rider.x);
    if (Math.abs(rider.y - ry) > RIDE.grindSnap) continue;

    rider.grinding = rail;
    rider.y = ry;
    rider.speed = Math.hypot(rider.vx, rider.vy);
    rider.angle = Math.atan2(rail.y1 - rail.y0, rail.x1 - rail.x0);
    rider.spin = 0;
    rider.rotation = 0;
    events.grindStart = true;
    return true;
  }
  return false;
}

/** A grind is frictionless and accelerating — the reward for finding the line. */
function stepGrind(rider, terrain, input, dt, events) {
  const rail = rider.grinding;
  rider.speed = Math.min(RIDE.maxSpeed, rider.speed + RIDE.grindAccel * dt);

  const theta = Math.atan2(rail.y1 - rail.y0, rail.x1 - rail.x0);
  rider.vx = rider.speed * Math.cos(theta);
  rider.vy = rider.speed * Math.sin(theta);
  rider.x += rider.vx * dt;
  rider.y = railYAt(rail, Math.min(rider.x, rail.x1));
  rider.angle = theta;

  const jumped = rider.buffer > 0;
  if (jumped) rider.buffer = 0;

  if (jumped || rider.x >= rail.x1) {
    rider.grinding = null;
    rider.onGround = false;
    rider.airTime = 0;
    rider.rotation = 0;
    if (jumped) rider.vy = Math.min(rider.vy * RIDE.jumpCarry, 0) + RIDE.jump;
    events.grindEnd = true;
    events.launched = jumped;
  }
  void terrain; void input;
}

/**
 * How fast the fox must be travelling to clear a gap of `width` that drops
 * `drop` to its far lip, assuming the player taps at the edge.
 *
 * Solves the ballistic arc rather than approximating it, because this is what
 * the level generator uses to decide whether a chasm is fair.
 */
export function clearanceSpeed(width, drop, margin = 1.25) {
  const g = RIDE.gravity;
  const vy0 = RIDE.jump;                       // negative: upward
  const t = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(0, drop))) / g;
  return (width * margin) / t;
}

/**
 * Speed the fox will actually be carrying at each point of a hole-free mountain,
 * measured by riding it.
 *
 * The generator needs this because arrival speed cannot be read off the local
 * gradient: momentum is a running total of everything upstream, so a steep lip
 * at the end of a long flat is approached slowly and a gentle one after a big
 * descent is approached fast. Placing chasms by local slope produced exactly
 * that failure — gaps the fox reached at 160px/s and could not possibly clear.
 *
 * Cheap enough to run at generation time: one pass, no allocation per step.
 */
export function speedProfile(terrain, { step = 16, dt = 1 / 120 } = {}) {
  const n = Math.ceil(terrain.length / step) + 2;
  const speeds = new Float64Array(n).fill(RIDE.minSpeed);
  const rider = createRider(terrain);
  const noInput = { jumpPressed: false, jumpHeld: false };

  let guard = 0;
  while (rider.x < terrain.length && guard++ < 200 / dt) {
    stepRider(rider, terrain, null, noInput, dt);
    const i = Math.floor(rider.x / step);
    if (i >= 0 && i < n) {
      const v = rider.onGround ? rider.speed : Math.hypot(rider.vx, rider.vy);
      speeds[i] = Math.max(speeds[i], v);
    }
  }
  return { step, speeds };
}

export function speedAt(profile, x) {
  const i = Math.floor(x / profile.step);
  if (i < 0) return profile.speeds[0];
  if (i >= profile.speeds.length) return profile.speeds[profile.speeds.length - 1];
  return profile.speeds[i];
}

/**
 * The *slowest* the fox is over the run-in to a point.
 *
 * A passive profile flatters the played ride: a real run scrubs speed on
 * landings and tumbles the profile never sees, so a single sample at the lip can
 * promise speed the player will not have. Taking the worst of the approach is
 * the conservative reading, and conservative is the right bias when the thing
 * being decided is whether a gap is crossable at all.
 */
export function approachSpeed(profile, x, back = 140) {
  let slowest = Infinity;
  for (let p = Math.max(0, x - back); p <= x; p += profile.step) {
    slowest = Math.min(slowest, speedAt(profile, p));
  }
  return Number.isFinite(slowest) ? slowest : speedAt(profile, x);
}

/**
 * Ride the mountain the way it is meant to be played — tapping at each lip — and
 * report which chasms were fallen into anyway.
 *
 * This exists because predicting arrival speed from a passive descent is not
 * good enough. The played ride scrubs speed on every landing the passive one
 * never makes, so a gap can pass a static check and still be uncrossable in
 * practice. Rather than model that interaction, the generator plays the level.
 */
export function probeDescent(terrain, { dt = 1 / 120, seconds = 240 } = {}) {
  const rider = createRider(terrain);
  const fell = new Set();
  let guard = 0;

  while (rider.x < terrain.length - 100 && guard++ < seconds / dt) {
    let jumpPressed = false;
    if (rider.onGround || rider.coyote > 0) {
      for (const c of terrain.chasms) {
        if (rider.x > c.x0 - 70 && rider.x < c.x0) { jumpPressed = true; break; }
      }
    }
    const events = stepRider(rider, terrain, null, { jumpPressed, jumpHeld: false }, dt);
    if (events.rescued) {
      // attribute the fall to the chasm the fox came out of
      let nearest = terrain.chasms[0];
      for (const c of terrain.chasms) {
        if (Math.abs(c.x1 - rider.x) < Math.abs(nearest.x1 - rider.x)) nearest = c;
      }
      if (nearest) fell.add(nearest);
    }
  }
  return { fell, reached: rider.x };
}

/** Speed as a 0..1 fraction of the rider's ceiling, for camera and effects. */
export function speedFraction(rider) {
  return Math.min(1, Math.abs(rider.speed) / RIDE.maxSpeed);
}

/** Slope-aligned unit vectors at the rider, for spray and trail effects. */
export function surfaceBasis(terrain, x) {
  const s = slopeAt(terrain, x);
  const len = Math.hypot(1, s);
  return { tx: 1 / len, ty: s / len, nx: -s / len, ny: 1 / len };
}
