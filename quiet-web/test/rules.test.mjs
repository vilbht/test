// Rules. A calm game is only calm if the clamps hold, and the one mechanic
// worth guarding hardest is that a landed flip is what shakes trackers off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import { createRun, stepRules, stepTrackers, RULES } from '../core/rules.mjs';
import { generateLevel } from '../core/level.mjs';
import { createRider, stepRider, RIDE } from '../core/ride.mjs';
import { surfaceY } from '../core/terrain.mjs';

const NO_EVENTS = {
  launched: false, landed: false, tumbled: false,
  flips: 0, grindStart: false, grindEnd: false, rescued: false,
};

function fixture(seed = 5) {
  const level = generateLevel(seed);
  const rider = createRider(level.terrain);
  return { level, rider, run: createRun() };
}

test('coins are collected once and counted once', () => {
  const { level, rider, run } = fixture();
  const coin = level.coins[0];
  rider.x = coin.x;
  rider.y = coin.y;

  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.coins, 1);
  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.coins, 1, 'an already-taken coin must not re-trigger');
});

test('a campfire lights as you pass, with no need to stop', () => {
  // The platformer version made you stand still to charge one. In a momentum
  // game there is no standing still, so passing close is the whole interaction.
  const { level, rider, run } = fixture();
  const fire = level.beacons[0];
  rider.x = fire.x;
  rider.y = fire.y;

  const e = stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(e.litBeacon, fire);
  assert.equal(run.lit, 1);
  assert.equal(run.fact, fire.fact);
  assert.ok(run.factTimer > 0);

  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.lit, 1, 'must not count twice');
});

test('the fact card expires on its own', () => {
  const { level, rider, run } = fixture();
  const fire = level.beacons[0];
  rider.x = fire.x;
  rider.y = fire.y;
  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.ok(run.fact);

  for (let i = 0; i < 120 * (RULES.factTime + 1); i++) {
    stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  }
  assert.equal(run.fact, null);
  assert.equal(run.factTimer, 0);
});

test('clipping a rock costs momentum, once', () => {
  const { level, rider, run } = fixture();
  const rock = level.rocks[0];
  rider.x = rock.x;
  rider.y = rock.y;
  rider.onGround = true;
  rider.speed = 500;

  const e = stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(e.rock, true);
  assert.ok(rider.speed < 500 * 0.7, `speed only fell to ${rider.speed.toFixed(0)}`);

  const after = rider.speed;
  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(rider.speed, after, 'the same rock must not bite twice');
});

test('a rock cleared in the air does nothing', () => {
  const { level, rider, run } = fixture();
  const rock = level.rocks[0];
  rider.x = rock.x;
  rider.y = rock.y;
  rider.onGround = false;
  rider.speed = 500;

  const e = stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(e.rock, false);
  assert.equal(rider.speed, 500);
  assert.equal(rock.hit, false);
});

test('trackers cling on contact and drag without stalling the run', () => {
  const { level, rider, run } = fixture();
  level.trackers = Array.from({ length: 12 }, () => ({
    x: rider.x, y: rider.y, home: rider.y, origin: rider.x,
    range: 20, vx: 0, phase: 0, clinging: false, dispersed: false,
  }));
  rider.speed = 400;

  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.clung, RULES.maxCling, 'cling should clamp');

  for (let i = 0; i < 600; i++) stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.ok(rider.speed < 400, 'cling should drag');
  assert.ok(rider.speed >= RIDE.minSpeed, 'but never stall the fox');
});

test('landing a flip shakes every clinging tracker off', () => {
  // The mechanic the whole one-button design rests on: there is no shield
  // button any more, so the trick *is* the answer to being slowed down.
  const { level, rider, run } = fixture();
  level.trackers = Array.from({ length: 6 }, () => ({
    x: rider.x, y: rider.y, home: rider.y, origin: rider.x,
    range: 20, vx: 0, phase: 0, clinging: true, dispersed: false,
  }));

  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.clung, RULES.maxCling);

  const e = stepRules(run, level, rider, { ...NO_EVENTS, flips: 1 }, FIXED_DT);
  assert.equal(e.shook, 6);
  assert.equal(run.clung, 0);
  assert.equal(run.flips, 1);
  assert.equal(level.trackers.every((t) => !t.clinging), true);
});

test('a tumble does not shake trackers off — only a completed flip does', () => {
  const { level, rider, run } = fixture();
  level.trackers = [{
    x: rider.x, y: rider.y, home: rider.y, origin: rider.x,
    range: 20, vx: 0, phase: 0, clinging: true, dispersed: false,
  }];
  const e = stepRules(run, level, rider, { ...NO_EVENTS, tumbled: true, flips: 0 }, FIXED_DT);
  assert.equal(e.shook, 0);
  assert.equal(run.clung, 1);
});

test('the run finishes at the bottom of the mountain', () => {
  const { level, rider, run } = fixture();
  assert.equal(run.finished, false);
  rider.x = level.length - 100;
  stepRules(run, level, rider, NO_EVENTS, FIXED_DT);
  assert.equal(run.finished, true);
});

test('trackers patrol within range and stay out of chasms', () => {
  const { level, rider } = fixture();
  const patrolling = level.trackers.filter((t) => !t.clinging).slice(0, 25);
  for (let i = 0; i < 1800; i++) stepTrackers(level, rider, FIXED_DT, i * FIXED_DT);
  for (const t of patrolling) {
    assert.ok(Math.abs(t.x - t.origin) <= t.range + 6, 'tracker wandered off its patrol');
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
  }
});

test('a whole descent with the rules attached stays finite and counts up', () => {
  const { level, rider, run } = fixture(9);
  for (let i = 0; i < 120 * 200; i++) {
    const e = stepRider(rider, level.terrain, level.rails,
      { jumpPressed: i % 140 === 0, jumpHeld: i % 11 < 6 }, FIXED_DT);
    stepRules(run, level, rider, e, FIXED_DT);
    stepTrackers(level, rider, FIXED_DT, i * FIXED_DT);
    if (run.finished) break;
  }
  assert.equal(run.finished, true, 'should reach the bottom');
  assert.ok(run.coins > 0, 'should have picked something up on the way');
  assert.ok(run.lit > 0, 'should have lit at least one campfire');
  for (const v of [rider.x, rider.y, rider.speed, run.coins, run.distance]) {
    assert.ok(Number.isFinite(v));
  }
  void surfaceY;
});
