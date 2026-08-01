// scenery.js — sky, mountains, snow and the things standing on it.
//
// The look is Alto's: flat filled shapes, no outlines, no texture, and depth
// carried entirely by value — each range a little lighter and lower in contrast
// than the one in front. Nothing here owns a colour; everything takes it from
// the day/night palette, so one interpolation moves the whole world from dawn to
// night with no seam anywhere.
//
// Scenery positions come from an integer hash of world position rather than
// stored objects: nothing to allocate or cull, and a tree stands in the same
// place every time the camera passes it.

import { surfaceY, inChasm } from '../../core/terrain.mjs';

/** Deterministic 0..1 from an integer. */
function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function eachSlot(cam, rate, spacing, vw, fn) {
  const off = cam.x * rate;
  const first = Math.floor(off / spacing) - 1;
  const count = Math.ceil(vw / spacing) + 3;
  for (let i = first; i < first + count; i++) fn(i, i * spacing - off);
}

// ---------------------------------------------------------------- sky

export function drawSky(ctx, pal, vw, vh) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(0.58, pal.sky[1]);
  g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

/**
 * Stars, fading in as the palette darkens. Hashed from a grid index so they hold
 * still against the sky while everything in front of them scrolls.
 */
export function drawStars(ctx, pal, cam, vw, vh, t) {
  if (pal.star < 0.02) return;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 90; i++) {
    const span = vw * 1.4;
    let sx = (hash(i * 3 + 1) * span - cam.x * 0.012) % span;
    if (sx < 0) sx += span;
    const sy = hash(i * 7 + 5) * vh * 0.62 - cam.y * 0.05;
    const twinkle = 0.55 + 0.45 * Math.sin(t * (0.6 + hash(i * 11) * 1.6) + i);
    ctx.globalAlpha = pal.star * twinkle * (0.35 + hash(i * 13) * 0.65);
    const r = 0.7 + hash(i * 17) * 1.1;
    ctx.fillRect(sx, sy, r, r);
  }
  ctx.restore();
}

/** Sun or moon — the same disc, moved and recoloured by the cycle. */
export function drawSun(ctx, pal, cam, vw, vh) {
  const x = vw * 0.72 - cam.x * 0.014;
  const y = vh * pal.sunY - cam.y * 0.08;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, 230);
  glow.addColorStop(0, pal.sunGlow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 240, y - 240, 480, 480);

  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
}

/** Soft flattened blobs drifting very slowly across the upper sky. */
export function drawClouds(ctx, pal, cam, vw, vh, t) {
  ctx.save();
  ctx.fillStyle = pal.far;
  ctx.globalAlpha = 0.33;
  eachSlot(cam, 0.05, 520, vw, (i, x) => {
    if (hash(i * 29) < 0.45) return;
    const y = vh * (0.10 + hash(i * 31) * 0.26) - cam.y * 0.03 + Math.sin(t * 0.1 + i) * 4;
    const w = 90 + hash(i * 37) * 110;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 13 + hash(i * 41) * 9, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.45, y + 5, w * 0.55, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- mountains

/**
 * Three ranges of peaks behind the playfield. Each scrolls slower, sits higher
 * and holds less contrast than the one in front — that difference in value is
 * the entire depth cue. No haze, no blur, no outlines doing any of the work.
 */
export function drawMountains(ctx, pal, cam, vw, vh) {
  const layers = [
    { rate: 0.06, spacing: 300, height: 210, colour: pal.far, base: 0.70, alpha: 0.75 },
    { rate: 0.14, spacing: 240, height: 168, colour: pal.mid, base: 0.78, alpha: 0.88 },
    { rate: 0.26, spacing: 190, height: 124, colour: pal.near, base: 0.88, alpha: 1 },
  ];

  for (const layer of layers) {
    const base = vh * layer.base - cam.y * 0.2;

    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = layer.colour;
    ctx.beginPath();
    ctx.moveTo(-layer.spacing, vh + 400);
    eachSlot(cam, layer.rate, layer.spacing, vw, (i, x) => {
      const h = layer.height * (0.45 + hash(i * 19 + 7) * 0.9);
      const skew = (hash(i * 23) - 0.5) * layer.spacing * 0.3;
      ctx.lineTo(x, base);
      ctx.lineTo(x + layer.spacing * 0.5 + skew, base - h);
      ctx.lineTo(x + layer.spacing, base);
    });
    ctx.lineTo(vw + layer.spacing * 2, vh + 400);
    ctx.closePath();
    ctx.fill();

    // snow caps on the nearest range only, where they would actually read
    if (layer.rate > 0.2) {
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = pal.snow;
      eachSlot(cam, layer.rate, layer.spacing, vw, (i, x) => {
        const h = layer.height * (0.45 + hash(i * 19 + 7) * 0.9);
        const skew = (hash(i * 23) - 0.5) * layer.spacing * 0.3;
        const peakX = x + layer.spacing * 0.5 + skew;
        ctx.beginPath();
        ctx.moveTo(peakX, base - h);
        ctx.lineTo(peakX + h * 0.2, base - h * 0.7);
        ctx.lineTo(peakX - h * 0.2, base - h * 0.7);
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the slope

/**
 * The ridable surface, split into runs of solid ground.
 *
 * Splitting matters: filling one continuous shape and drawing the chasms on top
 * would leave the holes reading as marks painted on the snow rather than as
 * places where the mountain stops.
 */
function slopeRuns(terrain, x0, x1, step) {
  const runs = [];
  let current = null;
  for (let x = x0; x <= x1; x += step) {
    if (inChasm(terrain, x)) {
      if (current) { runs.push(current); current = null; }
      continue;
    }
    if (!current) current = [];
    current.push({ x, y: surfaceY(terrain, x) });
  }
  if (current) runs.push(current);
  return runs;
}

/**
 * The inside of a chasm.
 *
 * Without this the gap simply shows whatever is behind the mountain, and since
 * that is a lit background range the hole reads as a bright pillar standing in
 * front of the slope rather than as a place where the ground stops. Filling it
 * with a darkening gradient restores the one thing a hole must have: the sense
 * that it goes down.
 */
function drawChasmVoids(ctx, terrain, pal, cam, vw, vh) {
  const l = cam.x - 60;
  const r = cam.x + vw + 60;

  for (const c of terrain.chasms) {
    if (c.x1 < l || c.x0 > r) continue;
    const top = Math.min(surfaceY(terrain, c.x0), surfaceY(terrain, c.x1)) - 6;
    const depth = vh + 400;

    const g = ctx.createLinearGradient(0, top, 0, top + depth * 0.55);
    g.addColorStop(0, pal.near);
    g.addColorStop(1, '#05060F');
    ctx.fillStyle = g;
    ctx.fillRect(c.x0 - 1, top, c.x1 - c.x0 + 2, depth);
  }
}

export function drawSlope(ctx, terrain, pal, cam, vw, vh) {
  const runs = slopeRuns(terrain, cam.x - 60, cam.x + vw + 60, 7);
  const bottom = cam.y + vh + 400;

  drawChasmVoids(ctx, terrain, pal, cam, vw, vh);

  for (const run of runs) {
    if (run.length < 2) continue;
    const top = Math.min(...run.map((p) => p.y));

    const g = ctx.createLinearGradient(0, top, 0, top + 320);
    g.addColorStop(0, pal.snow);
    g.addColorStop(1, pal.shade);
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.moveTo(run[0].x, bottom);
    for (const p of run) ctx.lineTo(p.x, p.y);
    ctx.lineTo(run[run.length - 1].x, bottom);
    ctx.closePath();
    ctx.fill();

    // The lit lip: the brightest line in the scene, and the thing that makes the
    // surface read as snow instead of as a coloured region.
    ctx.strokeStyle = pal.snowLit;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (const p of run) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

/** Pine silhouettes standing on the real surface, so they sit in the snow. */
export function drawTrees(ctx, terrain, pal, cam, vw) {
  const spacing = 118;
  const first = Math.floor((cam.x - 120) / spacing);
  const last = Math.ceil((cam.x + vw + 120) / spacing);

  ctx.save();
  ctx.fillStyle = pal.near;
  for (let i = first; i <= last; i++) {
    if (hash(i * 61 + 3) < 0.54) continue;
    const x = i * spacing + (hash(i * 67) - 0.5) * 60;
    if (inChasm(terrain, x)) continue;

    const y = surfaceY(terrain, x) + 2;
    const h = 34 + hash(i * 71) * 40;
    const w = h * 0.32;

    ctx.fillRect(x - 1.6, y - h * 0.34, 3.2, h * 0.34);
    ctx.beginPath();
    for (let tier = 0; tier < 3; tier++) {
      const ty = y - h * (0.3 + tier * 0.27);
      const tw = w * (1 - tier * 0.25);
      ctx.moveTo(x - tw, ty + h * 0.2);
      ctx.lineTo(x, ty - h * 0.22);
      ctx.lineTo(x + tw, ty + h * 0.2);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- weather

/** Falling snow, in screen space so it never has to be culled. */
export function drawSnowfall(ctx, pal, cam, vw, vh, t, intensity) {
  if (intensity <= 0.01) return;
  const count = Math.floor(150 * intensity);
  const spanX = vw * 1.3;
  const spanY = vh + 40;

  ctx.save();
  ctx.fillStyle = pal.snowLit;
  for (let i = 0; i < count; i++) {
    const depth = 0.35 + hash(i * 5) * 0.65;
    const sway = Math.sin(t * 0.7 + i) * 18 * depth;
    let x = (hash(i * 3) * spanX + sway - cam.x * depth * 0.35) % spanX;
    let y = (hash(i * 9) * spanY + t * (40 + depth * 90) - cam.y * depth * 0.3) % spanY;
    if (x < 0) x += spanX;
    if (y < 0) y += spanY;
    ctx.globalAlpha = 0.16 + depth * 0.42;
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + depth * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A skein of birds crossing occasionally, in daylight only. */
export function drawBirds(ctx, pal, cam, vw, vh, t) {
  if (pal.star > 0.5) return;
  const cycle = 46;
  const phase = (t % cycle) / cycle;
  if (phase > 0.4) return;

  ctx.save();
  ctx.strokeStyle = pal.near;
  ctx.globalAlpha = 0.5 * Math.sin((phase / 0.4) * Math.PI);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const leadX = vw * 1.15 - phase * vw * 2.6 - cam.x * 0.02;
  const leadY = vh * 0.2 - cam.y * 0.04;

  for (let i = 0; i < 5; i++) {
    const bx = leadX + i * 26 + (i % 2 ? 8 : 0);
    const by = leadY + i * 9 + Math.sin(t * 3 + i) * 3;
    const flap = 3 + Math.sin(t * 7 + i * 1.3) * 2.4;
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.lineTo(bx, by - flap);
    ctx.lineTo(bx + 5, by);
    ctx.stroke();
  }
  ctx.restore();
}

/** A shooting star, rare, night only. */
export function drawShootingStar(ctx, pal, cam, vw, vh, t) {
  if (pal.star < 0.6) return;
  const cycle = 21;
  const phase = (t % cycle) / cycle;
  if (phase > 0.09) return;

  const p = phase / 0.09;
  const x = vw * (0.15 + p * 0.7);
  const y = vh * (0.10 + p * 0.22) - cam.y * 0.03;

  ctx.save();
  ctx.globalAlpha = pal.star * Math.sin(p * Math.PI) * 0.9;
  const g = ctx.createLinearGradient(x - 70, y - 22, x, y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, '#FFFFFF');
  ctx.strokeStyle = g;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 70, y - 22);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}
