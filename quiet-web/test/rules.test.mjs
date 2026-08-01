// Rules: a calm game is only calm if the clamps actually hold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRules, stepTrackers, gazeAt, RULES } from '../core/rules.mjs';
import { generateLevel, groundYAt } from '../core/level.mjs';
import { createBody, FIXED_DT } from '../core/physics.mjs';

const NO_INPUT = { pulsePressed: false };

function fixture(seed = 3) {
  const level = generateLevel(seed);
  const body = createBody({ x: level.start.x, y: level.start.y });
  return { level, body, run: createRun() };
}

test('focus regenerates but never exceeds one', () => {
  const { level, body, run } = fixture();
  run.focus = 0;
  for (let i = 0; i < 2000; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(run.focus, 1);
});

test('a pulse costs focus and is rate limited', () => {
  const { level, body, run } = fixture();
  const first = stepRules(run, level, body, { pulsePressed: true }, FIXED_DT);
  assert.equal(first.pulsed, true);
  assert.ok(Math.abs(run.focus - (1 - RULES.pulseCost)) < 1e-6);

  const second = stepRules(run, level, body, { pulsePressed: true }, FIXED_DT);
  assert.equal(second.pulsed, false, 'cooldown should block a second pulse');
});

test('a pulse cannot be fired without the focus to pay for it', () => {
  const { level, body, run } = fixture();
  run.focus = 0;
  const e = stepRules(run, level, body, { pulsePressed: true }, FIXED_DT);
  assert.equal(e.pulsed, false);
  assert.ok(run.focus >= 0, 'focus must never go negative');
});

test('a pulse disperses nearby trackers and leaves distant ones alone', () => {
  const { level, body, run } = fixture();
  const near = { x: body.x + 20, y: body.y - 20, clinging: true, dispersed: false, vx: 0, origin: body.x, range: 10, home: body.y - 20, phase: 0 };
  const far = { x: body.x + 900, y: body.y - 20, clinging: false, dispersed: false, vx: 0, origin: body.x + 900, range: 10, home: body.y - 20, phase: 0 };
  level.trackers = [near, far];

  const e = stepRules(run, level, body, { pulsePressed: true }, FIXED_DT);
  assert.equal(e.dispersed, 1);
  assert.equal(near.dispersed, true);
  assert.equal(near.clinging, false);
  assert.equal(far.dispersed, false);
});

test('clinging trackers slow the fox but never stall it', () => {
  const { level, body, run } = fixture();
  level.trackers = Array.from({ length: 40 }, () => ({
    x: body.x, y: body.y - body.h / 2, clinging: true, dispersed: false,
    vx: 0, origin: body.x, range: 10, home: body.y, phase: 0,
  }));
  stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.ok(run.speedScale < 1, 'cling should slow the fox');
  assert.equal(run.speedScale, RULES.minSpeedScale, 'and clamp at the floor');
});

test('falling off the world lifts the fox back onto ground, losing nothing', () => {
  const { level, body, run } = fixture();
  run.sparkles = 5;
  body.x = 600;
  body.y = RULES.fallLimit + 200;
  body.vy = 900;

  const e = stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(e.respawned, true);
  assert.equal(body.vy, 0);
  assert.equal(run.sparkles, 5, 'a no-fail game must not take collectibles back');
  assert.notEqual(groundYAt(level, body.x), null, 'lifted onto real ground');
  assert.equal(body.y, groundYAt(level, body.x));
});

test('a beacon lights only after standing near it, then shows its fact once', () => {
  const { level, body, run } = fixture();
  const beacon = level.beacons[0];
  body.x = beacon.x;
  body.y = beacon.y;

  let lit = null;
  for (let i = 0; i < 400; i++) {
    const e = stepRules(run, level, body, NO_INPUT, FIXED_DT);
    if (e.litBeacon) lit = e.litBeacon;
  }
  assert.equal(lit, beacon);
  assert.equal(run.lit, 1);
  assert.equal(run.fact, beacon.fact);

  // walking away and back must not re-light or double-count it
  for (let i = 0; i < 400; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(run.lit, 1);
});

test('beacon charge decays when you leave before it finishes', () => {
  const { level, body, run } = fixture();
  const beacon = level.beacons[0];
  body.x = beacon.x;
  body.y = beacon.y;
  for (let i = 0; i < 40; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  const partial = beacon.charge;
  assert.ok(partial > 0 && partial < 1);

  body.x = beacon.x + 800;
  for (let i = 0; i < 40; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.ok(beacon.charge < partial, 'charge should ebb away');
  assert.ok(beacon.charge >= 0);
});

test('sparkles are collected once and counted once', () => {
  const { level, body, run } = fixture();
  const s = level.sparkles[0];
  body.x = s.x;
  body.y = s.y + body.h / 2;
  stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(run.sparkles, 1);
  stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(run.sparkles, 1, 'already-collected sparkles must not re-trigger');
});

test('trackers patrol within range and crumbs stay on the ground', () => {
  const { level, body } = fixture();
  const patrolling = level.trackers.filter((t) => !t.clinging).slice(0, 20);
  for (let i = 0; i < 1200; i++) stepTrackers(level, body, FIXED_DT, i * FIXED_DT);
  for (const t of patrolling) {
    assert.ok(Math.abs(t.x - t.origin) <= t.range + 4, 'tracker wandered off its patrol');
  }
  for (const c of level.crumbs.slice(0, 20)) {
    assert.ok(c.x >= c.min - 4 && c.x <= c.max + 4, 'crumb left its slab');
  }
});

// ---- looking up at a fact card

/** Stand on a beacon until it lights, then hand back the run and the fox. */
function litBeacon(seed = 3) {
  const { run, level, body } = fixture(seed);
  const b = level.beacons[0];
  body.x = b.x;
  body.y = b.y;
  for (let i = 0; i < 1200 && !b.lit; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(b.lit, true, 'the fixture never lit its beacon');
  return { run, level, body, beacon: b };
}

test('the fox looks up the moment a fact card appears', () => {
  const { run, body, beacon } = litBeacon();
  assert.equal(run.factBeacon, beacon, 'the card must know which beacon raised it');
  assert.equal(gazeAt(run, body), 1);
});

test('but the look-up is a beat, not a nine-second stare', () => {
  // The card outlasts the gaze on purpose: a fox with its head craned upward
  // through a run, a jump and a landing reads as broken, not as interested.
  const { run, level, body } = litBeacon();

  const held = [];
  for (let i = 0; i < Math.ceil(RULES.factSeconds / FIXED_DT); i++) {
    held.push(gazeAt(run, body));
    stepRules(run, level, body, NO_INPUT, FIXED_DT);
  }

  const looking = held.filter((g) => g > 0).length * FIXED_DT;
  assert.ok(Math.abs(looking - RULES.gazeSeconds) < 0.05,
    `looked up for ${looking.toFixed(2)}s, expected ${RULES.gazeSeconds}s`);
  assert.ok(RULES.factSeconds > RULES.gazeSeconds * 2,
    'the card should stay up well past the glance');
  assert.equal(held[held.length - 1], 0, 'still staring when the card expired');
});

test('and it drops off as the fox runs away from the beacon', () => {
  const { run, body, beacon } = litBeacon();

  assert.equal(gazeAt(run, body), 1, 'should be full while stood at the beacon');

  body.x = beacon.x + RULES.gazeRadius * 0.8;
  const partial = gazeAt(run, body);
  assert.ok(partial > 0 && partial < 1, `expected a partial gaze, got ${partial}`);

  body.x = beacon.x + RULES.gazeRadius + 40;
  assert.equal(gazeAt(run, body), 0, 'should have let go once out of range');
});

test('no card, no gaze', () => {
  const { run, body } = fixture();
  assert.equal(run.fact, null);
  assert.equal(gazeAt(run, body), 0);
});
