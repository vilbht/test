// The shield-pulse flourish. Only the arithmetic is testable, but the failures
// worth catching are all arithmetic: a fox left permanently tilted, a spin that
// never ends, or the fox and the mark both visible at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import {
  SPIN, createSpin, triggerSpin, stepSpin, markMix, foxMix, spinDelta,
} from '../core/spin.mjs';

const TAU = Math.PI * 2;

/** Run a spin to completion, sampling every step. */
function record(spin, steps = Math.ceil(SPIN.duration / FIXED_DT) + 20) {
  const frames = [];
  for (let i = 0; i < steps; i++) {
    const finished = stepSpin(spin, FIXED_DT);
    frames.push({
      t: spin.t,
      angle: spin.angle,
      mark: markMix(spin),
      fox: foxMix(spin),
      delta: spinDelta(spin),
      active: spin.active,
      finished,
    });
  }
  return frames;
}

test('an untriggered spin stays completely at rest', () => {
  const spin = createSpin();
  for (let i = 0; i < 400; i++) stepSpin(spin, FIXED_DT);
  assert.equal(spin.active, false);
  assert.equal(spin.angle, 0);
  assert.equal(markMix(spin), 0);
  assert.equal(foxMix(spin), 1);
});

test('a spin always ends, and ends within its stated duration', () => {
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin);
  assert.ok(frames.some((f) => f.finished), 'never reported finishing');
  assert.equal(spin.active, false);
  const at = frames.findIndex((f) => f.finished) * FIXED_DT;
  assert.ok(Math.abs(at - SPIN.duration) < 0.05, `finished at ${at.toFixed(2)}s`);
});

test('the fox is left facing exactly the way it started', () => {
  // The whole reason `turns` is an integer. A fractional count leaves the fox
  // permanently tilted the moment the spin stops being drawn.
  assert.equal(Number.isInteger(SPIN.turns), true);
  const spin = createSpin();
  triggerSpin(spin);
  record(spin);
  assert.equal(spin.angle, 0);
});

test('rotation only ever goes forwards, and covers the full turns', () => {
  const spin = createSpin();
  triggerSpin(spin);
  let peak = 0;
  let previous = 0;
  for (let i = 0; i < Math.ceil(SPIN.duration / FIXED_DT) - 1; i++) {
    stepSpin(spin, FIXED_DT);
    assert.ok(spin.angle >= previous - 1e-9, 'spin went backwards');
    previous = spin.angle;
    peak = Math.max(peak, spin.angle);
  }
  assert.ok(peak > SPIN.turns * TAU * 0.97, `only reached ${(peak / TAU).toFixed(2)} turns`);
});

test('the fox and the mark never both show at full strength', () => {
  const spin = createSpin();
  triggerSpin(spin);
  for (const f of record(spin)) {
    assert.ok(Math.abs(f.mark + f.fox - 1) < 1e-9, 'the cross-fade must sum to one');
    assert.ok(f.mark >= 0 && f.mark <= 1);
  }
});

test('the mark is fully absent at both ends and fully present in the middle', () => {
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin);

  assert.equal(frames[0].mark, 0, 'the mark must not be showing as the spin begins');
  assert.equal(frames[frames.length - 1].mark, 0, 'nor once it has ended');
  assert.ok(frames.some((f) => f.mark > 0.99), 'the mark should reach full strength');

  // and it must be gone again before the fox is back to full
  const lastMark = frames.map((f) => f.mark).lastIndexOf(0);
  assert.ok(frames[lastMark].fox === 1, 'the fox should be whole once the mark clears');
});

test('spin speed peaks in the middle, where the mark is', () => {
  // The morph is meant to happen at maximum blur — a swap at a standstill reads
  // as a substitution rather than a transformation.
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin).filter((f) => f.active);

  let fastest = 0;
  let fastestAt = 0;
  for (const f of frames) {
    if (f.delta > fastest) { fastest = f.delta; fastestAt = f.t; }
  }
  assert.ok(fastestAt > SPIN.markIn && fastestAt < SPIN.markGone,
    `peak speed at t=${fastestAt.toFixed(2)}, outside the morph window`);

  const atStart = frames[0].delta;
  assert.ok(fastest > atStart * 3, 'should accelerate noticeably into the spin');
});

test('mashing the key does not restart the morph mid-flight', () => {
  const spin = createSpin();
  assert.equal(triggerSpin(spin), true);

  stepSpin(spin, FIXED_DT * 10);
  const before = spin.t;
  assert.equal(triggerSpin(spin), false, 'a retrigger mid-morph should be ignored');
  assert.equal(spin.t, before);
});

test('but a new pulse late in the spin does restart it', () => {
  const spin = createSpin();
  triggerSpin(spin);
  while (spin.t < SPIN.restartAfter + 0.02) stepSpin(spin, FIXED_DT);

  assert.equal(triggerSpin(spin), true, 'should restart once the mark has gone');
  assert.equal(spin.t, 0);
  assert.equal(spin.angle, 0);
});

test('a fresh spin after one finishes behaves identically', () => {
  const spin = createSpin();
  triggerSpin(spin);
  const first = record(spin).map((f) => Math.round(f.angle * 1e6));

  triggerSpin(spin);
  const second = record(spin).map((f) => Math.round(f.angle * 1e6));
  assert.deepEqual(second, first);
});
