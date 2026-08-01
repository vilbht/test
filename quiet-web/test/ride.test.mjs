// The rider. Speed here is an emergent quantity, not a setting, so these tests
// mostly assert relationships — steeper means faster, a flip pays only if it
// completes — rather than specific numbers that would just restate the tuning.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import { createRamp, surfaceY, slopeAt, angleAt } from '../core/terrain.mjs';
import { buildMountain } from '../core/level.mjs';
import { RIDE, createRider, stepRider, angleDelta, speedFraction } from '../core/ride.mjs';

const IDLE = { jumpPressed: false, jumpHeld: false };
const TAU = Math.PI * 2;

const build = (seed = 7) => buildMountain(seed, 12000);
const ramp = (slope) => createRamp(slope);

/**
 * Run the rider.
 *
 * `onStep` fires immediately after each step, which is the only way to observe
 * state at the moment an event happens. Iterating the returned array instead
 * reads the rider as it is at the *end* of the run — a trap that quietly turned
 * a landing-speed assertion into a measurement of terminal velocity.
 */
function ride(rider, terrain, steps, policy = () => IDLE, rails = [], onStep = null) {
  const seen = [];
  for (let i = 0; i < steps; i++) {
    const events = stepRider(rider, terrain, rails, { ...IDLE, ...(policy(rider, i) || {}) }, FIXED_DT);
    seen.push(events);
    if (onStep) onStep(events, rider, i);
  }
  return seen;
}

test('gravity along the slope is what moves the fox', () => {
  const down = createRider(ramp(0.3));
  ride(down, ramp(0.3), 600);
  assert.ok(down.speed > 300, `downhill only reached ${down.speed.toFixed(0)}`);

  const up = createRider(ramp(-0.3));
  up.speed = 500;
  ride(up, ramp(-0.3), 600);
  assert.equal(up.speed, RIDE.minSpeed, 'an uphill should bleed speed to the floor');
});

test('steeper ground settles at a higher speed', () => {
  const speeds = [0.12, 0.24, 0.40].map((s) => {
    const r = createRider(ramp(s));
    ride(r, ramp(s), 1400);
    return r.speed;
  });
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2],
    `expected increasing terminal speeds, got ${speeds.map((v) => v.toFixed(0))}`);
  assert.ok(speeds[2] <= RIDE.maxSpeed);
});

test('speed stays inside its bounds however long the descent', () => {
  const t = build(7);
  const r = createRider(t);
  ride(r, t, 120 * 90);
  assert.ok(r.speed >= RIDE.minSpeed - 1e-6 && r.speed <= RIDE.maxSpeed + 1e-6);
  assert.ok(speedFraction(r) >= 0 && speedFraction(r) <= 1);
});

test('a jump on a descent gets its full height', () => {
  // Regression. Adding the impulse to the raw tangential velocity meant the fox
  // was already moving down the slope, so the tap that most needs height — the
  // one at the lip of a chasm — got the least. Downward motion is now discarded.
  const t = ramp(0.42);
  const flat = ramp(0);

  const onSlope = createRider(t);
  ride(onSlope, t, 400);
  const before = onSlope.y;
  let peakSlope = before;
  ride(onSlope, t, 200, (r, i) => {
    peakSlope = Math.min(peakSlope, r.y - (surfaceY(t, r.x) - before));
    return { jumpPressed: i === 0 };
  });

  const onFlat = createRider(flat);
  let peakFlat = onFlat.y;
  ride(onFlat, flat, 200, (r, i) => {
    peakFlat = Math.min(peakFlat, r.y);
    return { jumpPressed: i === 0 };
  });

  const slopeRise = before - peakSlope;
  const flatRise = onFlat.y - peakFlat;
  assert.ok(slopeRise > flatRise * 0.8,
    `descending jump rose ${slopeRise.toFixed(0)}px vs ${flatRise.toFixed(0)}px on the flat`);
});

test('a crest throws the fox into the air with no authored jump point', () => {
  const t = build(7);
  const r = createRider(t);
  let launches = 0;
  ride(r, t, 120 * 70).forEach((e) => { if (e.launched) launches++; });
  assert.ok(launches > 3, `only ${launches} natural launches over a whole descent`);
});

test('a tap at the lip clears every chasm the generator emits', () => {
  // The load-bearing test. Chasm width is only fair if the real controller can
  // actually cross it, so this flies the real controller rather than estimating.
  for (const seed of [1, 4, 7, 11, 19, 23]) {
    const t = build(seed);
    const r = createRider(t);
    let rescues = 0;

    ride(r, t, 120 * 200, (rider) => {
      if (!rider.onGround && rider.coyote <= 0) return IDLE;
      for (const c of t.chasms) {
        if (rider.x > c.x0 - 70 && rider.x < c.x0) return { jumpPressed: true };
      }
      return IDLE;
    }).forEach((e) => { if (e.rescued) rescues++; });

    assert.ok(r.x > t.length - 400, `seed ${seed}: only reached ${r.x.toFixed(0)}`);
    assert.equal(rescues, 0, `seed ${seed}: fell into ${rescues} chasm(s) despite jumping`);
  }
});

test('falling into a chasm lifts the fox out on the far lip', () => {
  const t = build(7);
  const c = t.chasms[0];
  const r = createRider(t);
  r.x = c.x0 + 10;
  r.y = surfaceY(t, r.x);
  r.onGround = false;
  r.vx = 60;
  r.vy = 200;

  let rescued = false;
  ride(r, t, 600).forEach((e) => { if (e.rescued) rescued = true; });

  assert.ok(rescued, 'should have been rescued');
  assert.ok(r.x > c.x1, 'should come back on the far side');
  assert.ok(Math.abs(r.y - surfaceY(t, r.x)) < 2, 'should be on the surface');
  assert.ok(Number.isFinite(r.speed) && r.speed >= RIDE.minSpeed);
});

test('a completed flip scores and a short one does not', () => {
  const t = ramp(0.34);
  const outcomes = [0.6, 0.95].map((releaseTurns) => {
    const r = createRider(t);
    ride(r, t, 500);
    let jumped = false;
    let result = null;
    ride(r, t, 500, (rider) => {
      if (!jumped && rider.onGround) { jumped = true; return { jumpPressed: true }; }
      return { jumpHeld: !rider.onGround && Math.abs(rider.rotation) / TAU < releaseTurns };
    }).forEach((e) => {
      if (result === null && (e.landed || e.tumbled)) result = { flips: e.flips, tumbled: e.tumbled };
    });
    return result;
  });

  assert.equal(outcomes[0].flips, 0, 'a partial rotation must not score');
  assert.equal(outcomes[0].tumbled, true, 'landing part-way round is a tumble');
  assert.equal(outcomes[1].flips, 1, 'a completed rotation should score');
  assert.equal(outcomes[1].tumbled, false, 'and should land clean');
});

test('a clean landing keeps speed and a tumble costs it', () => {
  // Speed has to be sampled at the moment of touchdown. Reading it at the end of
  // the run measures the slope, not the landing: on a descent the fox winds
  // straight back up to terminal velocity within a second either way.
  const attempt = (releaseTurns) => {
    const t = ramp(0.34);
    const r = createRider(t);
    ride(r, t, 500);
    const before = r.speed;

    let jumped = false;
    let atLanding = null;
    let tumbled = false;
    ride(r, t, 500, (rider) => {
      if (!jumped && rider.onGround) { jumped = true; return { jumpPressed: true }; }
      return { jumpHeld: !rider.onGround && Math.abs(rider.rotation) / TAU < releaseTurns };
    }, [], (e, rider) => {
      if (atLanding === null && (e.landed || e.tumbled)) {
        atLanding = rider.speed;
        tumbled = e.tumbled;
      }
    });
    return { before, after: atLanding, tumbled };
  };

  const clean = attempt(0.95);
  const messy = attempt(0.55);

  assert.equal(clean.tumbled, false);
  assert.equal(messy.tumbled, true);

  // The reference is what the *same jump* would have paid, not the cruise before
  // it: a landing always arrives faster than cruising because the fall adds
  // tangential speed, so comparing to the cruise flatters a tumble.
  assert.ok(messy.after < clean.after * 0.55,
    `tumble should cost most of the landing: clean ${clean.after.toFixed(0)} vs tumble ${messy.after.toFixed(0)}`);

  // And it must be felt in absolute terms — below the speed the fox was already
  // carrying, or a crash is free.
  assert.ok(messy.after < messy.before,
    `tumble left the fox at ${messy.after.toFixed(0)}, no slower than its ${messy.before.toFixed(0)} cruise`);
  assert.ok(clean.after > clean.before,
    `a clean landing should reward: ${clean.before.toFixed(0)} → ${clean.after.toFixed(0)}`);
});

test('rotation resets between flights, so credit cannot carry over', () => {
  const t = ramp(0.3);
  const r = createRider(t);
  ride(r, t, 300);
  ride(r, t, 400, (rider, i) => ({ jumpPressed: i === 0, jumpHeld: !rider.onGround }));
  assert.ok(r.onGround, 'should have landed');
  assert.equal(r.rotation, 0);
});

test('grinding a rail accelerates, then releases forward', () => {
  // A rail is only ever caught from the air — that is the point of it — so the
  // fox has to be airborne and descending before the rail is laid under it.
  const t = ramp(0.2);
  const r = createRider(t);
  ride(r, t, 400);
  const before = r.speed;

  ride(r, t, 1, () => ({ jumpPressed: true }));
  let guard = 0;
  while (r.vy < 40 && guard++ < 400) ride(r, t, 1);
  assert.equal(r.onGround, false, 'should be airborne before laying the rail');

  const rail = { x0: r.x - 4, y0: r.y + 6, x1: r.x + 420, y1: r.y + 96 };

  let started = false;
  let ended = false;
  let peak = 0;
  ride(r, t, 900, () => IDLE, [rail], (e, rider) => {
    if (e.grindStart) started = true;
    if (e.grindEnd && !ended) { ended = true; peak = rider.speed; }
  });

  assert.ok(started, 'should have latched onto the rail');
  assert.ok(ended, 'should have left the far end');
  assert.ok(peak > before, `grind should pay: ${before.toFixed(0)} → ${peak.toFixed(0)}`);
  assert.equal(r.grinding, null);
});

test('nothing goes non-finite over a long descent with input mashed', () => {
  const t = build(13);
  const r = createRider(t);
  ride(r, t, 120 * 150, (rider, i) => ({
    jumpPressed: i % 17 === 0,
    jumpHeld: i % 5 < 3,
  }));
  for (const v of [r.x, r.y, r.speed, r.vx, r.vy, r.angle, r.rotation]) {
    assert.ok(Number.isFinite(v), 'rider went non-finite');
  }
});

test('the ride is deterministic', () => {
  const run = () => {
    const t = build(5);
    const r = createRider(t);
    ride(r, t, 120 * 40, (rider, i) => ({ jumpPressed: i % 90 === 0, jumpHeld: i % 7 < 4 }));
    return [r.x, r.y, r.speed, r.flips];
  };
  assert.deepEqual(run(), run());
});

test('angleDelta takes the short way round', () => {
  assert.ok(Math.abs(angleDelta(0.1, TAU - 0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(angleDelta(-3.1, 3.1) - 0.0831853) < 1e-4);
  assert.equal(angleDelta(1, 1), 0);
});

test('the fox tracks the surface angle while grounded', () => {
  const t = build(7);
  const r = createRider(t);
  ride(r, t, 120 * 30);
  // the mountain launches the fox regularly now, so wait for it to settle
  let guard = 0;
  while (!r.onGround && guard++ < 2000) ride(r, t, 1);
  assert.ok(r.onGround, 'never came back down');
  assert.ok(Math.abs(angleDelta(r.angle, angleAt(t, r.x))) < 0.12,
    'a grounded fox should lie along the slope');
  void slopeAt;
});
