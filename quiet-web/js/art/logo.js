// logo.js — the Firefox mark, drawn procedurally.
//
// Three structural facts do the recognising, and everything here serves them:
// a violet globe filling most of the disc; a body of fire wrapped around it that
// is heavy at the lower left and thins as it climbs; and distinct tongues
// breaking past the outline at the crown. Colour runs magenta at the foot,
// through red and orange up the left, to yellow at the top.
//
// Two earlier attempts missed by getting the *distribution* wrong rather than
// the palette. A ring of even thickness reads as a planet with a hoop; a disc
// with teardrops stuck on the top reads as a disc with horns. The fire has to be
// a crescent, and the tongues have to grow out of it.
//
// Drawn in units of the radius, so the shape is defined once and scales exactly.
// Nothing is traced from Mozilla's artwork; Firefox is Mozilla's trademark, and
// the README says what this is.

const FLAME_STOPS = [
  [0, '#E31587'],       // magenta, at the foot
  [0.24, '#F5406B'],
  [0.48, '#FF6A2B'],
  [0.72, '#FFA724'],
  [0.9, '#FFD426'],
  [1, '#FFF06A'],       // yellow, at the crown
];

function polar(a, r) {
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/**
 * A crescent of fire: a band between two arcs whose inner radius rises to meet
 * the outer, closing the shape to a point at the end of the sweep.
 */
function crescent(ctx, from, sweep, rOuter, thick) {
  const steps = 72;
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const p = polar(from + sweep * (i / steps), rOuter);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    // fat early, pinched to nothing at both ends
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
  ctx.scale(r, r);

  // ---- halo, so the mark reads as lit rather than pasted on
  const halo = ctx.createRadialGradient(0, 0, 0.55, 0, 0, 1.8);
  halo.addColorStop(0, 'rgba(255, 130, 40, 0.34)');
  halo.addColorStop(1, 'rgba(255, 130, 40, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-1.85, -1.85, 3.7, 3.7);

  const flame = ctx.createLinearGradient(-0.55, 0.95, 0.5, -1.0);
  for (const [stop, colour] of FLAME_STOPS) flame.addColorStop(stop, colour);

  // ---- tongues first, so the crescents overlap their bases and they read as
  // growing out of the fire rather than sitting on top of it
  ctx.fillStyle = flame;
  tongue(ctx, -1.62, 0.34, 0.42, 0.20, 0.72);
  tongue(ctx, -1.02, 0.30, 0.30, 0.22, 0.74);
  tongue(ctx, -2.18, 0.26, 0.24, 0.12, 0.74);

  // ---- the body of the fire: overlapping crescents, heaviest at the foot,
  // sweeping up the left and over the crown
  // The sweep starts at the lower right and runs all the way round to the crown,
  // so the globe is never left with a bare shoulder breaking the silhouette.
  ctx.fillStyle = flame;
  crescent(ctx, 0.85, 5.3, 0.99, 0.50);
  crescent(ctx, 1.55, 4.3, 0.87, 0.36);

  // ---- the globe, pushed right and down. That offset is what leaves the fire
  // thick at the lower left and thin at the crown; centred, it reads as a hoop.
  const globe = ctx.createLinearGradient(-0.36, -0.5, 0.42, 0.5);
  globe.addColorStop(0, '#B968FF');
  globe.addColorStop(0.42, '#8B3DFF');
  globe.addColorStop(1, '#4A28C4');
  ctx.fillStyle = globe;
  ctx.beginPath();
  ctx.arc(0.08, 0.03, 0.52, 0, Math.PI * 2);
  ctx.fill();

  // a cool highlight at the top left of the globe, so it reads as a sphere
  const sheen = ctx.createRadialGradient(-0.12, -0.24, 0.02, -0.12, -0.24, 0.42);
  sheen.addColorStop(0, 'rgba(198, 150, 255, 0.55)');
  sheen.addColorStop(1, 'rgba(198, 150, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(0.08, 0.03, 0.52, 0, Math.PI * 2);
  ctx.fill();

  // ---- the fox's snout biting into the fire at the globe's left shoulder.
  // Small and low contrast on purpose: at the size this is seen it is a
  // suggestion, and a large wrong shape reads worse than a small right one.
  ctx.fillStyle = '#FFC155';
  ctx.beginPath();
  ctx.moveTo(-0.78, -0.20);
  ctx.quadraticCurveTo(-0.46, -0.34, -0.20, -0.26);
  ctx.quadraticCurveTo(-0.40, -0.12, -0.44, 0.00);
  ctx.quadraticCurveTo(-0.64, -0.04, -0.78, -0.20);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
