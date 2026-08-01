// bodies.mjs — wind fields.
//
// This module used to also hold see-saw planks and pushable crates. Both were
// built on axis-aligned boxes standing on flat ground, and neither has any
// meaning on a mountainside you never stop moving down — Alto's vocabulary is
// chasms, rocks and rails, which live in terrain.mjs and level.mjs. They were
// removed rather than left unused: dead code that no longer matches the game's
// genre is a trap for whoever reads it next. Their history is in git.
//
// Wind survives because weather is part of the mood, and because the same field
// drives the fox's tail, the drifting snow and the bunting on the rails.

/**
 * A rectangular region applying a steady force, plus a slow sinusoidal gust so
 * it never reads as a constant.
 */
export function createWind({ x, y, w, h, fx = 90, fy = -10, gust = 0.35, phase = 0 }) {
  return { x, y, w, h, fx, fy, gust, phase };
}

/** Summed wind force at a point. `t` is elapsed seconds, driving the gust. */
export function windAt(fields, x, y, t = 0) {
  let ax = 0;
  let ay = 0;
  for (const f of fields) {
    if (x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) continue;
    const g = 1 + f.gust * Math.sin(t * 1.7 + f.phase);
    ax += f.fx * g;
    ay += f.fy * g;
  }
  return { x: ax, y: ay };
}
