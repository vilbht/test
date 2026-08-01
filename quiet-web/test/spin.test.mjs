// The shield-pulse flourish. Only the arithmetic is testable, but the failures
// worth catching are all arithmetic: a fox left permanently tilted, a spin that
// never ends, or the fox and the mark both visible at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import {
  SPIN, createSpin, triggerSpin, stepSpin, markMix, foxMix, spinDelta, isHolding,
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
      holding: isHolding(spin),
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

test('the fox and the mark are both left upright', () => {
  // The whole reason the turn counts are integers. The mark is drawn rotated by
  // the first, and the fox by the sum: a fractional count would leave the logo
  // tilted while it is being read, and the fox tilted for good afterwards.
  assert.equal(Number.isInteger(SPIN.turnsIn), true);
  assert.equal(Number.isInteger(SPIN.turnsOut), true);

  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin);

  const held = frames.filter((f) => f.holding);
  assert.ok(held.length > 0, 'never held');
  for (const f of held) {
    const turns = f.angle / TAU;
    assert.ok(Math.abs(turns - Math.round(turns)) < 1e-9,
      `mark held at ${turns.toFixed(4)} turns — not upright`);
  }

  assert.equal(spin.angle, 0, 'the fox should end exactly where it started');
});

test('the mark is held completely still, and solid, while it is readable', () => {
  // The point of the whole effect. A mark that is still turning is a smear, and
  // a smear cannot be recognised however long it is left on screen.
  const spin = createSpin();
  triggerSpin(spin);
  const held = record(spin).filter((f) => f.holding);

  assert.ok(held.length > 20, `only ${held.length} steps of hold`);
  for (const f of held) {
    // Not exactly zero: the one frame that crosses into the hold still carries
    // the last sliver of the ease. At the size the mark is drawn, 1e-4 rad moves
    // its edge by six thousandths of a pixel — "still" in any sense that matters.
    assert.ok(f.delta < 1e-4,
      `rotation must be stopped during the hold, saw ${f.delta.toExponential(2)}`);
    assert.equal(f.mark, 1, 'the mark must be fully opaque throughout the hold');
    assert.equal(f.fox, 0, 'and the fox fully hidden');
  }
});

test('the hold lasts long enough to actually read the mark', () => {
  const seconds = (SPIN.holdEnd - SPIN.holdStart) * SPIN.duration;
  assert.ok(seconds > 0.35, `only ${seconds.toFixed(2)}s of still mark`);
});

test('rotation only ever goes forwards, and covers every turn', () => {
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
  const total = (SPIN.turnsIn + SPIN.turnsOut) * TAU;
  assert.ok(peak > total * 0.97, `only reached ${(peak / TAU).toFixed(2)} turns`);
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
  const lastClear = frames.map((f) => f.mark).lastIndexOf(0);
  assert.equal(frames[lastClear].fox, 1, 'the fox should be whole once the mark clears');
});

test('it winds up gently rather than snapping into a spin', () => {
  // "Slow at the beginning" is a real requirement, not a nicety: the fox has to
  // read as gathering itself, or the mark looks like it was cut to.
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin).filter((f) => f.active);

  const early = frames.slice(0, 8).reduce((m, f) => Math.max(m, f.delta), 0);
  const fastest = frames.reduce((m, f) => Math.max(m, f.delta), 0);
  assert.ok(fastest > early * 8,
    `wind-up too abrupt: opens at ${early.toFixed(4)} against a peak of ${fastest.toFixed(4)}`);
});

test('the spin brakes to a stop before the hold, and rebuilds after it', () => {
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin).filter((f) => f.active);

  const before = frames.filter((f) => f.t < SPIN.holdStart);
  const after = frames.filter((f) => f.t > SPIN.holdEnd);
  const last = before[before.length - 1];
  const first = after[0];

  assert.ok(last.delta < 0.02, `still turning at ${last.delta.toFixed(3)} entering the hold`);
  assert.ok(first.delta < 0.02, `snapped back to ${first.delta.toFixed(3)} leaving the hold`);
  assert.ok(after.some((f) => f.delta > 0.15), 'should build back up to real speed');
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
