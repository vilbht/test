// Set-pieces. Crates are the flagged risk in the plan, so they get the most here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWind, windAt, createSeesaw, stepSeesaw, seesawSurfaceY, seesawRects,
  createCrate, stepCrates, pushCrates, crateRects,
} from '../core/bodies.mjs';
import { createBody, stepCharacter, FIXED_DT } from '../core/physics.mjs';

const IDLE = { move: 0, jumpHeld: false, jumpPressed: false, dropHeld: false };

test('wind acts only inside its region', () => {
  const fields = [createWind({ x: 0, y: 0, w: 100, h: 100, fx: 80, fy: -10, gust: 0 })];
  const inside = windAt(fields, 50, 50, 0);
  assert.equal(inside.x, 80);
  assert.equal(inside.y, -10);

  const outside = windAt(fields, 500, 50, 0);
  assert.equal(outside.x, 0);
  assert.equal(outside.y, 0);
});

test('wind gusts rather than blowing at a constant', () => {
  const fields = [createWind({ x: 0, y: 0, w: 100, h: 100, fx: 80, gust: 0.4 })];
  const a = windAt(fields, 50, 50, 0).x;
  const b = windAt(fields, 50, 50, 1.0).x;
  assert.notEqual(a, b);
});

test('an unloaded see-saw settles level', () => {
  const s = createSeesaw({ x: 0, y: 0 });
  s.angle = 0.3;
  for (let i = 0; i < 1200; i++) stepSeesaw(s, [], FIXED_DT);
  assert.ok(Math.abs(s.angle) < 0.01, `settled at ${s.angle}`);
});

test('weight on one end tips that end down, and the far end rises', () => {
  const s = createSeesaw({ x: 0, y: 0, len: 160 });
  for (let i = 0; i < 240; i++) stepSeesaw(s, [{ x: 70, weight: 1 }], FIXED_DT);
  assert.ok(s.angle > 0.05, `expected a tip, got ${s.angle}`);
  assert.ok(seesawSurfaceY(s, 70) > seesawSurfaceY(s, -70), 'loaded end should be lower');
});

test('a see-saw never rotates past its stops, even under absurd load', () => {
  const s = createSeesaw({ x: 0, y: 0, maxAngle: 0.4 });
  for (let i = 0; i < 600; i++) stepSeesaw(s, [{ x: 1e4, weight: 1e4 }], FIXED_DT);
  assert.ok(Math.abs(s.angle) <= 0.4 + 1e-9, `angle ${s.angle} escaped its stop`);
  assert.ok(Number.isFinite(s.omega));
});

test('a see-saw exposes itself as ordinary rects the fox can stand on', () => {
  const s = createSeesaw({ x: 200, y: 300, len: 160 });
  stepSeesaw(s, [{ x: 260, weight: 1 }], FIXED_DT);
  const rects = seesawRects(s);
  assert.ok(rects.length > 1);
  for (const r of rects) {
    assert.equal(r.oneWay, true, 'planks are jump-through');
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y));
  }
  const xs = rects.map((r) => r.x);
  assert.ok(Math.min(...xs) >= s.x - s.len / 2 - 1, 'plank rects stay within the plank');
});

test('the fox can stand on a tilted plank', () => {
  const s = createSeesaw({ x: 200, y: 300, len: 200 });
  s.angle = 0.2;
  const b = createBody({ x: 200, y: 250 });
  for (let i = 0; i < 300; i++) {
    stepCharacter(b, IDLE, [...seesawRects(s), { x: 0, y: 900, w: 800, h: 50 }], FIXED_DT);
  }
  assert.equal(b.onGround, true);
  assert.ok(Math.abs(b.y - seesawSurfaceY(s, b.x)) < 8, 'should rest on the plank surface');
});

test('a crate falls and comes to rest on the ground', () => {
  const c = createCrate({ x: 100, y: 0 });
  const ground = [{ x: 0, y: 420, w: 800, h: 900 }];
  for (let i = 0; i < 600; i++) stepCrates([c], ground, FIXED_DT);
  assert.equal(c.onGround, true);
  assert.equal(c.y + c.h, 420);
  assert.equal(c.vy, 0);
});

test('a crate slides to a stop instead of drifting forever', () => {
  const c = createCrate({ x: 100, y: 390 });
  c.vx = 300;
  const ground = [{ x: 0, y: 420, w: 2000, h: 900 }];
  for (let i = 0; i < 600; i++) stepCrates([c], ground, FIXED_DT);
  assert.equal(c.vx, 0);
});

test('crates separate instead of interpenetrating', () => {
  const a = createCrate({ x: 100, y: 390 });
  const b = createCrate({ x: 112, y: 390 });   // heavily overlapped
  const ground = [{ x: 0, y: 420, w: 800, h: 900 }];
  for (let i = 0; i < 400; i++) stepCrates([a, b], ground, FIXED_DT);
  const gap = Math.abs(a.x - b.x);
  assert.ok(gap >= a.w - 1, `crates still overlapping by ${(a.w - gap).toFixed(2)}px`);
  for (const c of [a, b]) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
});

test('a resting pile of crates does not jitter itself apart', () => {
  // Stacking is explicitly out of scope, but it must degrade quietly rather
  // than explode if a player ever contrives one.
  const ground = [{ x: 0, y: 420, w: 800, h: 900 }];
  const pile = [
    createCrate({ x: 200, y: 390 }),
    createCrate({ x: 200, y: 360 }),
    createCrate({ x: 200, y: 330 }),
  ];
  for (let i = 0; i < 900; i++) stepCrates(pile, ground, FIXED_DT);
  for (const c of pile) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'crate went non-finite');
    assert.ok(Math.abs(c.vx) < 60, `crate skidding at ${c.vx.toFixed(1)}px/s`);
    assert.ok(c.y + c.h <= 421, 'crate sank through the floor');
  }
});

test('the fox pushes a crate along rather than stopping dead', () => {
  const ground = [{ x: 0, y: 420, w: 1200, h: 900 }];
  const crate = createCrate({ x: 200, y: 390 });
  const b = createBody({ x: 120, y: 420 });
  for (let i = 0; i < 600; i++) {
    stepCharacter(b, { ...IDLE, move: 1 }, [...ground, ...crateRects([crate])], FIXED_DT);
    pushCrates(b, [crate], 1, FIXED_DT);
    stepCrates([crate], ground, FIXED_DT);
  }
  assert.ok(crate.x > 240, `crate barely moved, at ${crate.x.toFixed(1)}`);
  assert.ok(b.x < crate.x, 'fox should stay behind the crate it is pushing');
  assert.ok(b.x + b.w / 2 > crate.x - 4, 'fox should stay in contact, not lag behind');
});

test('a pushed crate stops at a wall instead of being shoved through it', () => {
  // Why pushing sets crate velocity rather than moving it directly: the crate
  // solver is what respects the world, and it must stay in charge.
  const ground = [
    { x: 0, y: 420, w: 1200, h: 900 },
    { x: 400, y: 300, w: 40, h: 120 },     // a pillar in the way
  ];
  const crate = createCrate({ x: 300, y: 390 });
  const b = createBody({ x: 240, y: 420 });
  for (let i = 0; i < 900; i++) {
    stepCharacter(b, { ...IDLE, move: 1 }, [...ground, ...crateRects([crate])], FIXED_DT);
    pushCrates(b, [crate], 1, FIXED_DT);
    stepCrates([crate], ground, FIXED_DT);
  }
  assert.ok(crate.x + crate.w <= 401, `crate pushed into the pillar, at ${crate.x.toFixed(1)}`);
});

test('walking along the top of a crate does not drag it along', () => {
  // A wide crate, so the fox is still on the lid at the end of the run: the
  // point is that contact from above never counts as a push.
  const ground = [{ x: 0, y: 420, w: 1200, h: 900 }];
  const crate = createCrate({ x: 300, y: 220, size: 200 });
  const b = createBody({ x: 310, y: 220 });
  for (let i = 0; i < 90; i++) {
    stepCharacter(b, { ...IDLE, move: 1 }, [...ground, ...crateRects([crate])], FIXED_DT);
    pushCrates(b, [crate], 1, FIXED_DT);
    stepCrates([crate], ground, FIXED_DT);
  }
  assert.equal(b.onGround, true);
  assert.equal(b.y, 220, 'should still be standing on the crate lid');
  assert.ok(Math.abs(crate.x - 300) < 1, `lid contact shoved the crate to ${crate.x.toFixed(2)}`);
});
