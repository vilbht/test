// rules.mjs — the game's state machine: focus, tracker cling, beacon charging.
//
// No damage, no lives, no fail state. The only pressure is friction: trackers
// cling and slow you down until you shake them off with a shield pulse, which
// costs focus that recovers on its own. Everything here is pure so the whole
// rule set can be stepped and asserted without a canvas.

import { groundYAt, safeSpotNear, GROUND_Y } from './level.mjs';

export const RULES = Object.freeze({
  focusRegen: 0.34,       // per second
  pulseCost: 0.34,
  pulseRadius: 132,
  pulseCooldown: 0.42,
  clingRadius: 20,
  clingSlow: 0.12,        // speed lost per clinging tracker
  minSpeedScale: 0.45,    // never slowed to a crawl
  beaconRadius: 78,
  beaconChargeRate: 0.85, // per second while stood near
  sparkleRadius: 26,
  fallLimit: GROUND_Y + 360,
});

export function createRun() {
  return {
    focus: 1,
    pulse: 0,           // seconds remaining on the visible pulse ring
    cooldown: 0,
    sparkles: 0,
    lit: 0,
    clung: 0,
    speedScale: 1,
    fact: null,         // the fact card currently showing
    factTimer: 0,
    distance: 0,
    finished: false,
  };
}

/**
 * One rules step.
 *
 * @param input  { pulsePressed }
 * @returns events worth reacting to in audio/visuals
 */
export function stepRules(run, level, body, input, dt) {
  const events = { collected: 0, litBeacon: null, dispersed: 0, pulsed: false, respawned: false };

  run.focus = Math.min(1, run.focus + RULES.focusRegen * dt);
  run.pulse = Math.max(0, run.pulse - dt);
  run.cooldown = Math.max(0, run.cooldown - dt);
  run.factTimer = Math.max(0, run.factTimer - dt);
  if (run.factTimer === 0) run.fact = null;
  run.distance = Math.max(run.distance, body.x);

  // ---- fall recovery: lifted back to the last solid ground, never punished
  if (body.y > RULES.fallLimit) {
    const spot = safeSpotNear(level, body.x - 40);
    body.x = spot.x;
    body.y = spot.y;
    body.vx = 0;
    body.vy = 0;
    events.respawned = true;
  }

  // ---- shield pulse: the only "attack", and it disperses rather than destroys
  if (input.pulsePressed && run.cooldown === 0 && run.focus >= RULES.pulseCost) {
    run.focus -= RULES.pulseCost;
    run.pulse = 0.38;
    run.cooldown = RULES.pulseCooldown;
    events.pulsed = true;

    for (const t of level.trackers) {
      if (t.dispersed) continue;
      if (Math.hypot(t.x - body.x, t.y - (body.y - body.h / 2)) > RULES.pulseRadius) continue;
      t.dispersed = true;
      t.clinging = false;
      events.dispersed++;
    }
    for (const c of level.crumbs) {
      if (c.dispersed) continue;
      if (Math.hypot(c.x - body.x, c.y - body.y) > RULES.pulseRadius) continue;
      c.dispersed = true;
      events.dispersed++;
    }
  }

  // ---- trackers cling on contact and ride along, slowing the fox
  let clung = 0;
  for (const t of level.trackers) {
    if (t.dispersed) continue;
    const d = Math.hypot(t.x - body.x, t.y - (body.y - body.h / 2));
    if (d < RULES.clingRadius) t.clinging = true;
    if (t.clinging) clung++;
  }
  run.clung = clung;
  run.speedScale = Math.max(RULES.minSpeedScale, 1 - clung * RULES.clingSlow);

  // ---- sparkles
  for (const s of level.sparkles) {
    if (s.got) continue;
    if (Math.hypot(s.x - body.x, s.y - (body.y - body.h / 2)) > RULES.sparkleRadius) continue;
    s.got = true;
    run.sparkles++;
    events.collected++;
  }

  // ---- beacons charge by proximity; standing still is what lights them
  for (const b of level.beacons) {
    if (b.lit) continue;
    const d = Math.hypot(b.x - body.x, b.y - body.y);
    if (d > RULES.beaconRadius) {
      b.charge = Math.max(0, b.charge - dt * 0.5);
      continue;
    }
    b.charge = Math.min(1, b.charge + RULES.beaconChargeRate * dt);
    if (b.charge >= 1) {
      b.lit = true;
      run.lit++;
      run.fact = b.fact;
      run.factTimer = 9;
      events.litBeacon = b;
    }
  }

  if (!run.finished && body.x >= level.width - 160) run.finished = true;
  return events;
}

/** Trackers drift around their origin until they cling, then follow the fox. */
export function stepTrackers(level, body, dt, t) {
  for (const k of level.trackers) {
    if (k.dispersed) continue;
    if (k.clinging) {
      k.x += (body.x - k.x) * Math.min(1, 9 * dt);
      k.y += (body.y - body.h / 2 - k.y) * Math.min(1, 9 * dt);
      continue;
    }
    k.x += k.vx * dt;
    if (k.x < k.origin - k.range || k.x > k.origin + k.range) k.vx *= -1;
    k.y = k.home + Math.sin(t * 1.4 + k.phase) * 7;
  }
  for (const c of level.crumbs) {
    if (c.dispersed) continue;
    c.x += c.vx * dt;
    if (c.x < c.min || c.x > c.max) c.vx *= -1;
    const g = groundYAt(level, c.x);
    if (g !== null) c.y = g;
  }
}
