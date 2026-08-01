// physics.mjs — the fixed-timestep clock everything else is driven by.
//
// This file used to hold a kinematic platformer controller: run speed, coyote
// time, axis-separated AABB collision against rectangles. None of it survived
// the move to a slope game, where the ground is a continuous heightfield and
// speed is produced by gravity rather than chosen by the player. That
// controller now lives in core/ride.mjs in a form suited to a surface with a
// gradient; what remains here is the part that was never about platforms.
//
// The fixed step is what makes the simulation deterministic and therefore
// testable, and — for a game whose whole feel is accumulated momentum — what
// stops the ride behaving differently on a 144Hz display than on a 60Hz one.

/** Fixed physics step. Small enough for a stable verlet tail, cheap at 60fps. */
export const FIXED_DT = 1 / 120;

/** Cap on steps per frame so a backgrounded tab doesn't spiral on resume. */
export const MAX_STEPS = 5;

export function createClock() {
  return { acc: 0, alpha: 0 };
}

/**
 * Run as many fixed steps as the elapsed frame time has earned, and report the
 * leftover fraction so rendering can interpolate between the last two states
 * rather than stutter.
 */
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

/** Axis-aligned overlap test, still used for pickups and screen culling. */
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
