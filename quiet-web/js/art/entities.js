// entities.js — everything in the world that is not scenery and not the fox.
//
// Shared visual grammar with the mascot: filled shapes, no outlines, gradients
// doing the shading. Purple is reserved for things that are on your side
// (sparkles, beacon light, the shield) and muted plum-greys for the trackers,
// so allegiance is readable before anything is explained.

import { paletteFor } from './scenery.js';

const VIOLET = '#8B3DFF';
const VIOLET_LIT = '#9059FF';
const GOLD = '#FFC93C';

// ---------------------------------------------------------------- sparkles

/** The four-pointed star from the references — concave sides, not a diamond. */
export function drawSparkle(ctx, x, y, r, t, phase) {
  const pulse = 0.85 + Math.sin(t * 2.4 + phase) * 0.15;
  const rr = r * pulse;

  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.2 + phase) * 3);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 2.6);
  glow.addColorStop(0, 'rgba(144, 89, 255, 0.42)');
  glow.addColorStop(1, 'rgba(144, 89, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-rr * 2.6, -rr * 2.6, rr * 5.2, rr * 5.2);

  ctx.fillStyle = VIOLET_LIT;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const nx = Math.cos(a) * rr;
    const ny = Math.sin(a) * rr;
    const cx = Math.cos(a + Math.PI / 4) * rr * 0.22;
    const cy = Math.sin(a + Math.PI / 4) * rr * 0.22;
    if (i === 0) ctx.moveTo(nx, ny);
    const na = a + Math.PI / 2;
    ctx.quadraticCurveTo(cx, cy, Math.cos(na) * rr, Math.sin(na) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- beacons

/**
 * A privacy beacon: a slim post with a lantern head. Unlit it is inert stone;
 * charging fills a ring; lit it burns gold and throws light on the ground, which
 * is the only permanent change the player makes to the world.
 */
export function drawBeacon(ctx, b, t) {
  const headY = b.y - 54;
  const glow = b.lit ? 1 : b.charge;

  if (glow > 0.02) {
    const pool = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 90 * glow);
    pool.addColorStop(0, `rgba(255, 201, 60, ${0.20 * glow})`);
    pool.addColorStop(1, 'rgba(255, 201, 60, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(b.x - 90, b.y - 90, 180, 180);
  }

  const post = ctx.createLinearGradient(b.x - 5, 0, b.x + 5, 0);
  post.addColorStop(0, '#2A1A44');
  post.addColorStop(0.5, '#3D2A5C');
  post.addColorStop(1, '#241539');
  ctx.fillStyle = post;
  ctx.beginPath();
  ctx.roundRect(b.x - 4.5, headY + 6, 9, 48, 3);
  ctx.fill();

  ctx.fillStyle = '#2A1A44';
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // lantern head
  const head = ctx.createLinearGradient(0, headY - 11, 0, headY + 9);
  head.addColorStop(0, b.lit ? '#FFE08A' : '#4A3468');
  head.addColorStop(1, b.lit ? '#F5793B' : '#2E1F4A');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(b.x, headY - 12);
  ctx.lineTo(b.x + 9, headY - 1);
  ctx.lineTo(b.x, headY + 10);
  ctx.lineTo(b.x - 9, headY - 1);
  ctx.closePath();
  ctx.fill();

  if (b.lit) {
    const flicker = 0.78 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.7) * 0.06;
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(b.x, headY - 1, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (b.charge > 0) {
    ctx.strokeStyle = VIOLET_LIT;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(b.x, headY - 1, 18, -Math.PI / 2, -Math.PI / 2 + b.charge * Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- trackers

/**
 * A tracker: a watching eye. Muted and slow while patrolling, flushed pink and
 * jittery once it has latched on, so the thing slowing you down is obvious
 * without a HUD warning.
 */
export function drawTracker(ctx, k, t) {
  const jitter = k.clinging ? Math.sin(t * 22 + k.phase) * 1.2 : 0;
  const x = k.x + jitter;
  const y = k.y;
  const r = 9.5;

  ctx.save();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * (k.clinging ? 1.6 : 0.5) + k.phase;
    ctx.strokeStyle = k.clinging ? 'rgba(255,92,138,0.55)' : 'rgba(120,96,160,0.45)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
    ctx.stroke();
  }

  const body = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, r);
  body.addColorStop(0, k.clinging ? '#FF7FA5' : '#5C4880');
  body.addColorStop(1, k.clinging ? '#C8265C' : '#332450');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // pupil, tracking the fox's side of the screen
  ctx.fillStyle = '#170B2E';
  ctx.beginPath();
  ctx.ellipse(x + (k.clinging ? 0 : 1.2), y, 4.4, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.arc(x - 2.6, y - 3.4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Cookie crumbs: ground clutter, harmless but in the way. */
export function drawCrumb(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y - 5);
  ctx.fillStyle = '#8A5A34';
  ctx.beginPath();
  ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5E3A20';
  ctx.beginPath();
  ctx.arc(-1.6, -1.2, 1.2, 0, Math.PI * 2);
  ctx.arc(2, 0.8, 1, 0, Math.PI * 2);
  ctx.arc(0.4, 2.2, 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- set-pieces

export function drawCrate(ctx, c) {
  const g = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
  g.addColorStop(0, '#A8763F');
  g.addColorStop(1, '#7A5230');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, c.w, c.h, 3);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 220, 160, 0.30)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x + 3, c.y + 3);
  ctx.lineTo(c.x + c.w - 3, c.y + c.h - 3);
  ctx.moveTo(c.x + c.w - 3, c.y + 3);
  ctx.lineTo(c.x + 3, c.y + c.h - 3);
  ctx.stroke();

  // a violet band, echoing the paint pot in the reference art
  ctx.fillStyle = 'rgba(139, 61, 255, 0.55)';
  ctx.fillRect(c.x, c.y + c.h * 0.42, c.w, 4);
}

export function drawSeesaw(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);

  ctx.fillStyle = '#2E1F4A';
  ctx.beginPath();
  ctx.moveTo(-9, 62);
  ctx.lineTo(9, 62);
  ctx.lineTo(4, 0);
  ctx.lineTo(-4, 0);
  ctx.closePath();
  ctx.fill();

  ctx.rotate(s.angle);
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, '#B8874A');
  g.addColorStop(1, '#7E5730');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-s.len / 2, -5, s.len, 10, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 220, 160, 0.22)';
  ctx.fillRect(-s.len / 2 + 4, -4, s.len - 8, 1.5);
  ctx.restore();
}

export function drawVine(ctx, v, t) {
  const p = v.chain.points;
  ctx.save();
  ctx.strokeStyle = v.held ? '#8FCBA8' : '#4E7A6B';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.stroke();

  // leaves, alternating sides down the length
  ctx.fillStyle = v.held ? '#6FA88F' : '#3E6455';
  for (let i = 2; i < p.length - 1; i += 2) {
    const a = p[i];
    const b = p[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (i % 4 === 0 ? 1.1 : -1.1);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(6, 0, 6.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tip = p[p.length - 1];
  const pulse = 0.7 + Math.sin(t * 2 + v.x) * 0.3;
  ctx.fillStyle = VIOLET;
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- ambience

/**
 * Wind made visible: short streaks riding the field, plus leaves that main.js
 * advects through it. Drawing the field itself as a translucent box (the
 * grey-box placeholder) read as a rectangle of fog sitting in mid-air.
 */
export function drawWindStreaks(ctx, field, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 232, 200, 0.16)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const seed = (i * 97) % 31 / 31;
    const y = field.y + seed * field.h;
    const speed = 60 + seed * 90;
    const x = field.x + ((t * speed + seed * field.w) % field.w);
    const len = 16 + seed * 26;
    ctx.lineWidth = 1 + seed;
    ctx.globalAlpha = 0.10 + 0.14 * Math.sin(t * 1.3 + i);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y - len * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawLeaf(ctx, leaf, zoneKey) {
  const p = paletteFor(zoneKey);
  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.spin);
  ctx.globalAlpha = leaf.alpha;
  ctx.fillStyle = leaf.gold ? p.accent : p.edgeLit;
  ctx.beginPath();
  ctx.ellipse(0, 0, leaf.r, leaf.r * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ring left behind by a shield pulse, drawn in world space where it fired. */
export function drawPulseRing(ctx, x, y, t, radius) {
  ctx.save();
  ctx.globalAlpha = t * 0.7;
  const g = ctx.createRadialGradient(x, y, radius * (1 - t) * 0.7, x, y, radius * (1 - t) + 20);
  g.addColorStop(0, 'rgba(144, 89, 255, 0)');
  g.addColorStop(0.8, 'rgba(144, 89, 255, 0.30)');
  g.addColorStop(1, 'rgba(144, 89, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius * (1 - t) + 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
