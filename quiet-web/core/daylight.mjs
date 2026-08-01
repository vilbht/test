// daylight.mjs — a continuous day/night cycle keyed to distance travelled.
//
// The zone system this replaces switched palette at hard boundaries, which put a
// visible seam in the world every few thousand pixels. A descent should read as
// one unbroken journey, so the sky is instead interpolated between keyframes:
// every colour on screen is a blend of the two nearest times of day, and no
// frame ever looks like the moment the theme changed.
//
// Kept pure and DOM-free so the palette can be asserted in tests like anything
// else — a cycle that silently stops advancing is otherwise invisible until
// someone plays all the way to dusk.

/** Keyframes at fractions of the full descent. `at` must ascend from 0 to 1. */
export const PHASES = Object.freeze([
  {
    at: 0, name: 'First Light',
    sky: ['#22336B', '#5B6BA8', '#E8A87C'],
    far: '#4A5C93', mid: '#3B4A7A', near: '#2A3560',
    snow: '#F2ECFF', snowLit: '#FFFFFF', shade: '#C3C9E8',
    sun: '#FFD9A0', sunGlow: 'rgba(255,196,128,0.34)', sunY: 0.70,
    star: 0,
  },
  {
    at: 0.24, name: 'Morning',
    sky: ['#5AA7D6', '#9DD0E8', '#F6E2C0'],
    far: '#7FA9C9', mid: '#6892B5', near: '#4E7595',
    snow: '#FFFFFF', snowLit: '#FFFFFF', shade: '#D6E4F2',
    sun: '#FFF3D0', sunGlow: 'rgba(255,240,200,0.30)', sunY: 0.34,
    star: 0,
  },
  {
    at: 0.46, name: 'Afternoon',
    sky: ['#3E7FC1', '#86B9DE', '#EED9B8'],
    far: '#6E9CC0', mid: '#5A85AC', near: '#436B8F',
    snow: '#FBFCFF', snowLit: '#FFFFFF', shade: '#CBDCEE',
    sun: '#FFEFC8', sunGlow: 'rgba(255,236,190,0.26)', sunY: 0.46,
    star: 0,
  },
  {
    at: 0.66, name: 'Golden Hour',
    sky: ['#3B2A63', '#B4628A', '#F5A05C'],
    far: '#6D4A7C', mid: '#553A66', near: '#3C2A50',
    snow: '#FFE9DC', snowLit: '#FFF6EC', shade: '#C99AB0',
    sun: '#FFC46B', sunGlow: 'rgba(255,150,90,0.40)', sunY: 0.74,
    star: 0.1,
  },
  {
    at: 0.82, name: 'Dusk',
    sky: ['#1B1740', '#4A2E63', '#C2557A'],
    far: '#42305E', mid: '#33244A', near: '#241938',
    snow: '#E4DCF2', snowLit: '#F6EFFF', shade: '#9C8CBC',
    sun: '#F58A6E', sunGlow: 'rgba(232,110,120,0.34)', sunY: 0.86,
    star: 0.55,
  },
  {
    at: 1, name: 'Night',
    sky: ['#080A22', '#141A3E', '#2E2A5C'],
    far: '#1E2148', mid: '#161835', near: '#0E1026',
    snow: '#C9CEEA', snowLit: '#E4E8FF', shade: '#7079A8',
    sun: '#E8ECFF', sunGlow: 'rgba(180,200,255,0.20)', sunY: 0.22,
    star: 1,
  },
]);

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Blend two #rrggbb colours. */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = mixChannel((pa >> 16) & 255, (pb >> 16) & 255, t);
  const g = mixChannel((pa >> 8) & 255, (pb >> 8) & 255, t);
  const bl = mixChannel(pa & 255, pb & 255, t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Blend two rgba() strings component-wise. */
export function mixRgba(a, b, t) {
  const parse = (s) => s.match(/[\d.]+/g).map(Number);
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => (i < 3 ? Math.round(v + (pb[i] - v) * t) : +(v + (pb[i] - v) * t).toFixed(3)));
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;
}

/**
 * The palette at a point in the descent.
 *
 * @param progress 0 at the summit, 1 at the bottom
 */
export function paletteAt(progress) {
  const p = clamp01(progress);

  let i = 0;
  while (i < PHASES.length - 2 && p > PHASES[i + 1].at) i++;
  const a = PHASES[i];
  const b = PHASES[i + 1];
  const span = b.at - a.at;
  const t = span <= 0 ? 0 : clamp01((p - a.at) / span);

  return {
    name: t < 0.5 ? a.name : b.name,
    sky: [0, 1, 2].map((k) => mixHex(a.sky[k], b.sky[k], t)),
    far: mixHex(a.far, b.far, t),
    mid: mixHex(a.mid, b.mid, t),
    near: mixHex(a.near, b.near, t),
    snow: mixHex(a.snow, b.snow, t),
    snowLit: mixHex(a.snowLit, b.snowLit, t),
    shade: mixHex(a.shade, b.shade, t),
    sun: mixHex(a.sun, b.sun, t),
    sunGlow: mixRgba(a.sunGlow, b.sunGlow, t),
    sunY: a.sunY + (b.sunY - a.sunY) * t,
    star: a.star + (b.star - a.star) * t,
  };
}
