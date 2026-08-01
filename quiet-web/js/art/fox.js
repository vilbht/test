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
  // 256, not 192: at four sheet-pixels per world unit the fox spans about 53
  // units nose to trailing paw and 50 ear-tip to ground, and a running frame
  // spilled out of the smaller cell into its neighbour.
  frame: 256,        // each cell is 256 x 256
  anchorX: 96,       // feet-centre within the cell
  anchorY: 224,
  scale: 4,          // sheet pixels per world unit
  states: Object.freeze({
    //            row, frames, fps    what the frames are
    idle: { row: 0, frames: 4, fps: 5 },
    walk: { row: 1, frames: 8, fps: 10 },
    run: { row: 2, frames: 8, fps: 15 },
    air: { row: 3, frames: 4, fps: 0 },   // 0 rise · 1 apex · 2 fall · 3 land
    pulse: { row: 4, frames: 4, fps: 0 }, // the shift flourish, brace → recover
  }),
  cols: 8,
  rowCount: 5,
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

      const cell = pickCell(layout, { airborne, speed, phase, blocking, vy: s.vy });

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

      if (blocking > 0 && s.shield !== false) drawShield(ctx, x, y - 18, blocking);
    },
  };
}

/**
 * Which cell of the sheet this state should show.
 *
 * The order matters: the pulse outranks everything, because it is a deliberate
 * action and reading "running" over the top of it would swallow the flourish
 * the player just triggered. Airborne outranks gait for the same reason.
 */
function pickCell(layout, { airborne, speed, phase, blocking = 0, vy = 0 }) {
  const { states } = layout;

  if (blocking > 0.05 && states.pulse) {
    const n = states.pulse.frames;
    const i = Math.min(n - 1, Math.floor((1 - blocking) * n));
    return { row: states.pulse.row, col: i };
  }
  if (airborne) {
    const frame = vy < -90 ? 0 : (vy < 90 ? 1 : 2);
    return { row: states.air.row, col: frame };
  }
  if (Math.abs(speed) < 12) {
    const n = states.idle.frames;
    return { row: states.idle.row, col: Math.floor(phase * states.idle.fps) % n };
  }
  const gait = Math.abs(speed) < WALK_RUN_SPLIT * 235 ? states.walk : states.run;
  if (!gait) return { row: states.run.row, col: Math.floor(phase * 1.6) % states.run.frames };
  return { row: gait.row, col: Math.floor(phase * 1.6) % gait.frames };
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
    const { facing, squash, lean, airborne, blocking, tail } = s;

    if (s.shadow !== false) drawContactShadow(ctx, x, y, airborne);

    // The tail lives in world space because the verlet solver is anchored to the
    // fox's hips in world coordinates — so it is drawn before, and outside, the
    // body's local transform.
    drawTail(ctx, tail);

    const pose = foxPose(s);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.5);
    ctx.scale(squash.sx * facing, squash.sy);

    // far legs first, then body, then near legs: cheap depth for free
    drawLegs(ctx, pose, true);

    ctx.save();
    applyBodyTransform(ctx, pose);
    drawBody(ctx);
    drawHead(ctx, pose);
    ctx.restore();

    drawLegs(ctx, pose, false);

    ctx.restore();

    // The sheet tool draws the brace pose without the ring, so a cell holds the
    // fox and nothing else.
    if (blocking > 0 && s.shield !== false) drawShield(ctx, x, y - 18, blocking);
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

// ---------------------------------------------------------------- poses

/** Long and fine. The reference fox stands tall on thin legs. */
const LEG_LEN = 19;

/** Hips, in body-local space. The legs hang from these. */
const FRONT_HIP = { x: 8, y: -18.5 };
const BACK_HIP = { x: -9.5, y: -19 };

/** Where the body pitches about — roughly its centre of mass. */
const PIVOT = { x: 0, y: -22 };

/** Below this fraction of the run speed the fox walks rather than runs. */
export const WALK_RUN_SPLIT = 0.55;

/**
 * The pose the fox is holding, resolved from game state.
 *
 * Exported because the sprite-sheet tool bakes the same poses into cells, and a
 * sheet whose frames disagree with the live renderer is worse than no sheet.
 *
 * A pose is four foot positions in body-local space plus how the trunk carries
 * them. Feet are given in absolute local coordinates — y = 0 is the ground —
 * rather than as joint angles, because that is how the interesting poses are
 * actually distinguished: a crouch is feet planted with the chest dropped onto
 * them, a landing is forelegs reaching ahead of the body. Angles make those two
 * hard to author and easy to get subtly wrong; foot targets make them obvious.
 */
export function foxPose(s) {
  const {
    airborne = false, phase = 0, speed = 0, blocking = 0, vy = 0, land = 0, runSpeed = 235,
  } = s;
  const run = Math.min(1, Math.abs(speed) / runSpeed);

  if (blocking > 0.05) return bracePose(blocking);
  if (airborne) return airPose(vy, run);
  if (land > 0.02) return landPose(land, run);
  if (run < 0.05) return idlePose(phase);
  if (run < WALK_RUN_SPLIT) return gaitPose(phase, run, WALK);
  return gaitPose(phase, run, RUN);
}

/**
 * One foot through a stride: planted and sliding backwards under the fox, then
 * lifted and swung forward again. `duty` is the fraction of the cycle spent on
 * the ground, and it is most of what separates a walk from a run — a walk keeps
 * its feet down, a run spends over half the cycle in the air.
 */
function footCycle(phase, stride, lift, duty) {
  const u = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (u < duty) {
    const k = u / duty;
    return { x: stride * (0.5 - k), y: 0 };          // stance: front to back
  }
  const k = (u - duty) / (1 - duty);
  return { x: stride * (k - 0.5), y: -lift * Math.sin(k * Math.PI) };
}

const WALK = { stride: 11, lift: 3.2, duty: 0.66, bob: 0.7, pitch: 0.015, ears: 0.85, reach: 0.5 };
const RUN = { stride: 21, lift: 7.5, duty: 0.40, bob: 2.4, pitch: 0.075, ears: -0.45, reach: 1 };

/**
 * A two-beat gait: the diagonal pairs move together, which is what makes a
 * quadruped read as trotting rather than as a pair of scissors. The body rises
 * on the beat, and at a run that bob is large enough to be the main cue that
 * the fox is airborne between strides.
 */
function gaitPose(phase, run, g) {
  const amp = 0.4 + run * 0.6;
  const front = footCycle(phase, g.stride * amp, g.lift * amp, g.duty);
  const frontAlt = footCycle(phase + Math.PI, g.stride * amp, g.lift * amp, g.duty);
  const back = footCycle(phase + Math.PI, g.stride * amp, g.lift * amp, g.duty);
  const backAlt = footCycle(phase, g.stride * amp, g.lift * amp, g.duty);

  return {
    name: run < WALK_RUN_SPLIT ? 'walk' : 'run',
    feet: {
      frontNear: { x: FRONT_HIP.x + front.x + g.reach, y: front.y },
      frontFar: { x: FRONT_HIP.x + frontAlt.x + g.reach, y: frontAlt.y },
      backNear: { x: BACK_HIP.x + back.x, y: back.y },
      backFar: { x: BACK_HIP.x + backAlt.x, y: backAlt.y },
    },
    bodyY: -Math.abs(Math.sin(phase)) * g.bob * amp,
    pitch: g.pitch * run,
    head: { x: run * 2.2, y: run * 1.6 },   // lowered and thrust forward at speed
    ears: g.ears,
    eye: 1,
  };
}

/** Standing. Weight square over all four feet, ears up, a slow breath. */
function idlePose(phase) {
  const breath = Math.sin(phase * 0.55) * 0.28;
  return {
    name: 'idle',
    feet: {
      frontNear: { x: FRONT_HIP.x + 1.2, y: 0 },
      frontFar: { x: FRONT_HIP.x - 1.4, y: 0 },
      backNear: { x: BACK_HIP.x - 1.2, y: 0 },
      backFar: { x: BACK_HIP.x + 1.4, y: 0 },
    },
    bodyY: breath,
    pitch: -0.01,
    head: { x: 0, y: -0.4 - breath },
    ears: 1,
    eye: 1,
  };
}

/**
 * Airborne, in three beats. These are the frames a player actually sees on a
 * jump, and they have to be distinct at a glance: gathered going up, tucked at
 * the top, reaching on the way down.
 */
function airPose(vy, run) {
  const rise = vy < -90;
  const fall = vy > 90;

  if (rise) {
    return {
      name: 'rise',
      // forelegs folded up under the chest, hind legs still trailing the push-off
      feet: {
        frontNear: { x: FRONT_HIP.x + 4.5, y: -10.5 },
        frontFar: { x: FRONT_HIP.x + 2.0, y: -8.5 },
        backNear: { x: BACK_HIP.x - 11, y: -3.5 },
        backFar: { x: BACK_HIP.x - 8.5, y: -5.5 },
      },
      bodyY: -0.5,
      pitch: -0.11,                      // nose up, chasing the apex
      head: { x: 0.6, y: -1.4 },
      ears: -0.15,
      eye: 1.15,
    };
  }
  if (fall) {
    return {
      name: 'fall',
      // forelegs out ahead, feeling for the ground; hind legs streaming behind
      feet: {
        frontNear: { x: FRONT_HIP.x + 10, y: 1.5 },
        frontFar: { x: FRONT_HIP.x + 7.5, y: -0.5 },
        backNear: { x: BACK_HIP.x - 7, y: -5 },
        backFar: { x: BACK_HIP.x - 4.5, y: -7 },
      },
      bodyY: 0,
      pitch: 0.07,
      head: { x: 1.4, y: 0.8 },
      ears: 1,                           // pricked at the landing
      eye: 1.2,
    };
  }
  return {
    name: 'apex',
    // everything gathered under the body — the hang frame
    feet: {
      frontNear: { x: FRONT_HIP.x + 3, y: -8 },
      frontFar: { x: FRONT_HIP.x + 1, y: -6.5 },
      backNear: { x: BACK_HIP.x - 2.5, y: -7.5 },
      backFar: { x: BACK_HIP.x - 0.5, y: -6 },
    },
    bodyY: -0.8,
    pitch: -0.02 + run * 0.02,
    head: { x: 0.4, y: -0.8 },
    ears: 0.55,
    eye: 1,
  };
}

/**
 * The shift flourish. `t` runs 1 → 0 across the pulse, so the deepest part of
 * the brace is the first thing drawn: the fox drops onto its haunches, plants
 * its forelegs and throws its head back, and unwinds from there. That gathering
 * is the anticipation the spin needs — without it the fox simply starts
 * rotating, and a spin with no wind-up reads as a glitch rather than a move.
 */
function bracePose(t) {
  const k = Math.max(0, Math.min(1, t));
  return {
    name: 'pulse',
    feet: {
      frontNear: { x: FRONT_HIP.x + 8 * k, y: 0 },
      frontFar: { x: FRONT_HIP.x + 5 * k, y: 0 },
      backNear: { x: BACK_HIP.x + 5.5 * k, y: 0 },
      backFar: { x: BACK_HIP.x + 3 * k, y: 0 },
    },
    bodyY: 6.5 * k,                      // haunches right down on the ground
    pitch: -0.26 * k,                    // chest low, head thrown back
    head: { x: -2.6 * k, y: -3.4 * k },
    ears: -1 * k + (1 - k),              // flattened, springing back as it ends
    eye: 1 + 0.35 * k,
  };
}

/**
 * Touchdown. `land` is the impulse the game decays after a landing, so this is
 * a crouch that unwinds by itself: forelegs planted out in front taking the
 * weight, hind legs still catching up, chest dropped between them.
 *
 * A uniform squash was doing this job before and it read as a dachshund — the
 * whole fox got shorter, legs included, instead of the legs folding.
 */
function landPose(land, run) {
  const k = Math.min(1, land / 0.34);
  return {
    name: 'land',
    feet: {
      frontNear: { x: FRONT_HIP.x + 6.5 * k, y: 0 },
      frontFar: { x: FRONT_HIP.x + 4 * k, y: 0 },
      backNear: { x: BACK_HIP.x - 3 * k, y: 0 },
      backFar: { x: BACK_HIP.x - 5.5 * k, y: -1.5 * k },
    },
    bodyY: 5.5 * k,
    pitch: 0.06 * k,
    head: { x: 1.4 + run, y: 2.6 * k },
    ears: 0.5 + 0.5 * (1 - k),
    eye: 1.15,
  };
}

// ---------------------------------------------------------------- legs

/** Body transform: the crouch and the pitch, about the fox's centre of mass. */
function applyBodyTransform(ctx, pose) {
  ctx.translate(PIVOT.x, PIVOT.y + pose.bodyY);
  ctx.rotate(pose.pitch);
  ctx.translate(-PIVOT.x, -PIVOT.y);
}

/** Where a hip ends up once the body has been crouched and pitched. */
function hipAfter(h, pose) {
  const c = Math.cos(pose.pitch);
  const s = Math.sin(pose.pitch);
  const dx = h.x - PIVOT.x;
  const dy = h.y - PIVOT.y;
  return {
    x: PIVOT.x + dx * c - dy * s,
    y: PIVOT.y + dx * s + dy * c + pose.bodyY,
  };
}

function drawLegs(ctx, pose, far) {
  const front = hipAfter(FRONT_HIP, pose);
  const back = hipAfter(BACK_HIP, pose);

  ctx.save();
  if (far) ctx.globalAlpha = 0.72;
  // The knee of a foreleg folds backwards and the hock of a hind leg forwards —
  // opposite signs, and getting them the same way round is what makes a drawn
  // quadruped look like it is standing on four of the same leg.
  drawLeg(ctx, front, pose.feet[far ? 'frontFar' : 'frontNear'], 1, far);
  drawLeg(ctx, back, pose.feet[far ? 'backFar' : 'backNear'], -1, far);
  ctx.restore();
}

/**
 * One leg, drawn hip-to-foot with a knee bulged out to the side. Not real IK:
 * the bend is a function of how much shorter than straight the leg has been
 * asked to be, which is enough to make a compressed leg look folded and a
 * reaching one look extended.
 */
function drawLeg(ctx, hip, foot, bend, far) {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  // Capped: a fully folded leg with an uncapped bulge draws a loop rather than
  // a knee, which is exactly what the deepest frame of the brace used to look
  // like.
  const slack = Math.max(0, LEG_LEN - d);
  const off = Math.min(4.6, 1.6 + slack * 0.5) * bend;

  const kx = hip.x + dx * 0.5 - (dy / d) * off;
  const ky = hip.y + dy * 0.5 + (dx / d) * off;

  // Orange at the haunch running down into magenta — the legs are the only part
  // of the fox that goes hot at the end.
  const grad = ctx.createLinearGradient(hip.x, hip.y, foot.x, foot.y);
  grad.addColorStop(0, PALETTE.backMid);
  grad.addColorStop(0.42, PALETTE.sock);
  grad.addColorStop(1, PALETTE.paw);

  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = far ? 2.6 : 3.2;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.quadraticCurveTo(kx, ky, foot.x, foot.y);
  ctx.stroke();

  ctx.fillStyle = PALETTE.paw;
  ctx.beginPath();
  ctx.ellipse(foot.x, foot.y + 0.3, 2.1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- head

function drawHead(ctx, pose) {
  const grad = ctx.createLinearGradient(0, -36, 0, -22);
  grad.addColorStop(0, PALETTE.backTop);
  grad.addColorStop(1, PALETTE.backMid);

  // The head rides the neck rather than being welded to the shoulders: lowered
  // and pushed forward at a run, thrown back and up in the brace.
  ctx.save();
  ctx.translate(pose.head.x, pose.head.y);

  drawEars(ctx, pose.ears);

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
  ctx.ellipse(19.8, -32.3, 1.6, 1.75 * pose.eye, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(20.35, -32.85, 0.58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.nose;
  ctx.beginPath();
  ctx.ellipse(28.5, -29.7, 1.15, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Tall narrow ears. `ears` runs +1 pricked to -1 flat back — the single clearest
 * read on what the fox is doing, and the cheapest to animate.
 */
function drawEars(ctx, ears) {
  const tilt = (ears - 1) * 0.24 + 0.1;

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
