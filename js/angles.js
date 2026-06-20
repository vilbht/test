// angles.js — geometry helpers and joint-angle extraction from pose landmarks.
//
// We work in the image plane (x, y normalized 0..1). For a side-on bike fit
// this 2D sagittal projection is exactly what we want.

// MediaPipe Pose (33-landmark) indices.
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT: 31, RIGHT_FOOT: 32,
};

// Landmark groups per side, used both for angle calc and for choosing which
// side of the body is facing the camera.
const SIDE = {
  left: {
    ear: LM.LEFT_EAR, shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW,
    wrist: LM.LEFT_WRIST, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE, heel: LM.LEFT_HEEL, foot: LM.LEFT_FOOT,
  },
  right: {
    ear: LM.RIGHT_EAR, shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW,
    wrist: LM.RIGHT_WRIST, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE, heel: LM.RIGHT_HEEL, foot: LM.RIGHT_FOOT,
  },
};

// Interior angle (degrees) at point b formed by segments b->a and b->c.
export function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return null;
  let cos = dot / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Angle of segment p1->p2 relative to the horizontal, 0..90 degrees.
export function angleFromHorizontal(p1, p2) {
  const dy = p2.y - p1.y;
  const dx = p2.x - p1.x;
  let deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (deg > 90) deg = 180 - deg;
  return deg;
}

// Sum of landmark visibility for a side — higher means that side faces the camera.
function sideVisibility(landmarks, sideKey) {
  const s = SIDE[sideKey];
  const idxs = [s.shoulder, s.hip, s.knee, s.ankle];
  return idxs.reduce((acc, i) => acc + (landmarks[i]?.visibility ?? 0), 0);
}

export function pickSide(landmarks) {
  return sideVisibility(landmarks, 'right') >= sideVisibility(landmarks, 'left')
    ? 'right'
    : 'left';
}

// Compute the full set of fit angles for a single frame.
// Returns null if key landmarks are not confidently visible.
export function computeFrameAngles(landmarks, sideKey) {
  const s = SIDE[sideKey];
  const get = (i) => landmarks[i];
  const need = [s.shoulder, s.hip, s.knee, s.ankle];
  for (const i of need) {
    if (!landmarks[i] || (landmarks[i].visibility ?? 0) < 0.4) return null;
  }

  const shoulder = get(s.shoulder);
  const elbow = get(s.elbow);
  const wrist = get(s.wrist);
  const hip = get(s.hip);
  const knee = get(s.knee);
  const ankle = get(s.ankle);
  const foot = get(s.foot);

  const kneeInterior = angleAt(hip, knee, ankle);          // 180 = straight leg
  const hipAngle = angleAt(shoulder, hip, knee);           // torso-to-thigh
  const elbowAngle = angleAt(shoulder, elbow, wrist);
  const shoulderAngle = angleAt(hip, shoulder, elbow);     // torso-to-upperarm
  const ankleAngle = foot ? angleAt(knee, ankle, foot) : null;
  const backAngle = angleFromHorizontal(hip, shoulder);    // torso vs horizontal

  return {
    kneeInterior,
    kneeFlexion: kneeInterior == null ? null : 180 - kneeInterior, // 0 = straight
    hipAngle,
    elbowAngle,
    shoulderAngle,
    ankleAngle,
    backAngle,
  };
}

// Skeleton bones (pairs of landmark indices) for drawing the side that faces camera.
export function boneList(sideKey) {
  const s = SIDE[sideKey];
  return [
    [s.ear, s.shoulder],
    [s.shoulder, s.elbow],
    [s.elbow, s.wrist],
    [s.shoulder, s.hip],
    [s.hip, s.knee],
    [s.knee, s.ankle],
    [s.ankle, s.foot],
    [s.ankle, s.heel],
  ];
}

export function sideLandmarks(sideKey) {
  return SIDE[sideKey];
}
