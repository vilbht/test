// The whole descent, driven by a bot.
//
// The unit tests check pieces in isolation. This is the one that catches a
// mountain which is individually legal everywhere and still miserable to ride:
// a chasm nobody can reach with speed, a stretch that stalls, a seed where the
// fox never gets airborne at all.
//
// The bot plays the game the way the game asks to be played — tap at the lip of
// a chasm, hold to flip when the air is long enough to finish one — so if it can
// get down cleanly, the mountain is fair.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import { generateLevel } from '../core/level.mjs';
import { createRider, stepRider, RIDE } from '../core/ride.mjs';
import { createRun, stepRules, stepTrackers } from '../core/rules.mjs';

const TAU = Math.PI * 2;

/** Turns of rotation the fox can still finish in the air it has left. */
function turnsAvailable(rider) {
  const timeToGround = Math.max(0, (-rider.vy + Math.sqrt(
    Math.max(0, rider.vy * rider.vy + 2 * RIDE.gravity * 90),
  )) / RIDE.gravity);
  return (timeToGround * RIDE.spinRate) / TAU;
}

function descend(seed, seconds = 240) {
  const level = generateLevel(seed);
  const { terrain } = level;
  const rider = createRider(terrain);
  const run = createRun();

  let elapsed = 0;
  let tumbles = 0;
  let rescues = 0;
  let launches = 0;
  let stalledFor = 0;
  let maxX = rider.x;

  for (let i = 0; i < seconds / FIXED_DT; i++) {
    // Tap while grounded *or* inside the coyote window: the ramp on the lip
    // often throws the fox before it reaches the edge, and a player would still
    // get the jump off.
    let jumpPressed = false;
    if (rider.onGround || rider.coyote > 0) {
      for (const c of terrain.chasms) {
        if (rider.x > c.x0 - 70 && rider.x < c.x0) { jumpPressed = true; break; }
      }
    }

    // hold to flip only while a whole turn can still be completed and stopped
    const turns = Math.abs(rider.rotation) / TAU;
    const jumpHeld = !rider.onGround
      && turns < 0.90
      && (turns > 0.05 || turnsAvailable(rider) > 1.15);

    const events = stepRider(rider, terrain, level.rails, { jumpPressed, jumpHeld }, FIXED_DT);
    stepRules(run, level, rider, events, FIXED_DT);
    stepTrackers(level, rider, FIXED_DT, elapsed);

    if (events.tumbled) tumbles++;
    if (events.rescued) rescues++;
    if (events.launched) launches++;

    if (rider.x > maxX + 0.5) { maxX = rider.x; stalledFor = 0; } else stalledFor++;
    elapsed += FIXED_DT;

    if (run.finished) break;
  }

  return { level, run, rider, elapsed, tumbles, rescues, launches, maxX, stalledFor };
}

test('a bot can ride every generated mountain to the bottom', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = descend(seed);
    assert.equal(r.run.finished, true,
      `seed ${seed}: stopped at ${r.maxX.toFixed(0)} of ${r.level.length}`);
  }
});

test('the descent never stalls', () => {
  // Speed-proportional friction plus an uphill could in principle pin the fox in
  // a bowl forever; minSpeed exists to stop that, and this is what proves it.
  for (let seed = 1; seed <= 20; seed++) {
    const r = descend(seed);
    assert.ok(r.stalledFor < 240, `seed ${seed}: stopped making progress for ${r.stalledFor} steps`);
  }
});

test('a descent takes a plausible amount of time', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = descend(seed);
    const floor = r.level.length / RIDE.maxSpeed;
    assert.ok(r.elapsed > floor, `seed ${seed}: finished implausibly fast`);
    assert.ok(r.elapsed < floor * 6,
      `seed ${seed}: took ${r.elapsed.toFixed(0)}s to cover ${r.level.length}px`);
  }
});

test('playing well means rarely falling in', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = descend(seed);
    assert.ok(r.rescues <= 1,
      `seed ${seed}: fell into ${r.rescues} chasms despite jumping at every lip`);
  }
});

test('the mountain throws the fox into the air on its own', () => {
  // If crests never launched, tricks would depend entirely on tapping jump and
  // the terrain would just be scenery.
  for (let seed = 1; seed <= 10; seed++) {
    const r = descend(seed);
    assert.ok(r.launches > 8, `seed ${seed}: only ${r.launches} launches in a whole run`);
  }
});

test('a full descent collects most of what is on the mountain', () => {
  const r = descend(7);
  assert.ok(r.run.coins > r.level.coins.length * 0.25,
    `only ${r.run.coins} of ${r.level.coins.length} coins`);
  assert.equal(r.run.lit, r.level.beacons.length,
    'riding past every campfire should light every one of them');
});

test('tricks land often enough to be worth attempting', () => {
  let landed = 0;
  for (let seed = 1; seed <= 10; seed++) landed += descend(seed).run.flips;
  assert.ok(landed > 4, `only ${landed} flips landed across ten descents`);
});

test('the bot is actually being tested, not coasting a flat corridor', () => {
  // Guards every assertion above: a mountain too flat to launch from, or a bot
  // that never leaves the ground, would pass all of them while proving nothing.
  const r = descend(3);
  assert.ok(r.rider.speed > RIDE.minSpeed, 'should still be carrying speed at the end');
  assert.ok(r.run.distance > r.level.length * 0.9);
  assert.ok(r.tumbles < 60, `${r.tumbles} tumbles suggests the ride is out of control`);
});
