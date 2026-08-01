// fox.js — fox renderers behind one swappable interface.
//
//   draw(ctx, x, y, state)
//     x, y      feet-centre in world space (the camera transform is already applied)
//     state     { facing, phase, airborne, onGround, blocking, tail, squash,
//                 lean, speed, w, h }
//
// GreyboxFox exists so movement can be judged before any art does — if the run,
// the jump and the tail whip do not read well as flat rectangles, no amount of
// gradient work will save them. ProceduralFox is the shipped look; a SpriteFox
// reading real art can replace it later by changing one line in main.js.
//
// Art direction from the mascot references: filled shapes only, no outlines,
// gradients doing all the shading. Orange back falling to magenta at the belly
// and rear, pale gold throat and muzzle, dark plum socks, and a tail that runs
// magenta at the root through orange to a pale gold tip.

/**
 * Taken off the mascot reference sheet rather than invented.
 *
 * The run is orange along the back falling to gold underneath, with the legs —
 * and only the legs — carrying on down into magenta. An earlier pass had dark
 * plum socks and a magenta belly, which inverted the whole scheme: the reference
 * fox is *pale* underneath and hot at the extremities.
 */
const PALETTE = {
  backTop: '#FF8A2B',
  backMid: '#FA7233',
  belly: '#FFC93C',
  gold: '#FFD98A',
  goldDeep: '#FFC155',
  sock: '#F0417A',
  paw: '#D81A5F',
  earInner: '#C9346B',
  earTip: '#F5793B',
  eye: '#2B1A4A',
  nose: '#2B1A4A',
  tailRoot: '#E8437A',
  tailMid: '#FF8A22',
  tailTip: '#FFD84D',
  shadow: 'rgba(20, 8, 40, 0.30)',
};

/**
 * Forces driving the tail chain. Exported so the game and tools/preview.html
 * simulate the same tail — a pose sheet that lies about the tail is worse than
 * no pose sheet.
 *
 * A real fox tail is mostly air. Simulated at true gravity it hangs straight
 * down like a rope and drags through the floor, which is exactly what the first
 * pass did. So gravity is light and two biases do the work: a constant backward
 * push so the tail trails the fox even at a standstill, and a gentle lift that
 * cancels most of the remaining droop. Speed then adds to the backward push,
 * which is what unfurls it into the reference's flame shape at a sprint.
 */
export function foxTailForces({ facing, vx, vy, wind = { x: 0, y: 0 } }) {
  return {
    gravity: 300,
    damping: 0.982,
    iterations: 6,
    // Bends the plume up and over, the way the reference mascot carries it when
    // standing. Signed by facing so it always curls skyward, never into the
    // ground — and eased off with speed, because the running reference streams
    // its tail out in a long flat S rather than carrying it curled. Left at full
    // strength the bend accumulates past a half turn at a sprint and the tail
    // wraps under the fox.
    curl: facing * (470 - Math.min(1, Math.abs(vx) / 235) * 300),
    wind: {
      // Enough backward push to trail, not so much that it straightens. Pull the
      // bias much above this and the chain goes taut into a rigid spear; the
      // curve is the whole character of the shape.
      x: wind.x - facing * 215 - vx * 0.75,
      // Lift roughly cancels gravity; the shape comes from `curl` above rather
      // than from beating gravity, which only ever produced a straight tail
      // pointing somewhere else.
      y: wind.y - 300 - vy * 0.35,
    },
  };
}

/** Tail spread target: compact at idle, unfurled at speed and in the air. */
export function foxTailSpread(speed, airborne, runSpeed = 235) {
  return 1 + Math.min(1, Math.abs(speed) / runSpeed) * 1.0 + (airborne ? 0.4 : 0);
}

/**
 * Sprite sheet contract.
 *
 * Everything below is authored at `scale` sheet-pixels per world unit, so a
 * frame is a fixed box with the fox's *feet-centre* pinned at (anchorX, anchorY).
 * That anchor is the whole reason the layout is shared code rather than a note
 * in a readme: the game positions the fox by its feet, so art that is centred
 * on the frame instead will look correct standing still and sink into the floor
 * the moment it moves.
 *
 * The sheet holds the body only. The tail stays procedural because it is a
 * physics chain that lengthens with speed and whips on direction changes — a
 * drawn tail would throw all of that away. Pass `includesTail: true` if you
 * would rather draw it yourself, and the solver's tail is suppressed.
 */
export const SPRITE_LAYOUT = Object.freeze({
  frame: 192,        // each cell is 192 x 192
  anchorX: 64,       // feet-centre within the cell
  anchorY: 168,
  scale: 4,          // sheet pixels per world unit
  states: Object.freeze({
    //          row, frames, fps      what the frames are
    idle: { row: 0, frames: 4, fps: 5 },
    run: { row: 1, frames: 8, fps: 15 },
    air: { row: 2, frames: 4, fps: 0 },   // 0 rise · 1 apex · 2 fall · 3 land
  }),
  cols: 8,
  rowCount: 3,
});

/**
 * A fox drawn from a sprite sheet matching SPRITE_LAYOUT.
 *
 * Drop-in for ProceduralFox: same draw(ctx, x, y, state) signature, so swapping
 * is one line in main.js and nothing else in the game knows the difference.
 */
export function createSpriteFox(image, {
  layout = SPRITE_LAYOUT,
  includesTail = false,
} = {}) {
  return {
    name: 'sprite',

    draw(ctx, x, y, s) {
      const { facing, squash, lean, airborne, blocking, tail, phase, speed } = s;

      drawContactShadow(ctx, x, y, airborne);
      if (!includesTail) drawTail(ctx, tail);

      const cell = pickCell(layout, { airborne, speed, phase, vy: s.vy });

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(lean * 0.5);
      ctx.scale((squash.sx * facing) / layout.scale, squash.sy / layout.scale);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        cell.col * layout.frame, cell.row * layout.frame, layout.frame, layout.frame,
        -layout.anchorX, -layout.anchorY, layout.frame, layout.frame,
      );
      ctx.restore();

      if (blocking > 0) drawShield(ctx, x, y - 18, blocking);
    },
  };
}

/** Which cell of the sheet this state should show. */
function pickCell(layout, { airborne, speed, phase, vy = 0 }) {
  const { states } = layout;

  if (airborne) {
    const frame = vy < -90 ? 0 : (vy < 90 ? 1 : 2);
    return { row: states.air.row, col: frame };
  }
  if (Math.abs(speed) < 12) {
    const n = states.idle.frames;
    return { row: states.idle.row, col: Math.floor(phase * states.idle.fps) % n };
  }
  const n = states.run.frames;
  return { row: states.run.row, col: Math.floor(phase * 1.6) % n };
}

// ---------------------------------------------------------------- greybox

export const GreyboxFox = {
  name: 'greybox',

  draw(ctx, x, y, s) {
    const { w, h, facing, squash, lean, airborne, blocking, tail } = s;

    strokeTail(ctx, tail, '#7C6A9C', 7);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.6);
    ctx.scale(squash.sx, squash.sy);

    ctx.fillStyle = airborne ? '#C9A227' : '#B9B2C9';
    ctx.fillRect(-w / 2, -h, w, h);

    ctx.fillStyle = '#2B1B44';
    ctx.beginPath();
    ctx.moveTo(facing * (w / 2), -h + 7);
    ctx.lineTo(facing * (w / 2 + 9), -h + 12);
    ctx.lineTo(facing * (w / 2), -h + 17);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#2B1B44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const swing = Math.sin(s.phase) * 6 * (airborne ? 0.25 : 1);
    ctx.moveTo(-4 + swing, -6);
    ctx.lineTo(-4 + swing, 0);
    ctx.moveTo(5 - swing, -6);
    ctx.lineTo(5 - swing, 0);
    ctx.stroke();
    ctx.restore();

    if (blocking > 0) drawShield(ctx, x, y - h / 2, blocking);
  },
};

// ---------------------------------------------------------------- procedural

export const ProceduralFox = {
  name: 'procedural',

  draw(ctx, x, y, s) {
    const { facing, squash, lean, airborne, blocking, tail, phase, speed } = s;

    if (s.shadow !== false) drawContactShadow(ctx, x, y, airborne);

    // The tail lives in world space because the verlet solver is anchored to the
    // fox's hips in world coordinates — so it is drawn before, and outside, the
    // body's local transform.
    drawTail(ctx, tail);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.5);
    ctx.scale(squash.sx * facing, squash.sy);

    const gait = airborne ? null : phase;
    const run = Math.min(1, speed / 235);

    // far legs first, then body, then near legs: cheap depth for free
    drawLegs(ctx, gait, run, airborne, true);
    drawBody(ctx);
    drawLegs(ctx, gait, run, airborne, false);
    drawHead(ctx, airborne, run);

    ctx.restore();

    if (blocking > 0) drawShield(ctx, x, y - 18, blocking);
  },
};

/** A soft ellipse under the fox — the cheapest cue for how high off the ground it is. */
function drawContactShadow(ctx, x, y, airborne) {
  ctx.save();
  ctx.globalAlpha = airborne ? 0.16 : 0.32;
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5, airborne ? 10 : 15, airborne ? 2.5 : 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- body

function drawBody(ctx) {
  // Orange along the spine falling to gold underneath — the reference fox is
  // pale on its belly, not dark.
  const grad = ctx.createLinearGradient(0, -31, 0, -14);
  grad.addColorStop(0, PALETTE.backTop);
  grad.addColorStop(0.55, PALETTE.backMid);
  grad.addColorStop(1, PALETTE.belly);

  // One continuous silhouette from tail root, over the back, up the neck and
  // back along the belly. Slimmer and deeper-chested than the first pass, which
  // was built like a terrier next to the reference's long-limbed fox.
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-13, -20);                              // tail root, high on the rump
  ctx.bezierCurveTo(-14, -27, -9, -30, -2, -30);     // over the back
  ctx.bezierCurveTo(4, -30, 7, -29, 9, -31);         // shoulder
  ctx.bezierCurveTo(12, -33.5, 13.5, -31, 13, -27);  // up into the neck
  ctx.bezierCurveTo(12.5, -23, 10, -20, 7, -18);     // chest
  ctx.bezierCurveTo(2, -15.5, -5, -15.5, -9, -16.5); // belly
  ctx.bezierCurveTo(-12, -17.5, -13, -18, -13, -20); // haunch back to the root
  ctx.closePath();
  ctx.fill();

  // The pale gold front: throat down over the chest. Narrow and vertical — a
  // wide wedge sweeping back along the belly reads as a painted chevron.
  const chest = ctx.createLinearGradient(11, -31, 10, -16);
  chest.addColorStop(0, PALETTE.gold);
  chest.addColorStop(0.5, PALETTE.goldDeep);
  chest.addColorStop(1, 'rgba(255, 193, 85, 0)');
  ctx.fillStyle = chest;
  ctx.beginPath();
  ctx.moveTo(12.6, -30.5);
  ctx.bezierCurveTo(14, -27.5, 12.8, -23, 9.4, -19.6);
  ctx.bezierCurveTo(7.6, -17.8, 5.6, -17.2, 4.6, -17.4);
  ctx.bezierCurveTo(7, -21, 9.6, -26, 10.4, -30);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- legs

/**
 * Four legs on a two-beat gait: the diagonal pairs swing together, which is what
 * makes a quadruped read as trotting rather than as a pair of scissors.
 */
function drawLegs(ctx, phase, run, airborne, far) {
  const swing = airborne ? 0 : Math.sin(phase) * 0.62 * (0.35 + run * 0.65);
  const alt = airborne ? 0 : Math.sin(phase + Math.PI) * 0.62 * (0.35 + run * 0.65);

  // Mid-air the legs tuck fore-and-aft rather than freezing mid-stride.
  const frontA = airborne ? 0.55 : (far ? alt : swing);
  const backA = airborne ? -0.6 : (far ? swing : alt);

  ctx.save();
  if (far) ctx.globalAlpha = 0.72;

  drawLeg(ctx, 8, -18.5, frontA, far);
  drawLeg(ctx, -9.5, -19, backA, far);

  ctx.restore();
}

function drawLeg(ctx, hx, hy, angle, far) {
  // Long and fine. The reference fox stands tall on thin legs; the first pass
  // was a third shorter and read as a corgi.
  const len = 19;
  const knee = len * 0.5;

  // Orange at the haunch running down into magenta — the legs are the only part
  // of the fox that goes hot at the end.
  const grad = ctx.createLinearGradient(hx, hy, hx, hy + len);
  grad.addColorStop(0, PALETTE.backMid);
  grad.addColorStop(0.42, PALETTE.sock);
  grad.addColorStop(1, PALETTE.paw);

  const kx = hx + Math.sin(angle) * knee;
  const ky = hy + Math.cos(angle) * knee;
  // the lower leg trails the upper slightly — a straight stick reads as a peg
  const fx = kx + Math.sin(angle * 0.5) * (len - knee);
  const fy = ky + Math.cos(angle * 0.5) * (len - knee);

  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = far ? 2.6 : 3.2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.quadraticCurveTo(kx, ky, fx, fy);
  ctx.stroke();

  ctx.fillStyle = PALETTE.paw;
  ctx.beginPath();
  ctx.ellipse(fx, fy + 0.3, 2.1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- head

function drawHead(ctx, airborne, run) {
  const grad = ctx.createLinearGradient(0, -36, 0, -22);
  grad.addColorStop(0, PALETTE.backTop);
  grad.addColorStop(1, PALETTE.backMid);

  drawEars(ctx, run);

  // skull and muzzle in one shape — the reference head is a soft wedge
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(8, -30);
  ctx.bezierCurveTo(9, -36, 15, -38, 19, -36);   // forehead
  ctx.bezierCurveTo(23, -34.5, 26, -33, 28, -31.5); // bridge of the muzzle
  ctx.bezierCurveTo(29.5, -30.8, 29.5, -29.4, 28, -28.8); // nose
  ctx.bezierCurveTo(24, -27.5, 20, -27, 17, -27);
  ctx.bezierCurveTo(13, -27, 9, -27.5, 8, -30);
  ctx.closePath();
  ctx.fill();

  // pale gold muzzle underside and cheek
  const muzzle = ctx.createLinearGradient(18, -32, 20, -26.5);
  muzzle.addColorStop(0, 'rgba(255, 201, 60, 0)');
  muzzle.addColorStop(1, PALETTE.gold);
  ctx.fillStyle = muzzle;
  ctx.beginPath();
  ctx.moveTo(28.2, -29.4);
  ctx.bezierCurveTo(24, -27.4, 20, -26.9, 16, -27);
  ctx.bezierCurveTo(19, -29, 24, -30, 28, -30.6);
  ctx.closePath();
  ctx.fill();

  // Scalloped cheek ruff: two small flicks at the jawline. The reference's ruff
  // is a delicate edge detail — sized up it merges with the throat gradient into
  // one large arrow pointing at the fox's own chest.
  ctx.fillStyle = PALETTE.goldDeep;
  for (let i = 0; i < 2; i++) {
    const cx = 13.2 - i * 1.9;
    const cy = -28.9 + i * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + 1.3, cy - 0.7);
    ctx.lineTo(cx - 1.5, cy + 0.25);
    ctx.lineTo(cx + 1.2, cy + 0.95);
    ctx.closePath();
    ctx.fill();
  }

  // eye: dark aubergine, never black, with a single highlight
  ctx.fillStyle = PALETTE.eye;
  ctx.beginPath();
  ctx.ellipse(19.8, -32.3, 1.6, airborne ? 1.95 : 1.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(20.35, -32.85, 0.58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.nose;
  ctx.beginPath();
  ctx.ellipse(28.5, -29.7, 1.15, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tall narrow ears. They lag the head a little, which sells acceleration. */
function drawEars(ctx, run) {
  const tilt = run * 0.22;

  for (const [bx, by, h, lean] of [[11.5, -34.5, 11, -0.16], [16.5, -35.5, 10, 0.05]]) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(lean + tilt);

    ctx.fillStyle = PALETTE.earTip;
    ctx.beginPath();
    ctx.moveTo(-3, 1.5);
    ctx.quadraticCurveTo(-1.6, -h * 0.7, 0.4, -h);
    ctx.quadraticCurveTo(2.2, -h * 0.55, 3, 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = PALETTE.earInner;
    ctx.beginPath();
    ctx.moveTo(-1.3, 0.6);
    ctx.quadraticCurveTo(-0.5, -h * 0.55, 0.4, -h * 0.78);
    ctx.quadraticCurveTo(1.3, -h * 0.45, 1.6, 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// ---------------------------------------------------------------- tail

/**
 * The hero prop. Drawn as a tapered stroke along the verlet chain rather than as
 * a constructed polygon: round joins give a smooth silhouette for free and, more
 * importantly, it cannot self-intersect into a bowtie when the chain doubles
 * back on itself during a hard direction change.
 */
function drawTail(ctx, tail) {
  if (!tail || tail.points.length < 3) return;
  const p = tail.points;
  const n = p.length;
  const tip = p[n - 1];
  const root = p[0];

  const grad = ctx.createLinearGradient(root.x, root.y, tip.x, tip.y);
  grad.addColorStop(0, PALETTE.tailRoot);
  grad.addColorStop(0.45, PALETTE.tailMid);
  grad.addColorStop(1, PALETTE.tailTip);

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1);
    ctx.lineWidth = tailWidth(t);
    ctx.beginPath();
    ctx.moveTo(p[i].x, p[i].y);
    ctx.lineTo(p[i + 1].x, p[i + 1].y);
    ctx.stroke();
  }

  drawFlameLicks(ctx, p, grad);
  ctx.restore();
}

/**
 * Fattest around a third of the way down, tapering to a point — a fox tail, not
 * a rope. Peaking at the root instead makes it read as a tube.
 */
function tailWidth(t) {
  // The tail is the mascot: in the reference it carries as much visual mass as
  // the rest of the animal, so it is deliberately fatter than looks reasonable
  // in isolation. It is a ratio, though — go wide without also keeping the chain
  // short and the fox disappears behind its own brush.
  return 19 * Math.pow(1 - t, 0.45) * (0.66 + 0.34 * Math.sin(t * Math.PI));
}

/** The reference tail is edged with flame licks rather than fur. */
function drawFlameLicks(ctx, p, grad) {
  const n = p.length;
  ctx.fillStyle = grad;

  for (let i = 3; i < n - 1; i += 2) {
    const t = i / (n - 1);
    const a = p[i];
    const b = p[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / len;
    const ny = dx / len;
    const side = i % 4 === 0 ? 1 : -1;
    const half = tailWidth(t) / 2;
    // Shallow: at full length these become a sawblade edge rather than the
    // reference's soft flame notches.
    const spike = half * 0.42;

    ctx.beginPath();
    ctx.moveTo(a.x + nx * half * side, a.y + ny * half * side);
    ctx.lineTo(a.x + nx * (half + spike) * side - dx * 0.55,
      a.y + ny * (half + spike) * side - dy * 0.55);
    ctx.lineTo(b.x + nx * half * side, b.y + ny * half * side);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------- shared

/** The tail chain as a plain tapered polyline — used by the grey-box build. */
function strokeTail(ctx, tail, colour, width) {
  if (!tail || tail.points.length < 2) return;
  const p = tail.points;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < p.length - 1; i++) {
    ctx.lineWidth = width * (1 - i / p.length) + 1;
    ctx.beginPath();
    ctx.moveTo(p[i].x, p[i].y);
    ctx.lineTo(p[i + 1].x, p[i + 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Expanding ring for the shield pulse. `t` runs 1 → 0 over the pulse. */
function drawShield(ctx, x, y, t) {
  const r = 132 * (1 - t) + 18;
  ctx.save();
  ctx.globalAlpha = t * 0.75;
  ctx.strokeStyle = '#9059FF';
  ctx.lineWidth = 3 + t * 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export { strokeTail, drawShield, PALETTE };
