// logo.js — the Firefox mark, drawn procedurally.
//
// Built from the same vocabulary as the rest of the game rather than traced:
// a dark globe with a flame spiralling around it, in the tail's own gradient of
// magenta through orange to gold. That keeps it consistent with the fox it
// morphs out of — the flame is recognisably the same fire as the tail — and it
// keeps the whole game asset-free, which the single-file artifact build needs.
//
// It is an evocation of Mozilla's mark, not a reproduction of it. Firefox is
// Mozilla's trademark; see the note in the README.

const FLAME = [
  { stop: 0, colour: '#FFE566' },
  { stop: 0.32, colour: '#FFC93C' },
  { stop: 0.66, colour: '#F5793B' },
  { stop: 1, colour: '#E8437A' },
];

/**
 * One band of the flame: a crescent that wraps the globe and tapers to a point.
 *
 * Built as a filled region between an outer arc and an inner one, where the
 * inner radius climbs to meet the outer by the end of the sweep — that is what
 * closes the shape into a tip. The first attempt stroked a spiral with a varying
 * line width instead, which produced an even ribbon: recognisably a swirl, but
 * with none of the mass-to-point falloff that makes the Firefox mark read as
 * fire rather than as a ring.
 *
 * @param sweep  radians travelled; more than a full turn is fine and overlaps
 * @param thick  fraction of r between the arcs at the fattest point
 */
function flameBand(ctx, r, startAngle, sweep, rOuter, thick) {
  const steps = 60;
  ctx.beginPath();

  // out along the leading edge
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = startAngle + sweep * u;
    const rad = r * (rOuter + u * 0.06);
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }

  // and back along the trailing edge, closing to a point at the tip
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const a = startAngle + sweep * u;
    // Pointed at *both* ends. Starting at full thickness left a blunt stub
    // sticking out of the swirl — real flame licks come to a point where they
    // leave the fire as well as where they die out.
    const width = thick * Math.pow(Math.sin(u * Math.PI), 0.55);
    const rad = r * (rOuter + u * 0.06 - Math.max(0, width));
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }

  ctx.closePath();
  ctx.fill();
}

/**
 * @param r      radius of the mark
 * @param spin   rotation in radians
 * @param alpha  0..1, for the cross-fade
 */
export function drawFirefoxMark(ctx, x, y, r, spin = 0, alpha = 1) {
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(spin);

  // outer glow, so the mark reads as lit rather than pasted on
  const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.9);
  halo.addColorStop(0, 'rgba(245, 121, 59, 0.34)');
  halo.addColorStop(1, 'rgba(245, 121, 59, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-r * 1.9, -r * 1.9, r * 3.8, r * 3.8);

  // the globe: deep indigo, lit from the upper left
  const globe = ctx.createRadialGradient(-r * 0.26, -r * 0.3, r * 0.04, 0, 0, r * 0.7);
  globe.addColorStop(0, '#7A50C8');
  globe.addColorStop(0.5, '#3C2478');
  globe.addColorStop(1, '#170B34');
  ctx.fillStyle = globe;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
  ctx.fill();

  // Three crescents nested outward, deepest colour innermost, each starting a
  // little further round. Layering rather than one shape is what gives the
  // flame its banding without any outline.
  const grad = ctx.createLinearGradient(-r, r * 0.6, r * 0.7, -r);
  for (const s of FLAME) grad.addColorStop(s.stop, s.colour);

  ctx.fillStyle = '#E8437A';
  flameBand(ctx, r, 2.05, 5.3, 0.70, 0.26);

  ctx.fillStyle = grad;
  flameBand(ctx, r, 2.35, 5.5, 0.88, 0.34);
  flameBand(ctx, r, 2.6, 4.9, 1.04, 0.26);

  // a bright inner rim where the flame meets the globe
  ctx.strokeStyle = 'rgba(255, 214, 120, 0.5)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.545, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
