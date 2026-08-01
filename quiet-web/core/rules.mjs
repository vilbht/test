// rules.mjs — coins, campfires, trackers, and what a landed trick is worth.
//
// No damage, no lives, no fail state. The only currency is momentum: rocks and
// clinging trackers take speed away, clean landings and grinds give it back.
//
// The one real change from the platformer rules is how trackers come off. There
// is no shield button any more — the game is one button now, as Alto's is — so
// shaking them off is folded into the trick system instead: land a flip and they
// scatter. That makes the privacy mechanic and the trick mechanic the same
// action rather than two things competing for the player's attention.

import { surfaceY, inChasm } from './terrain.mjs';
import { RIDE } from './ride.mjs';

export const RULES = Object.freeze({
  coinRadius: 26,
  beaconRadius: 96,
  rockRadius: 20,
  rockCost: 0.62,        // fraction of speed kept after clipping a rock
  clingRadius: 24,
  clingDrag: 0.10,       // extra friction per clinging tracker
  maxCling: 5,
  factTime: 9,
});

export function createRun() {
  return {
    coins: 0,
    lit: 0,
    flips: 0,
    bestFlip: 0,
    grinds: 0,
    clung: 0,
    distance: 0,
    fact: null,
    factTimer: 0,
    finished: false,
  };
}

/**
 * One rules step. Reads the rider, mutates the world, and returns what happened
 * so audio and particles can react without re-deriving any of it.
 *
 * @param rideEvents the return value of stepRider for this same step
 */
export function stepRules(run, level, rider, rideEvents, dt) {
  const events = {
    coins: 0, litBeacon: null, rock: false, shook: 0, flips: rideEvents.flips,
  };

  const { terrain } = level;
  run.distance = Math.max(run.distance, rider.x);
  run.factTimer = Math.max(0, run.factTimer - dt);
  if (run.factTimer === 0) run.fact = null;

  // ---- coins
  for (const c of level.coins) {
    if (c.got) continue;
    if (Math.hypot(c.x - rider.x, c.y - rider.y) > RULES.coinRadius) continue;
    c.got = true;
    run.coins++;
    events.coins++;
  }

  // ---- campfires light as you pass. They cannot ask the player to stop and
  // wait: in a momentum game there is no standing still, and a collectible that
  // demands one would fight everything else about the ride.
  for (const b of level.beacons) {
    if (b.lit) continue;
    if (Math.abs(b.x - rider.x) > RULES.beaconRadius) continue;
    if (Math.abs(b.y - rider.y) > 150) continue;
    b.lit = true;
    b.charge = 1;
    run.lit++;
    run.fact = b.fact;
    run.factTimer = RULES.factTime;
    events.litBeacon = b;
  }

  // ---- rocks cost momentum, once each
  for (const rock of level.rocks) {
    if (rock.hit) continue;
    if (Math.hypot(rock.x - rider.x, rock.y - rider.y) > RULES.rockRadius + rock.r) continue;
    if (!rider.onGround) continue;               // cleared it in the air
    rock.hit = true;
    rider.speed = Math.max(RIDE.minSpeed, rider.speed * RULES.rockCost);
    rider.tumble = Math.max(rider.tumble, 0.4);
    events.rock = true;
  }

  // ---- trackers cling on contact
  let clung = 0;
  for (const t of level.trackers) {
    if (t.dispersed) continue;
    if (!t.clinging && Math.hypot(t.x - rider.x, t.y - rider.y) < RULES.clingRadius) {
      t.clinging = true;
    }
    if (t.clinging) clung++;
  }

  // ---- a landed flip shakes every one of them off
  if (rideEvents.flips > 0) {
    for (const t of level.trackers) {
      if (!t.clinging) continue;
      t.clinging = false;
      t.dispersed = true;
      events.shook++;
    }
    run.flips += rideEvents.flips;
    run.bestFlip = Math.max(run.bestFlip, rideEvents.flips);
    clung = 0;
  }
  if (rideEvents.grindStart) run.grinds++;

  run.clung = Math.min(RULES.maxCling, clung);

  // Cling is drag, not a speed cap: it makes the fox feel heavy and slow to wind
  // up rather than pinning it to a number, which is the difference between an
  // encumbrance and a punishment.
  if (run.clung > 0 && rider.onGround) {
    rider.speed = Math.max(
      RIDE.minSpeed,
      rider.speed - rider.speed * RULES.clingDrag * run.clung * dt,
    );
  }

  if (!run.finished && rider.x >= level.length - 200) run.finished = true;
  return events;
}

/** Trackers drift over the snow until they latch on, then ride along. */
export function stepTrackers(level, rider, dt, t) {
  for (const k of level.trackers) {
    if (k.dispersed) continue;
    if (k.clinging) {
      k.x += (rider.x - k.x) * Math.min(1, 10 * dt);
      k.y += (rider.y - 16 - k.y) * Math.min(1, 10 * dt);
      continue;
    }
    k.x += k.vx * dt;
    if (k.x < k.origin - k.range || k.x > k.origin + k.range) k.vx *= -1;
    if (inChasm(level.terrain, k.x)) k.vx *= -1;
    k.y = k.home + Math.sin(t * 1.5 + k.phase) * 8;
  }
  void surfaceY;
}
