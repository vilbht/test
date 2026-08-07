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

  // The first tracker of the run is ringed while its warning card is up, so the
  // words on the card have something to be about. Two rings breathing out of
  // phase — one steady circle would read as a selection box rather than an
  // alarm, and the game has nothing else that pulses.
  if (k.flagged) {
    for (let i = 0; i < 2; i++) {
      const beat = (t * 0.9 + i * 0.5) % 1;
      ctx.globalAlpha = (1 - beat) * 0.75;
      ctx.strokeStyle = WARN;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 + beat * 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
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

// ---------------------------------------------------------------- fact card

/**
 * The privacy fact, as a speech bubble floating over the beacon that produced it.
 *
 * It used to be a DOM panel pinned to the bottom of the screen, which read as
 * chrome — a subtitle track running underneath the game rather than something
 * happening in it. Drawing it in world space, tethered to the lantern by a
 * pointer, ties the words to the thing that said them, and lets the fox look up
 * at a specific spot rather than at the bottom of the window.
 *
 * Being in world space it also scrolls with the level, so walking away from a
 * beacon carries its card off the side of the screen, which is the right
 * behaviour for something a place is telling you.
 */
const CARD = Object.freeze({
  width: 336,
  padding: 16,
  radius: 14,
  titleFont: '700 15px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif',
  bodyFont: '14px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif',
  lineHeight: 20,
  gap: 7,          // between title and body
  pointer: 11,     // half-width of the tail that points at the beacon
  reach: 16,       // how far the pointer drops below the panel
  ctaGap: 13,      // between the body and the call to action
  ctaLine: 17,     // a wrapped line of it
  ctaPad: 7,       // above and below the key cap
  keyFont: '700 12px ui-monospace, SFMono-Regular, monospace',
  ctaFont: '600 13px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif',
});

/** Break `text` into lines that fit `maxWidth` at the current font. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Measure a card without drawing it.
 *
 * Split out because the height depends on how the body wraps, and the caller
 * draws the panel upward from its anchor — so the box has to be known before a
 * single pixel of it can be placed.
 */
/** Magenta, for anything the card is warning about rather than explaining. */
const WARN = '#FF5C8A';

/**
 * The call-to-action row: a key cap, then what pressing it does.
 *
 * Drawn as a keyboard key rather than a button because that is what it is —
 * there is no pointer in this game, and a rectangle that looks clickable on a
 * canvas nobody can click is a worse affordance than no affordance.
 */
function drawCta(ctx, cta, x, y, accent) {
  ctx.font = CARD.keyFont;

  ctx.fillStyle = cta.taken ? 'rgba(255, 201, 60, 0.16)' : 'rgba(255, 255, 255, 0.13)';
  ctx.beginPath();
  ctx.roundRect(x, y, cta.keyW, 22, 6);
  ctx.fill();
  ctx.strokeStyle = cta.taken ? accent : 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // "on" rather than a tick: the same lesson as the mute button. A glyph that
  // renders as an empty box on someone else's machine is worse than a word.
  ctx.fillStyle = cta.taken ? accent : 'rgba(247, 239, 234, 0.95)';
  ctx.textAlign = 'center';
  ctx.fillText(cta.key, x + cta.keyW / 2, y + 15);

  ctx.textAlign = 'left';
  ctx.font = CARD.ctaFont;
  ctx.fillStyle = cta.taken ? 'rgba(247, 239, 234, 0.72)' : accent;
  cta.lines.forEach((line, i) => {
    ctx.fillText(line, x + cta.keyW + 10, y + 15 + i * CARD.ctaLine);
  });
}

export function layoutFactCard(ctx, fact, taken = false) {
  const inner = CARD.width - CARD.padding * 2;
  ctx.font = CARD.bodyFont;
  const lines = wrapText(ctx, fact.body, inner);

  // The call to action: the real setting this fact is about, offered as
  // something to switch on. Once it is on the same row says so and names what
  // changed — the card never claims an effect it has not delivered.
  const cta = ctaFor(ctx, fact, taken, inner);
  const h = CARD.padding * 2 + 18 + CARD.gap + lines.length * CARD.lineHeight +
    (cta ? CARD.ctaGap + cta.h : 0);

  return { w: CARD.width, h, lines, cta, title: fact.title, reach: CARD.reach };
}

/**
 * @returns { key, keyW, lines, h, taken } — or null for a card offering nothing.
 *
 * The label is wrapped, not truncated. The confirmation line names the setting
 * *and* what it changed, which is nearly twice the length of the offer that
 * preceded it, and the first version of this ran it straight off the side of
 * the card.
 */
function ctaFor(ctx, fact, taken, inner) {
  const cta = fact.act
    ? { key: fact.act.key, label: fact.act.label, taken: false }
    : fact.protect && (taken
      ? { key: 'on', label: `${fact.protect.name} — ${fact.protect.does}`, taken: true }
      : { key: 'E', label: fact.protect.name, taken: false });
  if (!cta) return null;

  ctx.font = CARD.keyFont;
  cta.keyW = Math.max(26, ctx.measureText(cta.key).width + 16);

  ctx.font = CARD.ctaFont;
  cta.lines = wrapText(ctx, cta.label, inner - cta.keyW - 10);
  cta.h = Math.max(22, cta.lines.length * CARD.ctaLine + CARD.ctaPad * 2 - 8);
  return cta;
}

/**
 * @param x, y   the point being spoken from: centre-bottom of the panel, and
 *               where the pointer touches down. World space — the card is part
 *               of the scene and scrolls off with it.
 * @param appear 0..1 — rises and fades in, so the card arrives rather than blinks
 */
export function drawFactCard(ctx, layout, x, y, appear, tone = 'fact') {
  if (appear <= 0.01) return;

  const a = Math.max(0, Math.min(1, appear));
  const left = x - layout.w / 2;
  const top = y - layout.h;

  ctx.save();
  ctx.globalAlpha = a;
  // rise into place, and settle out of a slight shrink
  ctx.translate(x, y);
  ctx.translate(0, (1 - a) * 14);
  ctx.scale(0.95 + 0.05 * a, 0.95 + 0.05 * a);
  ctx.translate(-x, -y);

  // panel plus the pointer, as one path so the join is seamless
  ctx.beginPath();
  ctx.roundRect(left, top, layout.w, layout.h, CARD.radius);
  ctx.moveTo(x - CARD.pointer, y - 1);
  ctx.lineTo(x, y + layout.reach);
  ctx.lineTo(x + CARD.pointer, y - 1);
  ctx.closePath();

  ctx.fillStyle = 'rgba(20, 10, 40, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // The spine and the title take the colour of whatever is speaking: gold for a
  // beacon, magenta for a warning. It is the only difference between the two
  // kinds of card, and it is enough — the tone is legible before the words are.
  const accent = tone === 'warn' ? WARN : GOLD;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(left, top + 10, 3, layout.h - 20, 2);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = accent;
  ctx.font = CARD.titleFont;
  ctx.fillText(layout.title, left + CARD.padding, top + CARD.padding + 13);

  ctx.fillStyle = 'rgba(247, 239, 234, 0.93)';
  ctx.font = CARD.bodyFont;
  const bodyTop = top + CARD.padding + 18 + CARD.gap;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, left + CARD.padding, bodyTop + (i + 1) * CARD.lineHeight - 6);
  });

  if (layout.cta) {
    drawCta(ctx, layout.cta, left + CARD.padding,
      bodyTop + layout.lines.length * CARD.lineHeight + CARD.ctaGap, accent);
  }

  ctx.restore();
}
