// springs.mjs — critically-damped spring-dampers for secondary motion.
//
// Body lean, squash-and-stretch and ear follow-through all want the same thing:
// chase a target without overshooting into wobble. A critically damped spring
// (zeta = 1) is the shortest path to rest with no oscillation.

export function createSpring(value = 0) {
  return { value, velocity: 0 };
}

/**
 * Semi-implicit damped spring. Stable at large dt because velocity is
 * integrated before position.
 *
 * @param freq  natural frequency in Hz — how eagerly it chases
 * @param zeta  damping ratio; 1 = critically damped, <1 overshoots, >1 sluggish
 */
export function stepSpring(s, target, dt, freq = 8, zeta = 1) {
  const omega = 2 * Math.PI * freq;
  const accel = -2 * zeta * omega * s.velocity - omega * omega * (s.value - target);
  s.velocity += accel * dt;
  s.value += s.velocity * dt;
  return s.value;
}

/**
 * Squash and stretch from vertical speed: stretch thin while rising or falling
 * fast, squash wide on impact. Returns {sx, sy} scale factors that preserve
 * rough volume, so the fox never looks like it changed mass.
 */
export function squashStretch(vy, landImpulse, maxFall = 860) {
  const air = Math.max(-1, Math.min(1, vy / maxFall));
  const stretch = 1 + Math.abs(air) * 0.16;
  const squash = 1 - Math.min(0.34, landImpulse);
  const sy = stretch * squash;
  return { sx: 1 / Math.sqrt(sy), sy };
}
