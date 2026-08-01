// spin.mjs — the shield-pulse flourish: the fox whips up, becomes the Firefox
// mark, and unwinds back into itself.
//
// The drawing lives in js/art/, but the timing lives here because the parts that
// can actually be wrong are arithmetic, not pixels: the fox must finish facing
// the way it started, the mark must be legible while it is being read, and a
// spin must always end. Those are assertions, so they belong in a pure module
// the tests can drive.
//
// The rotation never stops. An earlier pass parked the mark on a plateau to make
// it readable, and a dead stop mid-flourish reads as a stutter — the eye sees a
// dropped frame, not a pose. What replaces it is a *drift*: a constant background
// rotation that carries the mark through upright while the two fast ramps are
// idle. It runs at about 330 deg/s — most of a turn a second, plainly still
// spinning, but slow enough that the renderer stacks no motion blur on it, which
// is what legibility actually depends on. A first attempt at this ran the drift
// at a fifth of that: technically moving, and it still read as stopped, because
// what the eye compares it against is the whip it just came out of.

const TAU = Math.PI * 2;

// ---- shape of the rotation ------------------------------------------------
//
// Three contributions, summed. Each is non-decreasing, so the total can never
// run backwards however they are tuned:
//
//   ramp in    a whip from rest up into the reveal
//   drift      a slow constant turn under the whole flourish
//   ramp out   a second whip, unwinding the mark and settling the fox
//
// The ramps ease out into stillness of their own; between them only the drift
// is moving, which is exactly the window the mark is solid in.

const RAMP_IN_END = 0.34;      // the first whip is spent by here
const RAMP_OUT_START = 0.66;   // the second starts here, as the mark begins to go
const DRIFT_TURNS = 1;         // turns the drift contributes across the flourish
const DRIFT_EASE = 0.24;       // fraction of it spent easing the drift in and out
const TOTAL_TURNS = 5;         // must be a whole number: the fox has to end upright

/** ∫₀ᵘ smootherstep, normalised so a full ramp contributes exactly 0.5. */
function rampArea(u) {
  return u * u * u * u * (u * (u - 3) + 2.5);
}

/**
 * The drift's progress, 0..1 — a trapezoidal velocity profile integrated.
 *
 * Constant through the middle so the mark turns at an even rate while it is
 * being read, and eased to nothing at both ends so it neither snaps into motion
 * at the start nor is still turning when the flourish cuts.
 */
export function driftProgress(t) {
  const e = DRIFT_EASE;
  const area = 1 - e;                        // ∫ of the trapezoid over [0, 1]

  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < e) return (e * rampArea(t / e)) / area;
  if (t <= 1 - e) return (e * 0.5 + (t - e)) / area;
  return (e * 0.5 + (1 - 2 * e) + e * (0.5 - rampArea((1 - t) / e))) / area;
}

// The moment the mark is most worth looking at: the middle of the window where
// it is fully solid. The in-ramp deliberately lands *short* of a whole turn by
// the drift already banked at that point, so the drift carries the mark up
// through upright at the middle of the read rather than starting there and
// sliding off it. Everything left over goes to the out-ramp, which makes the
// total a whole number by construction.
const MARK_MID = 0.51;
const TURNS_IN = 2 - DRIFT_TURNS * driftProgress(MARK_MID);
const TURNS_OUT = TOTAL_TURNS - DRIFT_TURNS - TURNS_IN;

export const SPIN = Object.freeze({
  duration: 1.45,

  turnsIn: TURNS_IN,
  turnsOut: TURNS_OUT,
  driftTurns: DRIFT_TURNS,
  totalTurns: TOTAL_TURNS,
  rampInEnd: RAMP_IN_END,
  rampOutStart: RAMP_OUT_START,
  markMid: MARK_MID,

  // Cross-fade schedule. The mark reaches full opacity before the first whip is
  // quite spent and starts fading as the second begins, so the whole solid
  // window belongs to the drift and nothing else.
  markIn: 0.20,
  markFull: 0.36,
  markOut: 0.66,
  markGone: 0.80,

  // A second pulse only restarts the flourish once the mark has gone. Earlier
  // than that and mashing the key strobes between fox and logo.
  restartAfter: 0.86,
});

export function createSpin() {
  return { active: false, t: 0, angle: 0, prevAngle: 0 };
}

/** Ease in and out — zero velocity at both ends, clamped outside [0, 1]. */
function smootherstep(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Total rotation at a point in the flourish. */
export function spinAngle(t) {
  return TAU * (
    TURNS_IN * smootherstep(t / RAMP_IN_END)
    + DRIFT_TURNS * driftProgress(t)
    + TURNS_OUT * smootherstep((t - RAMP_OUT_START) / (1 - RAMP_OUT_START))
  );
}

/**
 * Start a spin, or ignore the request if one is already mid-flourish.
 * @returns whether a spin actually started
 */
export function triggerSpin(spin) {
  if (spin.active && spin.t < SPIN.restartAfter) return false;
  spin.active = true;
  spin.t = 0;
  spin.angle = 0;
  spin.prevAngle = 0;
  return true;
}

export function stepSpin(spin, dt) {
  if (!spin.active) {
    spin.prevAngle = spin.angle;
    spin.angle = 0;
    return false;
  }

  spin.t += dt / SPIN.duration;
  spin.prevAngle = spin.angle;

  if (spin.t >= 1) {
    spin.active = false;
    spin.t = 0;
    spin.angle = 0;
    return true;                     // finished this step
  }

  spin.angle = spinAngle(spin.t);
  return false;
}

/** Ramp from 0 to 1 across [a, b], smoothed. */
function ramp(t, a, b) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return smootherstep((t - a) / (b - a));
}

/** How much of the Firefox mark is showing, 0..1. */
export function markMix(spin) {
  if (!spin.active) return 0;
  const t = spin.t;
  if (t < SPIN.markFull) return ramp(t, SPIN.markIn, SPIN.markFull);
  if (t > SPIN.markOut) return 1 - ramp(t, SPIN.markOut, SPIN.markGone);
  return 1;
}

/** How much of the fox is showing. The two always sum to one. */
export function foxMix(spin) {
  return 1 - markMix(spin);
}

/** True while the mark is solid and turning slowly enough to read. */
export function isReading(spin) {
  return spin.active && spin.t >= SPIN.markFull && spin.t <= SPIN.markOut;
}

/** Radians turned since the previous step — what the motion blur is drawn from. */
export function spinDelta(spin) {
  return spin.angle - spin.prevAngle;
}
