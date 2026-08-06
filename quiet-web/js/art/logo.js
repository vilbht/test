// logo.js — drawing the Firefox mark onto a canvas.
//
// The artwork itself lives in firefox-mark.js as an inlined SVG; this file is
// only concerned with getting it onto a 2D context at a given size, rotation
// and opacity, plus the warm halo that makes it read as a light source rather
// than a sticker.
//
// An SVG image decodes asynchronously, and the game draws its first frame
// immediately — so until it is ready there is a fallback mark drawn from plain
// shapes. It is a worse logo, which is the whole reason the real one is here,
// but a few frames of approximation beat a few frames of nothing.
//
// Firefox and the Firefox logo are trademarks of the Mozilla Foundation. This
// is a personal fan project; see the README.

import { FIREFOX_MARK_URI } from './firefox-mark.js';

let mark = null;
let ready = false;

// Guarded rather than assumed: the bundler's duplicate-name check imports every
// module under Node, where there is no Image constructor.
if (typeof Image !== 'undefined') {
  mark = new Image();
  mark.addEventListener('load', () => { ready = true; });
  mark.addEventListener('error', () => {
    console.warn('the Firefox mark did not decode — falling back to the drawn one');
  });
  mark.src = FIREFOX_MARK_URI;
}

/** True once the real artwork has decoded. Exported for the smoke test. */
export function markReady() {
  return ready;
}

/**
 * @param r      radius of the mark — it is drawn to fill a 2r box
 * @param spin   rotation in radians
 * @param alpha  0..1, for the cross-fade
 */
export function drawFirefoxMark(ctx, x, y, r, spin = 0, alpha = 1) {
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // Halo first, and outside the rotation: a light source that turns with its
  // subject reads as a spotlight sweeping the scene.
  const halo = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r * 1.8);
  halo.addColorStop(0, 'rgba(255, 130, 40, 0.34)');
  halo.addColorStop(1, 'rgba(255, 130, 40, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-r * 1.85, -r * 1.85, r * 3.7, r * 3.7);

  ctx.rotate(spin);

  if (ready) {
    ctx.drawImage(mark, -r, -r, r * 2, r * 2);
  } else {
    ctx.scale(r, r);
    drawFallback(ctx);
  }

  ctx.restore();
}

// ---------------------------------------------------------------- fallback

const FLAME_STOPS = [
  [0, '#E31587'],       // magenta, at the foot
  [0.24, '#F5406B'],
  [0.48, '#FF6A2B'],
  [0.72, '#FFA724'],
  [0.9, '#FFD426'],
  [1, '#FFF06A'],       // yellow, at the crown
];

function polar(a, radius) {
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

/** A band between two arcs, closing to a point at each end of the sweep. */
function crescent(ctx, from, sweep, rOuter, thick) {
  const steps = 72;
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const p = polar(from + sweep * (i / steps), rOuter);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const w = thick * Math.pow(Math.sin(u * Math.PI), 0.5);
    const p = polar(from + sweep * u, rOuter - w);
    ctx.lineTo(p.x, p.y);
  }

  ctx.closePath();
  ctx.fill();
}

/** A tongue breaking past the outline: wide at the base, curling to a point. */
function tongue(ctx, a, spread, reach, bend, base) {
  const p0 = polar(a - spread, base);
  const p1 = polar(a + spread, base);
  const tip = polar(a + bend, base + reach);
  const c0 = polar(a - spread * 0.5 + bend * 0.5, base + reach * 0.7);
  const c1 = polar(a + spread * 0.9 + bend * 0.3, base + reach * 0.45);

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.quadraticCurveTo(c0.x, c0.y, tip.x, tip.y);
  ctx.quadraticCurveTo(c1.x, c1.y, p1.x, p1.y);
  ctx.closePath();
  ctx.fill();
}

/** Drawn in units of the radius, so it scales with the real thing exactly. */
function drawFallback(ctx) {
  const flame = ctx.createLinearGradient(-0.55, 0.95, 0.5, -1.0);
  for (const [stop, colour] of FLAME_STOPS) flame.addColorStop(stop, colour);

  ctx.fillStyle = flame;
  tongue(ctx, -1.62, 0.34, 0.42, 0.20, 0.72);
  tongue(ctx, -1.02, 0.30, 0.30, 0.22, 0.74);
  tongue(ctx, -2.18, 0.26, 0.24, 0.12, 0.74);

  crescent(ctx, 0.85, 5.3, 0.99, 0.50);
  crescent(ctx, 1.55, 4.3, 0.87, 0.36);

  const globe = ctx.createLinearGradient(-0.36, -0.5, 0.42, 0.5);
  globe.addColorStop(0, '#B968FF');
  globe.addColorStop(0.42, '#8B3DFF');
  globe.addColorStop(1, '#4A28C4');
  ctx.fillStyle = globe;
  ctx.beginPath();
  ctx.arc(0.08, 0.03, 0.52, 0, Math.PI * 2);
  ctx.fill();
}
