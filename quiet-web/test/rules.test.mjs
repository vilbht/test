// Rules: a calm game is only calm if the clamps actually hold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun, stepRules, stepTrackers, gazeAt, takeProtection,
  clingRadiusFor, clingSlowFor, shedAfter, RULES,
} from '../core/rules.mjs';
import { FACTS, NOTICES } from '../core/facts.mjs';
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
  assert.equal(run.factAt, beacon, 'the card must know which beacon raised it');
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

// ---- the first tracker gets called out

/** Park the fox next to a live tracker and step once. */
function meetTracker(seed = 3) {
  const { run, level, body } = fixture(seed);
  const t = level.trackers.find((x) => !x.dispersed);
  assert.ok(t, 'the fixture has no trackers');
  // A realistic approach distance: inside the notice radius, well outside the
  // cling radius, which is the situation the warning exists for.
  body.x = t.x - RULES.noticeRadius * 0.7;
  body.y = t.y + body.h / 2;
  stepRules(run, level, body, NO_INPUT, FIXED_DT);
  return { run, level, body, tracker: t };
}

test('the first tracker the fox meets raises a warning', () => {
  const { run, tracker } = meetTracker();
  assert.equal(run.fact, NOTICES.tracker);
  assert.equal(run.factAt, tracker, 'the card should point at the tracker itself');
  assert.equal(run.factTone, 'warn');
  assert.equal(tracker.flagged, true, 'and the tracker should be ringed');
});

test('the warning arrives before the tracker can reach you', () => {
  // A warning that lands at the same moment as the thing it warns about is not
  // a warning. The notice radius has to clear the cling radius by a wide margin.
  assert.ok(RULES.noticeRadius > RULES.clingRadius * 4,
    `notice at ${RULES.noticeRadius} against a cling at ${RULES.clingRadius}`);
});

test('walking straight into your first tracker still warns you', () => {
  // Notice and cling can be crossed in the same step. Running the notice check
  // after the cling loop meant the player who most needed the warning — the one
  // who ran into it — was the only one who never got it.
  const { run, level, body } = fixture(3);
  const t = level.trackers.find((x) => !x.dispersed);
  body.x = t.x;
  body.y = t.y + body.h / 2;
  stepRules(run, level, body, NO_INPUT, FIXED_DT);

  assert.equal(run.fact, NOTICES.tracker, 'no warning for a head-on collision');
  assert.equal(t.clinging, true, 'and it should have clung in the same step');
});

test('and only the first — it is a warning, not a nag', () => {
  const { run, level, body } = meetTracker();
  assert.equal(run.metTracker, true);

  // let it expire, then walk into another tracker
  for (let i = 0; i < Math.ceil(RULES.factSeconds / FIXED_DT) + 2; i++) {
    stepRules(run, level, body, NO_INPUT, FIXED_DT);
  }
  assert.equal(run.fact, null, 'the card should have expired');

  const other = level.trackers.find((x) => !x.dispersed && x.flagged !== true);
  body.x = other.x;
  body.y = other.y;
  stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(run.fact, null, 'a second tracker must not raise the notice again');
});

test('an expiring card unrings the tracker it was about', () => {
  const { run, level, body, tracker } = meetTracker();
  assert.equal(tracker.flagged, true);

  for (let i = 0; i < Math.ceil(RULES.factSeconds / FIXED_DT) + 2; i++) {
    stepRules(run, level, body, NO_INPUT, FIXED_DT);
  }
  assert.equal(tracker.flagged, false, 'a ring left on after the card is a stuck highlight');
});

test('a card already on screen is not interrupted by a tracker', () => {
  // Two cards cannot share the screen, and the beacon fact is the one the
  // player deliberately went and earned. The notice waits its turn — and stays
  // owed, rather than being silently spent while it could not be shown.
  const { run, level, body } = fixture();
  const beacon = level.beacons[0];
  run.fact = beacon.fact;
  run.factAt = beacon;
  run.factTone = 'fact';
  run.factTimer = RULES.factSeconds;

  const t = level.trackers.find((x) => !x.dispersed);
  body.x = t.x;
  body.y = t.y + body.h / 2;
  stepRules(run, level, body, NO_INPUT, FIXED_DT);

  assert.equal(run.fact, beacon.fact, 'the beacon fact should still be showing');
  assert.equal(run.metTracker, false, 'and the notice should still be owed');
  assert.notEqual(t.flagged, true, 'nor should the tracker be ringed yet');
});

test('the fox reads the warning the same way it reads a fact', () => {
  const { run, body } = meetTracker();
  assert.ok(gazeAt(run, body) > 0, 'should look up at a warning too');
});

// ---- the call to action on a card actually switches something on

const ACT = { pulsePressed: false, actPressed: true };

test('every fact offers a real setting to switch on', () => {
  for (const f of FACTS) {
    assert.ok(f.protect, `"${f.title}" has nothing to switch on`);
    assert.ok(f.protect.name.length > 0);
    assert.ok(['shed', 'notice', 'burden'].includes(f.protect.effect),
      `"${f.title}" claims an effect the rules do not implement: ${f.protect.effect}`);
    assert.ok(f.protect.does.length > 0, `"${f.title}" never says what it changed`);
  }
});

test('the tracker warning offers an action instead, since it is not a setting', () => {
  assert.equal(NOTICES.tracker.protect, undefined);
  assert.equal(NOTICES.tracker.act.key, 'Shift');
});

test('pressing the key on a card takes its protection', () => {
  const { run, level, body } = litBeacon();
  assert.equal(run.protections.length, 0);

  const events = stepRules(run, level, body, ACT, FIXED_DT);
  assert.equal(events.protected, run.fact.protect);
  assert.deepEqual(run.protections, [run.fact.protect]);
});

test('and taking it twice does not stack it', () => {
  const { run, level, body } = litBeacon();
  stepRules(run, level, body, ACT, FIXED_DT);
  const again = stepRules(run, level, body, ACT, FIXED_DT);

  assert.equal(again.protected, null, 'a repeat press should report nothing happened');
  assert.equal(run.protections.length, 1);
});

test('there is nothing to take when no card is up', () => {
  const { run, level, body } = fixture();
  assert.equal(takeProtection(run), null);
  stepRules(run, level, body, ACT, FIXED_DT);
  assert.equal(run.protections.length, 0);
});

test('concealment shrinks the radius trackers can catch you from', () => {
  const run = createRun();
  const base = clingRadiusFor(run);
  assert.equal(base, RULES.clingRadius);

  const notice = FACTS.filter((f) => f.protect.effect === 'notice').map((f) => f.protect);
  let previous = base;
  for (const p of notice) {
    run.protections.push(p);
    const now = clingRadiusFor(run);
    assert.ok(now < previous, 'each concealment protection should shrink it further');
    previous = now;
  }
  // but never to nothing: a run with no antagonist left is an empty level
  assert.ok(previous >= RULES.clingRadius * RULES.noticeFloor - 1e-9);
  assert.ok(previous > 0);
});

test('burden protections cut what a clinging tracker costs, with a floor', () => {
  const run = createRun();
  assert.equal(clingSlowFor(run), RULES.clingSlow);

  for (const f of FACTS.filter((x) => x.protect.effect === 'burden')) run.protections.push(f.protect);
  const eased = clingSlowFor(run);
  assert.ok(eased < RULES.clingSlow, 'should cost less');
  assert.ok(eased >= RULES.clingSlow * RULES.burdenFloor - 1e-9, 'but never nothing');
});

test('with no shed protection a tracker never lets go on its own', () => {
  assert.equal(shedAfter(createRun()), Infinity);
});

test('shed protections make a clinging tracker let go, sooner each time', () => {
  const run = createRun();
  const shed = FACTS.filter((f) => f.protect.effect === 'shed').map((f) => f.protect);

  run.protections.push(shed[0]);
  const one = shedAfter(run);
  run.protections.push(shed[1]);
  assert.ok(shedAfter(run) < one, 'a second protection should shorten the hold');
});

test('and the tracker actually does let go, in the loop', () => {
  const { run, level, body } = fixture();
  const t = level.trackers.find((x) => !x.dispersed);
  body.x = t.x;
  body.y = t.y + body.h / 2;

  // cling first, with nothing switched on
  for (let i = 0; i < 30; i++) stepRules(run, level, body, NO_INPUT, FIXED_DT);
  assert.equal(t.clinging, true, 'the fixture never got a tracker to cling');

  // now switch on every shed protection and hold still
  for (const f of FACTS.filter((x) => x.protect.effect === 'shed')) run.protections.push(f.protect);
  const limit = Math.ceil((shedAfter(run) + 0.5) / FIXED_DT);
  let released = false;
  for (let i = 0; i < limit && !released; i++) {
    released = stepRules(run, level, body, NO_INPUT, FIXED_DT).shed > 0;
  }

  assert.ok(released, 'the tracker never let go');
  assert.equal(t.clinging, false);
  assert.equal(t.dispersed, false, 'letting go is not the same as being destroyed');
});

test('a fully protected run is calmer but not empty', () => {
  // The point being made is that these settings help, not that they make the
  // web a place with nothing in it.
  const run = createRun();
  for (const f of FACTS) run.protections.push(f.protect);

  assert.ok(clingRadiusFor(run) > 0, 'trackers can still catch you');
  assert.ok(clingSlowFor(run) > 0, 'and still cost you something when they do');
  assert.ok(Number.isFinite(shedAfter(run)));
});
