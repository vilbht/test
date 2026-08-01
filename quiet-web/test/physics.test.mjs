// Character controller: the affordances players feel but never name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUNING, FIXED_DT, createBody, stepCharacter, createClock, advance,
} from '../core/physics.mjs';
import { STEP_UP } from '../core/level.mjs';

const IDLE = { move: 0, jumpHeld: false, jumpPressed: false, dropHeld: false };
const flat = (y = 420) => [{ x: -200, y, w: 4000, h: 900 }];

/** Run the sim, letting a callback shape input and observe each step. */
function sim(body, rects, steps, fn = () => IDLE) {
  const seen = [];
  for (let i = 0; i < steps; i++) {
    const input = { ...IDLE, ...(fn(i, body, seen) || {}) };
    seen.push(stepCharacter(body, input, rects, FIXED_DT));
  }
  return seen;
}

test('rests on the ground without sinking or jittering', () => {
  const b = createBody({ x: 100, y: 420 });
  sim(b, flat(), 240);
  assert.equal(b.y, 420);
  assert.equal(b.onGround, true);
  assert.equal(b.vy, 0);
});

test('jump peak is close to the height the tuning was derived for', () => {
  const b = createBody({ x: 100, y: 420 });
  let peak = 420;
  sim(b, flat(), 200, (i) => {
    peak = Math.min(peak, b.y);
    return { jumpPressed: i === 0, jumpHeld: true };
  });
  const height = 420 - peak;
  // apex float lifts it slightly above the 90px the constants solve for
  assert.ok(height > 88 && height < 125, `peak ${height.toFixed(1)}px`);
});

test('releasing jump early gives a lower arc', () => {
  const full = createBody({ x: 100, y: 420 });
  let fullPeak = 420;
  sim(full, flat(), 200, (i) => {
    fullPeak = Math.min(fullPeak, full.y);
    return { jumpPressed: i === 0, jumpHeld: true };
  });

  const tap = createBody({ x: 100, y: 420 });
  let tapPeak = 420;
  sim(tap, flat(), 200, (i) => {
    tapPeak = Math.min(tapPeak, tap.y);
    return { jumpPressed: i === 0, jumpHeld: i < 8 };
  });

  assert.ok(420 - tapPeak < (420 - fullPeak) * 0.72,
    `tap ${(420 - tapPeak).toFixed(1)} vs full ${(420 - fullPeak).toFixed(1)}`);
});

const LEDGE = [{ x: 0, y: 420, w: 300, h: 900 }];

/**
 * The frame on which the fox actually loses ground contact walking off LEDGE.
 * Measured rather than assumed: it depends on run acceleration and on the body's
 * half-width overhanging the edge, so a hard-coded frame number would be testing
 * my arithmetic instead of the coyote window.
 */
function framesUntilAirborne(rects) {
  const probe = createBody({ x: 290, y: 420 });
  for (let i = 0; i < 400; i++) {
    stepCharacter(probe, { ...IDLE, move: 1 }, rects, FIXED_DT);
    if (!probe.onGround) return i;
  }
  throw new Error('never left the ground');
}

test('coyote time lets a jump land just after walking off an edge', () => {
  const leaves = framesUntilAirborne(LEDGE);
  const press = leaves + Math.floor((TUNING.coyoteTime * 0.5) / FIXED_DT);
  const b = createBody({ x: 290, y: 420 });
  let jumped = false;
  sim(b, LEDGE, 300, (i) => ({ move: 1, jumpPressed: i === press, jumpHeld: i >= press }))
    .forEach((e) => { if (e.jumped) jumped = true; });
  assert.ok(jumped, 'a jump inside the coyote window should be granted');
});

test('coyote time expires', () => {
  const leaves = framesUntilAirborne(LEDGE);
  const press = leaves + Math.ceil((TUNING.coyoteTime + 0.05) / FIXED_DT);
  const b = createBody({ x: 290, y: 420 });
  let jumped = false;
  sim(b, LEDGE, 300, (i) => ({ move: 1, jumpPressed: i === press, jumpHeld: i >= press }))
    .forEach((e) => { if (e.jumped) jumped = true; });
  assert.equal(jumped, false, 'a jump well past the window must not be granted');
});

test('jump buffer fires a jump pressed just before landing', () => {
  // Measure the landing frame first, then press inside the buffer window ahead
  // of it — the point is the buffer, not my ability to predict fall time.
  const probe = createBody({ x: 100, y: 300 });
  let landsAt = -1;
  for (let i = 0; i < 400 && landsAt < 0; i++) {
    if (stepCharacter(probe, IDLE, flat(), FIXED_DT).landed) landsAt = i;
  }
  assert.ok(landsAt > 0, 'probe never landed');

  const press = landsAt - Math.floor((TUNING.jumpBuffer * 0.5) / FIXED_DT);
  assert.ok(press > 0 && press < landsAt, 'press must be while still airborne');

  const b = createBody({ x: 100, y: 300 });
  let jumped = false;
  sim(b, flat(), 400, (i) => ({ jumpPressed: i === press, jumpHeld: i >= press }))
    .forEach((e) => { if (e.jumped) jumped = true; });
  assert.ok(jumped, 'a jump buffered before touchdown should fire on landing');
});

test('jump buffer expires rather than firing a jump pressed long ago', () => {
  const probe = createBody({ x: 100, y: 300 });
  let landsAt = -1;
  for (let i = 0; i < 400 && landsAt < 0; i++) {
    if (stepCharacter(probe, IDLE, flat(), FIXED_DT).landed) landsAt = i;
  }
  const press = landsAt - Math.ceil((TUNING.jumpBuffer + 0.06) / FIXED_DT);
  assert.ok(press > 0, 'need a longer fall to test buffer expiry');

  const b = createBody({ x: 100, y: 300 });
  let jumped = false;
  sim(b, flat(), 400, (i) => ({ jumpPressed: i === press }))
    .forEach((e) => { if (e.jumped) jumped = true; });
  assert.equal(jumped, false, 'a stale press must not resurface as a jump');
});

test('does not tunnel through a thin platform at absurd speed', () => {
  const b = createBody({ x: 100, y: 0 });
  b.vy = 5000;
  const rects = [{ x: 0, y: 420, w: 400, h: 10 }];
  sim(b, rects, 60);
  assert.equal(b.onGround, true);
  assert.ok(b.y <= 421, `stopped at ${b.y}`);
});

// 60px up: inside the jump peak with margin, so this tests the one-way rule
// rather than how close to the apex the ledge happens to sit.
const LEDGE_Y = 360;
const oneWayWorld = () => [{ x: 0, y: LEDGE_Y, w: 400, h: 12, oneWay: true }, ...flat()];

test('one-way platform: pass up through it, land on it coming down', () => {
  const b = createBody({ x: 100, y: 420 });
  sim(b, oneWayWorld(), 300, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.equal(b.onGround, true);
  assert.equal(b.y, LEDGE_Y, 'should come to rest on the ledge, not pass through it');
});

test('one-way platform: drop through when holding down', () => {
  const rects = oneWayWorld();
  const b = createBody({ x: 100, y: LEDGE_Y });
  sim(b, rects, 12);
  assert.equal(b.y, LEDGE_Y);
  sim(b, rects, 300, () => ({ dropHeld: true }));
  assert.equal(b.y, 420, 'should have dropped to the floor below');
});

test('one-way platform never blocks horizontal movement', () => {
  const rects = [{ x: 200, y: 400, w: 100, h: 12, oneWay: true }, ...flat()];
  const b = createBody({ x: 100, y: 420 });
  sim(b, rects, 300, () => ({ move: 1 }));
  assert.ok(b.x > 320, `a ledge edge should not snag the fox, stopped at ${b.x.toFixed(1)}`);
});

test('walking across abutting slabs never reports a phantom airborne frame', () => {
  // The seam case: per-axis resolution alone can miss the ground for one step,
  // silently eating coyote time and making a jump at the seam fail.
  const rects = [
    { x: 0, y: 420, w: 200, h: 900 },
    { x: 200, y: 420, w: 900, h: 900 },   // wide, so the run never leaves the world
  ];
  const b = createBody({ x: 60, y: 420 });
  let airborneFrames = 0;
  sim(b, rects, 400, (i) => {
    if (i > 0 && !b.onGround) airborneFrames++;   // frame 0 is before the first step
    return { move: 1 };
  });
  assert.ok(b.x > 260, `should have crossed the seam, reached ${b.x.toFixed(1)}`);
  assert.equal(airborneFrames, 0, 'ground contact must be continuous across the seam');
});

test('clears the widest gap the generator can emit, landing on a full step up', () => {
  // The load-bearing test: maxSafeGap is only meaningful if the jump arc really
  // clears it — including when the far side is a maximum upward step.
  const gap = TUNING.maxSafeGap;
  const farX = 300 + gap;
  const farY = 420 - STEP_UP;
  const rects = [
    { x: 0, y: 420, w: 300, h: 900 },
    { x: farX, y: farY, w: 900, h: 900 },
  ];
  const b = createBody({ x: 60, y: 420 });
  let jumped = false;
  let landedBeyond = false;

  for (let i = 0; i < 900 && !landedBeyond; i++) {
    const doJump = !jumped && b.onGround && b.x >= 292;
    if (doJump) jumped = true;
    const e = stepCharacter(b, { ...IDLE, move: 1, jumpPressed: doJump, jumpHeld: true }, rects, FIXED_DT);
    if (e.landed && b.x > farX) landedBeyond = true;
    assert.ok(b.y < 900, `fell into the gap at x=${b.x.toFixed(1)}`);
  }

  assert.ok(jumped, 'never reached the edge to jump');
  assert.ok(landedBeyond, 'did not clear the widest permitted gap');
  assert.equal(b.y, farY, 'should be standing on the raised far slab');
});

test('accumulator is deterministic and clamps runaway frame times', () => {
  const clock = createClock();
  let n = 0;
  advance(clock, 1 / 60, () => n++);
  assert.equal(n, 2, '1/60s should be exactly two 1/120s steps');

  const spiral = createClock();
  let m = 0;
  advance(spiral, 10, () => m++);   // a tab backgrounded for ten seconds
  assert.ok(m <= 4, `expected clamping, ran ${m} steps`);
});
