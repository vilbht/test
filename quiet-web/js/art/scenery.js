// scenery.js — sky, parallax layers and ground, styled per zone.
//
// Everything here is generated from the world position it is drawn at, via a
// cheap integer hash, rather than from stored scenery objects. Nothing to
// allocate, nothing to cull, and a hill is in the same place every time the
// camera passes it — which matters, because scenery that reshuffles as you
// backtrack reads instantly as fake.

import { drawFirefoxMark } from './logo.js';

const PALETTES = {
  meadow: {
    sky: ['#3B1E5F', '#7B3B8A', '#E8794A'],
    far: '#3A2058', mid: '#2E1A4B', near: '#241340',
    // Warm olive-gold rather than a fresh green: grass lit by a low orange sun
    // is amber, and a saturated green cap reads as fluorescent against a violet
    // sky — the one colour on screen belonging to a different painting.
    soil: '#35224F', soilDeep: '#26173C', edge: '#7E6B3A', edgeLit: '#C2A257',
    accent: '#FFC93C',
  },
  canyon: {
    sky: ['#241147', '#4A2270', '#B3496B'],
    far: '#2C1650', mid: '#231143', near: '#1B0D34',
    soil: '#2B1A45', soilDeep: '#1F1233', edge: '#6B447A', edgeLit: '#8E5C9E',
    accent: '#8B3DFF',
  },
  grove: {
    sky: ['#170B33', '#391C5C', '#7A3070'],
    far: '#2B1650', mid: '#241246', near: '#180C31',
    soil: '#241640', soilDeep: '#180E2C', edge: '#3F6356', edgeLit: '#5D8C79',
    accent: '#9059FF',
  },
};

export const paletteFor = (key) => PALETTES[key] || PALETTES.meadow;

/** Deterministic 0..1 from an integer. Same index, same shape, every frame. */
function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Walk one parallax layer's repeating slots.
 *
 * The slot index is derived from the layer's own scrolled position, not from the
 * screen, so each slot keeps its identity as the camera moves and its contents
 * stay put instead of shimmering.
 */
function eachSlot(cam, rate, spacing, vw, fn) {
  const off = cam.x * rate;
  const first = Math.floor(off / spacing) - 1;
  const count = Math.ceil(vw / spacing) + 3;
  for (let i = first; i < first + count; i++) fn(i, i * spacing - off);
}

// ---------------------------------------------------------------- sky

export function drawSky(ctx, zoneKey, vw, vh, camY) {
  const p = paletteFor(zoneKey);
  const g = ctx.createLinearGradient(0, -camY * 0.25, 0, vh - camY * 0.25);
  g.addColorStop(0, p.sky[0]);
  g.addColorStop(0.62, p.sky[1]);
  g.addColorStop(1, p.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

/**
 * The sun — which is the Firefox mark, hanging low over the horizon.
 *
 * It is still doing a sun's job: the single warmest thing on screen, the source
 * the whole palette is lit by, parallaxing barely at all so it reads as far
 * away. Only the disc has changed. Drawn before the parallax layers on purpose,
 * so the hills cut across its foot and it sits *in* the sky rather than on top
 * of it.
 *
 * Held upright and still. The mark has a definite up, and a slowly turning one
 * would read as a second flourish competing with the shield pulse — which is
 * the one place in the game the logo is supposed to be the event.
 */
export function drawSun(ctx, zoneKey, vw, vh, cam) {
  const p = paletteFor(zoneKey);
  const x = vw * 0.74 - cam.x * 0.02;
  const y = vh * 0.62 - cam.y * 0.12;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, 210);
  glow.addColorStop(0, 'rgba(255, 201, 60, 0.30)');
  glow.addColorStop(0.4, 'rgba(232, 121, 74, 0.14)');
  glow.addColorStop(1, 'rgba(232, 121, 74, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 220, y - 220, 440, 440);

  // Sat back from full strength: at the saturation the mark is drawn for the
  // pulse it out-shouts the fox from across the screen, and the sun is scenery.
  // The grove sits under canopy, so its light is dimmer again.
  drawFirefoxMark(ctx, x, y, 48, 0, zoneKey === 'grove' ? 0.5 : 0.72);
  void p;
}

// ---------------------------------------------------------------- parallax

/**
 * Three depth layers per zone, each with its own silhouette vocabulary so the
 * zones read as different places rather than as recoloured copies.
 */
export function drawParallax(ctx, zoneKey, cam, vw, vh, t) {
  const p = paletteFor(zoneKey);
  const horizon = 420 - cam.y * 0.55;

  if (zoneKey === 'canyon') {
    mesaLayer(ctx, cam, vw, horizon, p.far, 0.16, 250, 210, 3);
    rackLayer(ctx, cam, vw, horizon, p, t);
    mesaLayer(ctx, cam, vw, horizon + 46, p.near, 0.52, 170, 120, 9);
  } else if (zoneKey === 'grove') {
    hillLayer(ctx, cam, vw, horizon + 10, p.far, 0.16, 320, 90);
    treeLayer(ctx, cam, vw, horizon, p, t);
    hillLayer(ctx, cam, vw, horizon + 58, p.near, 0.5, 210, 64);
  } else {
    hillLayer(ctx, cam, vw, horizon, p.far, 0.15, 340, 104);
    meadowTreeLayer(ctx, cam, vw, horizon + 24, p, t);
    hillLayer(ctx, cam, vw, horizon + 62, p.near, 0.5, 230, 68);
  }
  void vh;
}

/** Soft rolling hills — overlapping arcs, no hard peaks. */
function hillLayer(ctx, cam, vw, base, colour, rate, spacing, height) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-spacing, base + 400);
  eachSlot(cam, rate, spacing, vw, (i, x) => {
    const h = height * (0.55 + hash(i * 7 + 11) * 0.75);
    ctx.quadraticCurveTo(x + spacing * 0.5, base - h, x + spacing, base - h * 0.15);
  });
  ctx.lineTo(vw + spacing * 2, base + 400);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Blocky mesas — flat tops and vertical faces, the canyon's signature. */
function mesaLayer(ctx, cam, vw, base, colour, rate, spacing, height, step) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-spacing, base + 400);
  eachSlot(cam, rate, spacing, vw, (i, x) => {
    const h = height * (0.4 + hash(i * 13 + 5) * 0.85);
    const w = spacing * (0.5 + hash(i * 17 + 3) * 0.32);
    ctx.lineTo(x, base);
    ctx.lineTo(x, base - h);
    ctx.lineTo(x + w, base - h);
    ctx.lineTo(x + w, base - h + step);
    ctx.lineTo(x + w + spacing * 0.18, base - h + step);
    ctx.lineTo(x + w + spacing * 0.18, base);
  });
  ctx.lineTo(vw + spacing * 2, base + 400);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Server racks with slow blinking lights — the canyon's mid layer. */
function rackLayer(ctx, cam, vw, base, p, t) {
  ctx.save();
  eachSlot(cam, 0.33, 190, vw, (i, x) => {
    const h = 90 + hash(i * 19) * 130;
    const w = 54 + hash(i * 23) * 36;
    ctx.fillStyle = p.mid;
    ctx.fillRect(x, base - h, w, h);

    const rows = Math.floor(h / 15);
    for (let r = 0; r < rows; r++) {
      const seed = hash(i * 97 + r * 7);
      if (seed < 0.42) continue;
      // a slow, offset blink so the racks never pulse in unison
      const on = 0.45 + 0.55 * Math.sin(t * (0.7 + seed) + seed * 12);
      ctx.globalAlpha = 0.20 + on * 0.55;
      ctx.fillStyle = seed > 0.86 ? p.accent : '#FFC93C';
      ctx.fillRect(x + 6, base - h + 8 + r * 15, 4, 3);
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
}

/** Tall thin trunks with a high canopy — the grove reads as vertical. */
function treeLayer(ctx, cam, vw, base, p, t) {
  ctx.save();
  eachSlot(cam, 0.3, 150, vw, (i, x) => {
    const h = 180 + hash(i * 29) * 190;
    const sway = Math.sin(t * 0.5 + i) * 3;
    ctx.fillStyle = p.mid;
    ctx.beginPath();
    ctx.moveTo(x - 5, base);
    ctx.quadraticCurveTo(x - 2 + sway * 0.5, base - h * 0.6, x + sway, base - h);
    ctx.quadraticCurveTo(x + 4 + sway * 0.5, base - h * 0.6, x + 6, base);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x + sway, base - h, 40 + hash(i * 31) * 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/** Round-crowned trees dotted along the meadow's mid distance. */
function meadowTreeLayer(ctx, cam, vw, base, p, t) {
  ctx.save();
  ctx.fillStyle = p.mid;
  eachSlot(cam, 0.32, 210, vw, (i, x) => {
    if (hash(i * 41) < 0.3) return;
    const h = 54 + hash(i * 43) * 46;
    const r = 22 + hash(i * 47) * 15;
    const sway = Math.sin(t * 0.6 + i * 1.7) * 1.6;
    ctx.fillRect(x - 2.5, base - h, 5, h);
    ctx.beginPath();
    ctx.arc(x + sway, base - h - r * 0.55, r, 0, Math.PI * 2);
    ctx.arc(x + sway - r * 0.6, base - h - r * 0.1, r * 0.68, 0, Math.PI * 2);
    ctx.arc(x + sway + r * 0.6, base - h - r * 0.15, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- ground

/**
 * Ground slabs, styled by the zone they belong to. The lit top edge is what
 * makes a platform read as standable at a glance; everything below it is just
 * mass, so it stays deliberately quiet.
 */
export function drawGround(ctx, rects, cam, vw, vh) {
  const left = cam.x - 80;
  const right = cam.x + vw + 80;
  const bottom = cam.y + vh + 80;

  for (const r of rects) {
    if (r.x > right || r.x + r.w < left) continue;
    const p = paletteFor(r.zone);

    if (r.oneWay) {
      drawLedge(ctx, r, p);
      continue;
    }

    const h = Math.min(r.h, bottom - r.y);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + Math.max(60, h));
    g.addColorStop(0, p.soil);
    g.addColorStop(1, p.soilDeep);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, h);

    ctx.fillStyle = p.edge;
    ctx.fillRect(r.x, r.y, r.w, 5);
    ctx.fillStyle = p.edgeLit;
    ctx.fillRect(r.x, r.y, r.w, 2);

    if (r.zone === 'meadow') drawGrass(ctx, r, p);
    else if (r.zone === 'canyon') drawStrata(ctx, r, p, h);
    else drawSpores(ctx, r, p);
  }
}

function drawLedge(ctx, r, p) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, p.edge);
  g.addColorStop(1, p.soilDeep);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 4);
  ctx.fill();
  ctx.fillStyle = p.edgeLit;
  ctx.fillRect(r.x + 2, r.y, r.w - 4, 2);
}

/** Tufts along the lip, keyed to world x so they never crawl. */
function drawGrass(ctx, r, p) {
  ctx.save();
  ctx.strokeStyle = p.edgeLit;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const step = 11;
  for (let x = r.x + 4; x < r.x + r.w - 3; x += step) {
    const k = hash(Math.round(x * 3.1));
    if (k < 0.42) continue;
    const h = 4 + k * 6;
    const bend = (k - 0.5) * 5;
    ctx.beginPath();
    ctx.moveTo(x, r.y + 1);
    ctx.quadraticCurveTo(x + bend * 0.5, r.y - h * 0.6, x + bend, r.y - h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Horizontal rock bands — cheap, and instantly reads as cut stone. */
function drawStrata(ctx, r, p, h) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = p.soilDeep;
  for (let y = r.y + 16; y < r.y + h; y += 22) {
    const k = hash(Math.round((r.x + y) * 1.7));
    ctx.fillRect(r.x, y, r.w, 2 + k * 2);
  }
  ctx.restore();
}

/** Faint glowing motes clinging to the grove floor. */
function drawSpores(ctx, r, p) {
  ctx.save();
  ctx.fillStyle = p.accent;
  for (let x = r.x + 8; x < r.x + r.w - 6; x += 17) {
    const k = hash(Math.round(x * 5.3));
    if (k < 0.6) continue;
    ctx.globalAlpha = 0.16 + k * 0.24;
    ctx.beginPath();
    ctx.arc(x, r.y - 2 - k * 4, 1.2 + k * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
