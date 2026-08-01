// Verlet chain: the tail is the most visible thing on screen, so instability
// here is instantly obvious. These are the prototype's stress cases, promoted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChain, stepChain, restLength, maxPointSpeed, createVine, tipVelocity,
} from '../core/verlet.mjs';
import { FIXED_DT } from '../core/physics.mjs';

const SPEED_CEILING = 4000;   // px/s; the prototype peaked at ~1520

function assertSane(chain, label) {
  for (const p of chain.points) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${label}: NaN in chain`);
  }
  const s = maxPointSpeed(chain, FIXED_DT);
  assert.ok(s < SPEED_CEILING, `${label}: point speed ${s.toFixed(0)}px/s`);
}

test('hangs still when its anchor does not move', () => {
  const c = createChain({ x: 0, y: 0 });
  for (let i = 0; i < 1200; i++) stepChain(c, FIXED_DT, { anchorX: 0, anchorY: 0 });
  assertSane(c, 'idle');
  assert.ok(maxPointSpeed(c, FIXED_DT) < 8, 'a settled chain should be near-motionless');
});

test('stays stable while being whipped at 8Hz', () => {
  const c = createChain({ x: 0, y: 0 });
  for (let i = 0; i < 2400; i++) {
    const t = i * FIXED_DT;
    stepChain(c, FIXED_DT, { anchorX: Math.sin(t * 8 * Math.PI * 2) * 40, anchorY: 0 });
    assertSane(c, 'whip');
  }
});

test('survives rest length being flipped 30 times a second', () => {
  // Pathological: nothing in the game does this, but if it survives this it
  // survives a player mashing sprint.
  const c = createChain({ x: 0, y: 0 });
  for (let i = 0; i < 2400; i++) {
    c.spreadTarget = Math.floor(i / 4) % 2 === 0 ? 1 : 2.4;
    stepChain(c, FIXED_DT, { anchorX: 0, anchorY: 0 });
    assertSane(c, 'spread flip');
  }
});

test('spread is eased, never snapped — a snap makes the chain bunch visibly', () => {
  const c = createChain({ x: 0, y: 0 });
  c.spreadTarget = 3;
  stepChain(c, FIXED_DT, { anchorX: 0, anchorY: 0 });
  assert.ok(c.spread > 1 && c.spread < 1.2, `eased to ${c.spread}, expected a small step`);

  for (let i = 0; i < 600; i++) stepChain(c, FIXED_DT, { anchorX: 0, anchorY: 0 });
  assert.ok(Math.abs(c.spread - 3) < 0.01, 'should converge on the target');
});

test('tapers toward the tip so the tail reads as a flame, not a rope', () => {
  const c = createChain({ x: 0, y: 0, count: 10 });
  assert.ok(restLength(c, 9) < restLength(c, 0) * 0.7, 'tip links should be much shorter');
});

test('wind displaces the chain downwind', () => {
  const still = createChain({ x: 0, y: 0 });
  const blown = createChain({ x: 0, y: 0 });
  for (let i = 0; i < 600; i++) {
    stepChain(still, FIXED_DT, { anchorX: 0, anchorY: 0 });
    stepChain(blown, FIXED_DT, { anchorX: 0, anchorY: 0, wind: { x: 900, y: 0 } });
  }
  const tipOf = (c) => c.points[c.points.length - 1].x;
  assert.ok(tipOf(blown) > tipOf(still) + 2, 'wind should visibly push the tail');
  assertSane(blown, 'wind');
});

test('a vine swings and its tip carries momentum out of a release', () => {
  const v = createVine({ x: 0, y: 0, count: 12, segment: 9 });
  for (let i = 0; i < 240; i++) stepChain(v.chain, FIXED_DT, { anchorX: 0, anchorY: 0 });
  const rest = tipVelocity(v.chain, FIXED_DT);
  assert.ok(Math.hypot(rest.vx, rest.vy) < 12, 'should settle before being pumped');

  for (let i = 0; i < 200; i++) {
    if (i % 20 === 0) v.chain.points[v.chain.points.length - 1].px -= 1.4;
    stepChain(v.chain, FIXED_DT, { anchorX: 0, anchorY: 0 });
  }
  assertSane(v.chain, 'vine');
  const swung = tipVelocity(v.chain, FIXED_DT);
  assert.ok(Math.hypot(swung.vx, swung.vy) > 20, 'a pumped vine should be moving');
});
