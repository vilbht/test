// fox.js — fox renderers behind one swappable interface.
//
//   draw(ctx, x, y, state)
//     x, y      feet-centre in screen space
//     state     { facing, phase, airborne, onGround, blocking, tail, squash,
//                 lean, speed, w, h }
//
// GreyboxFox exists so movement can be judged before any art does — if the
// running, jumping and tail whip do not read as good in flat rectangles, no
// amount of gradient work will save them. ProceduralFox drops in later without
// main.js changing anything but which constructor it calls.

export const GreyboxFox = {
  name: 'greybox',

  draw(ctx, x, y, s) {
    const { w, h, facing, squash, lean, airborne, blocking, tail } = s;

    drawTail(ctx, tail, '#7C6A9C', 7);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.6);
    ctx.scale(squash.sx, squash.sy);

    // body box, origin at the feet
    ctx.fillStyle = airborne ? '#C9A227' : '#B9B2C9';
    ctx.fillRect(-w / 2, -h, w, h);

    // facing wedge, so direction is readable at a glance
    ctx.fillStyle = '#2B1B44';
    ctx.beginPath();
    ctx.moveTo(facing * (w / 2), -h + 7);
    ctx.lineTo(facing * (w / 2 + 9), -h + 12);
    ctx.lineTo(facing * (w / 2), -h + 17);
    ctx.closePath();
    ctx.fill();

    // gait tell: a leg line whose phase shows the run cycle
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

/** The tail chain as a tapered polyline — the same data ProceduralFox fills. */
function drawTail(ctx, tail, colour, width) {
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

export { drawTail, drawShield };
