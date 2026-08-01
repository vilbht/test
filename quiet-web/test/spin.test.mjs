// The shield-pulse flourish. Only the arithmetic is testable, but the failures
// worth catching are all arithmetic: a fox left permanently tilted, a spin that
// never ends, a mark too smeared to recognise — or a rotation that stops dead
// in the middle, which is what the plateau this replaced actually looked like.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_DT } from '../core/physics.mjs';
import {
  SPIN, createSpin, triggerSpin, stepSpin, markMix, foxMix, spinDelta, isReading,
} from '../core/spin.mjs';

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

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
      reading: isReading(spin),
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

test('the fox is left exactly upright', () => {
  // The whole reason the *total* is a whole number. The three contributions to
  // the rotation are each free to be fractional; their sum is not, or the fox
  // spends the rest of the run tilted.
  assert.equal(Number.isInteger(SPIN.totalTurns), true);
  assert.ok(Math.abs(SPIN.turnsIn + SPIN.driftTurns + SPIN.turnsOut - SPIN.totalTurns) < 1e-12);

  const spin = createSpin();
  triggerSpin(spin);
  record(spin);
  assert.equal(spin.angle, 0, 'the fox should end exactly where it started');
});

test('the rotation never stops while the spin is running', () => {
  // The requirement that replaced the hold. A plateau reads as a dropped frame;
  // the mark has to stay in motion the whole way through.
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin).filter((f) => f.active);

  for (const f of frames) {
    assert.ok(f.delta > 1e-5,
      `rotation stalled at t=${f.t.toFixed(3)} (${(f.delta * DEG).toFixed(4)}°/step)`);
  }
});

test('the mark drifts slowly and evenly while it is solid', () => {
  // Legibility comes from being slow, not from being still. Fast enough and the
  // mark is a smear; too fast and the renderer starts stacking motion-blur
  // ghosts on it, which is the same problem by another route.
  const spin = createSpin();
  triggerSpin(spin);
  const read = record(spin).filter((f) => f.reading);

  assert.ok(read.length * FIXED_DT > 0.35,
    `only ${(read.length * FIXED_DT).toFixed(2)}s of solid mark`);

  const rates = read.map((f) => f.delta * DEG);
  const slowest = Math.min(...rates);
  const fastest = Math.max(...rates);
  assert.ok(slowest > 0.2, `mark barely moving at ${slowest.toFixed(3)}°/step`);
  assert.ok(fastest < 3, `mark smearing at ${fastest.toFixed(2)}°/step`);
  assert.ok(fastest - slowest < 0.05,
    `drift should be even, saw ${slowest.toFixed(3)}..${fastest.toFixed(3)}°/step`);

  for (const f of read) {
    assert.equal(f.mark, 1, 'the mark must be fully opaque throughout the read');
    assert.equal(f.fox, 0, 'and the fox fully hidden');
  }
});

test('the mark turns through upright, roughly centred on the read', () => {
  // The in-ramp lands short of a whole turn on purpose so the drift carries the
  // mark up through vertical mid-read. Get the compensation wrong and the logo
  // is presented at its most visible while lying on its side.
  const spin = createSpin();
  triggerSpin(spin);
  const read = record(spin).filter((f) => f.reading);

  const off = read.map((f) => {
    const turns = f.angle / TAU;
    return Math.abs(turns - Math.round(turns)) * 360;
  });
  assert.ok(Math.min(...off) < 1,
    `never passes upright — closest is ${Math.min(...off).toFixed(1)}°`);
  assert.ok(Math.max(...off) < 45,
    `tilts too far to read: ${Math.max(...off).toFixed(1)}°`);

  // and it should pass upright near the middle, not scrape past at one end
  const at = off.indexOf(Math.min(...off)) / (read.length - 1);
  assert.ok(Math.abs(at - 0.5) < 0.12, `passes upright ${(at * 100).toFixed(0)}% through`);
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
  const total = SPIN.totalTurns * TAU;
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

test('both whips are fast enough to actually blur', () => {
  // The blur is drawn from the arc swept per frame, so a whip that is merely
  // brisk produces no ghosts at all and the transition reads as a jump cut.
  const spin = createSpin();
  triggerSpin(spin);
  const frames = record(spin).filter((f) => f.active);

  const into = frames.filter((f) => f.t < SPIN.rampInEnd);
  const out = frames.filter((f) => f.t > SPIN.rampOutStart);
  // 0.055 rad/step is where main.js starts stacking ghosts
  assert.ok(Math.max(...into.map((f) => f.delta)) > 0.055 * 4, 'the first whip is too slow');
  assert.ok(Math.max(...out.map((f) => f.delta)) > 0.055 * 4, 'the second whip is too slow');
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
