// entities.js — everything on the mountain that is not scenery and not the fox.
//
// Same grammar as the scenery: flat fills, no outlines, value doing the work.
// The one deliberate exception is light. Coins, campfires and the flip burst are
// the only things allowed to glow, so anything glowing is something the player
// can gain from — which is a rule the eye learns in about four seconds and never
// has to be told.

import { angleAt, surfaceY } from '../../core/terrain.mjs';

const VIOLET = '#9059FF';
const GOLD = '#FFC93C';
const EMBER = '#F5793B';

// ---------------------------------------------------------------- coins

/** The four-pointed sparkle from the mascot art — concave sides, not a diamond. */
export function drawCoin(ctx, c, t) {
  const bob = Math.sin(t * 2.4 + c.phase) * 3;
  const r = 8 * (0.88 + Math.sin(t * 3 + c.phase) * 0.12);

  ctx.save();
  ctx.translate(c.x, c.y + bob);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8);
  glow.addColorStop(0, 'rgba(144,89,255,0.42)');
  glow.addColorStop(1, 'rgba(144,89,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-r * 2.8, -r * 2.8, r * 5.6, r * 5.6);

  ctx.fillStyle = VIOLET;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const na = a + Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(
      Math.cos(a + Math.PI / 4) * r * 0.22,
      Math.sin(a + Math.PI / 4) * r * 0.22,
      Math.cos(na) * r,
      Math.sin(na) * r,
    );
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- campfires

/**
 * A campfire carrying one privacy fact. Unlit it is a dark cairn of logs; lit it
 * throws real light onto the snow, which is the only lasting mark the player
 * leaves on the mountain.
 */
export function drawCampfire(ctx, b, pal, t) {
  const y = b.y;

  if (b.lit) {
    const pool = ctx.createRadialGradient(b.x, y, 0, b.x, y, 130);
    pool.addColorStop(0, 'rgba(255,180,90,0.30)');
    pool.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(b.x - 130, y - 130, 260, 260);
  }

  // logs, leaning together
  ctx.save();
  ctx.strokeStyle = b.lit ? '#4A2E22' : pal.near;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  for (const lean of [-1, 1, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(b.x - lean * 11, y);
    ctx.lineTo(b.x + lean * 6, y - 15);
    ctx.stroke();
  }
  ctx.restore();

  if (!b.lit) return;

  // flame: two overlapping teardrops, flickering out of phase
  ctx.save();
  ctx.translate(b.x, y - 12);
  for (const [scale, colour, speed] of [[1, EMBER, 5.1], [0.58, GOLD, 7.3]]) {
    const flick = 1 + Math.sin(t * speed) * 0.14;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, -20 * scale * flick);
    ctx.quadraticCurveTo(9 * scale, -7 * scale, 6 * scale, 2 * scale);
    ctx.quadraticCurveTo(0, 7 * scale, -6 * scale, 2 * scale);
    ctx.quadraticCurveTo(-9 * scale, -7 * scale, 0, -20 * scale * flick);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- obstacles

/** A rock in the snow: a dark lump, half buried, with a lit rim on top. */
export function drawRock(ctx, terrain, rock, pal) {
  const a = angleAt(terrain, rock.x);
  ctx.save();
  ctx.translate(rock.x, rock.y);
  ctx.rotate(a);

  ctx.fillStyle = pal.near;
  ctx.beginPath();
  ctx.moveTo(-rock.r, 2);
  ctx.quadraticCurveTo(-rock.r * 0.8, -rock.r * 1.1, 0, -rock.r);
  ctx.quadraticCurveTo(rock.r * 0.9, -rock.r * 0.95, rock.r, 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.shade;
  ctx.beginPath();
  ctx.ellipse(-rock.r * 0.2, -rock.r * 0.72, rock.r * 0.42, rock.r * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Drifting trackers. Muted while patrolling, flushed and jittery once latched. */
export function drawTracker(ctx, k, pal, t) {
  const jitter = k.clinging ? Math.sin(t * 20 + k.phase) * 1.3 : 0;
  const x = k.x + jitter;
  const r = 8.5;

  ctx.save();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * (k.clinging ? 1.7 : 0.4) + k.phase;
    ctx.strokeStyle = k.clinging ? 'rgba(255,92,138,0.5)' : 'rgba(140,150,190,0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, k.y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * (r + 5), k.y + Math.sin(a) * (r + 5));
    ctx.stroke();
  }

  const body = ctx.createRadialGradient(x - 2, k.y - 3, 1, x, k.y, r);
  body.addColorStop(0, k.clinging ? '#FF7FA5' : pal.shade);
  body.addColorStop(1, k.clinging ? '#C8265C' : pal.near);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, k.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(20,12,40,0.85)';
  ctx.beginPath();
  ctx.ellipse(x, k.y, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- rails

/** A bunting line strung between two poles — the thing you grind. */
export function drawRail(ctx, terrain, rail, pal, t, active) {
  const dx = rail.x1 - rail.x0;
  const dy = rail.y1 - rail.y0;

  // poles, planted on the real surface
  ctx.save();
  ctx.strokeStyle = pal.near;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  for (const [px, py] of [[rail.x0, rail.y0], [rail.x1, rail.y1]]) {
    ctx.beginPath();
    ctx.moveTo(px, surfaceY(terrain, px) + 2);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  ctx.strokeStyle = active ? GOLD : pal.near;
  ctx.lineWidth = active ? 3 : 2.2;
  ctx.beginPath();
  ctx.moveTo(rail.x0, rail.y0);
  ctx.lineTo(rail.x1, rail.y1);
  ctx.stroke();

  // little flags, swaying
  const n = Math.max(3, Math.floor(dx / 34));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const fx = rail.x0 + dx * f;
    const fy = rail.y0 + dy * f;
    const sway = Math.sin(t * 2.2 + i * 0.9) * 2.2;
    ctx.fillStyle = i % 2 ? VIOLET : GOLD;
    ctx.globalAlpha = active ? 1 : 0.75;
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy);
    ctx.lineTo(fx + 4, fy);
    ctx.lineTo(fx + sway, fy + 11);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- effects

/**
 * Snow spray thrown off the paws.
 *
 * Emitted along the surface tangent rather than straight up, so it reads as snow
 * being cut by something moving across a slope instead of dust puffing off a
 * flat floor. Density follows speed, which makes going fast look fast.
 */
export function drawSpray(ctx, particles, pal) {
  ctx.save();
  ctx.fillStyle = pal.snowLit;
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Expanding ring when a flip lands and the trackers scatter. */
export function drawFlipBurst(ctx, x, y, t) {
  if (t <= 0) return;
  const r = 20 + (1 - t) * 120;
  ctx.save();
  ctx.globalAlpha = t * 0.7;
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 2 + t * 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Floating text for a landed trick — the only writing inside the world. */
export function drawTrickLabel(ctx, label, x, y, t) {
  if (t <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 1.6);
  ctx.fillStyle = GOLD;
  ctx.font = '600 15px ui-rounded, "Nunito", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - (1 - t) * 34);
  ctx.restore();
}
