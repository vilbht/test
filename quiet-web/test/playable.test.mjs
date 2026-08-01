// Playability: the strongest guarantee in the suite.
//
// The gap and step invariants check the pieces. This drives a bot through whole
// generated levels end to end, which is the only way to catch a world that is
// individually legal everywhere and still impassable somewhere — a gap whose far
// side is also a rise, a ledge that walls off the route, a slab too short to
// build up run speed on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT, createBody, stepCharacter } from '../core/physics.mjs';
import { generateLevel, groundYAt, safeSpotNear, GROUND_Y } from '../core/level.mjs';

/**
 * A deliberately dumb bot: hold right, jump when blocked or when the ground
 * ahead runs out. If this clears a level, a player will.
 */
function botRun(seed, seconds = 120) {
  const level = generateLevel(seed);
  const body = createBody({ x: level.start.x, y: level.start.y });
  const steps = Math.floor(seconds / FIXED_DT);
  let maxX = body.x;
  let falls = 0;
  let jumps = 0;
  // Distance covered by the PREVIOUS step. Comparing against a position sampled
  // after the same step would always read zero, which silently turns the bot
  // into a permanent bunny-hopper and invalidates every result below.
  let movedLastStep = Infinity;

  for (let i = 0; i < steps; i++) {
    const groundAhead = groundYAt(level, body.x + 40);
    const blocked = movedLastStep < 0.15 && body.onGround;
    const jump = body.onGround && (blocked || groundAhead === null);

    const before = body.x;
    const events = stepCharacter(
      body,
      { move: 1, jumpHeld: true, jumpPressed: jump, dropHeld: false },
      level.rects,
      FIXED_DT,
    );
    movedLastStep = Math.abs(body.x - before);
    if (events.jumped) jumps++;

    if (body.y > GROUND_Y + 360) {
      falls++;
      const spot = safeSpotNear(level, body.x - 40);
      body.x = spot.x; body.y = spot.y; body.vx = 0; body.vy = 0;
    }

    maxX = Math.max(maxX, body.x);

    if (body.x > level.width - 160) {
      return { finished: true, seconds: i * FIXED_DT, falls, jumps, maxX };
    }
  }
  return { finished: false, seconds, falls, jumps, maxX };
}

test('a bot holding right can finish every generated level', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = botRun(seed);
    assert.ok(r.finished,
      `seed ${seed}: bot stuck at x=${r.maxX.toFixed(0)} of ${generateLevel(seed).width}`);
  }
});

test('finishing does not depend on falling into gaps and being rescued', () => {
  // A level the bot only completes by falling in and being lifted out is
  // technically passable and miserable to play. Falling is forgiven by design,
  // which is exactly why it must not be load-bearing.
  for (let seed = 1; seed <= 40; seed++) {
    const r = botRun(seed);
    assert.equal(r.falls, 0, `seed ${seed}: bot fell ${r.falls} times`);
  }
});

test('the bot is actually jumping — the run is not a flat corridor', () => {
  // Guards the tests above: a bot that never jumps, and one that hops every
  // frame, would both "pass" while testing nothing about the level.
  for (let seed = 1; seed <= 12; seed++) {
    const r = botRun(seed);
    assert.ok(r.jumps > 6, `seed ${seed}: only ${r.jumps} jumps — too flat to be a test`);
    assert.ok(r.jumps < 200, `seed ${seed}: ${r.jumps} jumps — bunny-hopping, not navigating`);
  }
});

test('a run takes a sane amount of time — no invisible treadmill', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = botRun(seed);
    const width = generateLevel(seed).width;
    // pure top-speed traversal is the floor; allow generous slack for jumps
    const floor = width / 235;
    assert.ok(r.seconds > floor * 0.8, `seed ${seed}: finished implausibly fast`);
    assert.ok(r.seconds < floor * 3.5,
      `seed ${seed}: took ${r.seconds.toFixed(1)}s for ${width}px`);
  }
});
