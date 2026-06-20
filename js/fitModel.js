// fitModel.js — target angle ranges per discipline and the rule-based
// recommendation engine.
//
// Ranges are interior joint angles in degrees unless noted. They are based on
// widely cited bike-fit guidance (e.g. the Holmes 25-35 deg knee-flexion-at-
// bottom range for road) adapted per discipline. They are guidance, not a
// medical prescription — see the disclaimer in the UI.

// Each metric: how we summarise it over a pedal stroke + its target window.
// summary: 'bottom'  -> value sampled at bottom dead centre (max leg extension)
//          'top'     -> value at top dead centre (max flexion)
//          'minHip'  -> minimum hip angle over the stroke (most closed)
//          'mean'    -> average over the recording (torso / arms)
export const METRICS = {
  kneeFlexion: { label: 'Knee flexion at bottom', unit: '°', summary: 'bottom', help: 'Knee bend at the bottom of the pedal stroke. Primary driver of saddle height.' },
  hipAngle: { label: 'Hip angle (min)', unit: '°', summary: 'minHip', help: 'Most closed torso-to-thigh angle, at the top of the stroke. Reflects how cramped the front end is.' },
  backAngle: { label: 'Torso angle', unit: '°', summary: 'mean', help: 'Back angle from horizontal. Lower is more aggressive / aero.' },
  elbowAngle: { label: 'Elbow angle', unit: '°', summary: 'mean', help: 'A slight bend absorbs road shock; very straight usually means too much reach.' },
  shoulderAngle: { label: 'Shoulder angle', unit: '°', summary: 'mean', help: 'Torso-to-upper-arm angle. Informs reach.' },
  ankleAngle: { label: 'Ankle angle at bottom', unit: '°', summary: 'bottom', help: 'Foot orientation at the bottom of the stroke.' },
};

export const DISCIPLINES = {
  road: {
    label: 'Road',
    targets: {
      kneeFlexion: [25, 35],
      hipAngle: [42, 58],
      backAngle: [38, 52],
      elbowAngle: [150, 165],
      shoulderAngle: [78, 95],
      ankleAngle: [85, 110],
    },
  },
  tt: {
    label: 'TT / Triathlon',
    targets: {
      kneeFlexion: [20, 30],
      hipAngle: [30, 48],
      backAngle: [8, 24],
      elbowAngle: [90, 110],
      shoulderAngle: [80, 100],
      ankleAngle: [85, 110],
    },
  },
  mtb: {
    label: 'Mountain',
    targets: {
      kneeFlexion: [30, 40],
      hipAngle: [45, 62],
      backAngle: [42, 58],
      elbowAngle: [150, 168],
      shoulderAngle: [78, 98],
      ankleAngle: [85, 112],
    },
  },
  gravel: {
    label: 'Gravel',
    targets: {
      kneeFlexion: [28, 38],
      hipAngle: [44, 60],
      backAngle: [40, 56],
      elbowAngle: [150, 166],
      shoulderAngle: [78, 96],
      ankleAngle: [85, 110],
    },
  },
};

export function statusFor(value, range) {
  if (value == null) return 'unknown';
  const [lo, hi] = range;
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'ok';
}

// Build recommendations from out-of-range metrics. Each recommendation has a
// component, an action, and a rationale.
export function buildRecommendations(summary, discipline) {
  const targets = DISCIPLINES[discipline].targets;
  const recs = [];
  const s = (k) => statusFor(summary[k], targets[k]);

  // Saddle height — driven by knee flexion at the bottom of the stroke.
  const knee = s('kneeFlexion');
  if (knee === 'high') {
    recs.push({
      component: 'Saddle height',
      action: 'Raise the saddle',
      detail: `Knee is over-bent at the bottom of the stroke (${fmt(summary.kneeFlexion)}°, target ${targets.kneeFlexion[0]}–${targets.kneeFlexion[1]}°). Raise in ~5 mm steps until the knee opens up.`,
      severity: sev(summary.kneeFlexion, targets.kneeFlexion),
    });
  } else if (knee === 'low') {
    recs.push({
      component: 'Saddle height',
      action: 'Lower the saddle',
      detail: `Leg is over-extended at the bottom (${fmt(summary.kneeFlexion)}°, target ${targets.kneeFlexion[0]}–${targets.kneeFlexion[1]}°). Lower in ~5 mm steps. Watch for hips rocking, a sign the saddle is still too high.`,
      severity: sev(summary.kneeFlexion, targets.kneeFlexion),
    });
  }

  // Front-end height / reach — driven by hip closure and torso angle.
  const hip = s('hipAngle');
  if (hip === 'low') {
    recs.push({
      component: 'Front end',
      action: 'Raise the bars or shorten reach',
      detail: `Hip angle is very closed (${fmt(summary.hipAngle)}°, target ${targets.hipAngle[0]}–${targets.hipAngle[1]}°), which can limit power and breathing. Add spacers/raise the bars, or fit a shorter stem.`,
      severity: sev(summary.hipAngle, targets.hipAngle),
    });
  } else if (hip === 'high') {
    recs.push({
      component: 'Front end',
      action: 'Lower the bars for a more efficient position',
      detail: `Hip angle is quite open (${fmt(summary.hipAngle)}°, target ${targets.hipAngle[0]}–${targets.hipAngle[1]}°). If comfort allows, removing a spacer can improve aerodynamics and weight balance.`,
      severity: sev(summary.hipAngle, targets.hipAngle),
    });
  }

  const back = s('backAngle');
  if (back === 'high') {
    recs.push({
      component: 'Stem / reach',
      action: 'Increase reach or drop',
      detail: `Torso is more upright than typical for ${DISCIPLINES[discipline].label.toLowerCase()} (${fmt(summary.backAngle)}°, target ${targets.backAngle[0]}–${targets.backAngle[1]}°). A longer or lower stem flattens the back if comfortable.`,
      severity: sev(summary.backAngle, targets.backAngle),
    });
  } else if (back === 'low') {
    recs.push({
      component: 'Stem / reach',
      action: 'Reduce reach or raise the front',
      detail: `Torso is flatter than typical (${fmt(summary.backAngle)}°, target ${targets.backAngle[0]}–${targets.backAngle[1]}°). If you feel stretched or have lower-back strain, shorten the stem or raise the bars.`,
      severity: sev(summary.backAngle, targets.backAngle),
    });
  }

  const elbow = s('elbowAngle');
  if (elbow === 'high') {
    recs.push({
      component: 'Reach',
      action: 'Shorten the reach',
      detail: `Elbows are locked out straight (${fmt(summary.elbowAngle)}°, target ${targets.elbowAngle[0]}–${targets.elbowAngle[1]}°). A shorter stem restores a shock-absorbing bend.`,
      severity: sev(summary.elbowAngle, targets.elbowAngle),
    });
  } else if (elbow === 'low') {
    recs.push({
      component: 'Reach',
      action: 'Lengthen the reach',
      detail: `Elbows are very bent (${fmt(summary.elbowAngle)}°, target ${targets.elbowAngle[0]}–${targets.elbowAngle[1]}°), suggesting you are cramped. A slightly longer stem opens the cockpit.`,
      severity: sev(summary.elbowAngle, targets.elbowAngle),
    });
  }

  if (recs.length === 0) {
    recs.push({
      component: 'Overall',
      action: 'Dialled in',
      detail: 'All measured angles fall within the recommended ranges for this discipline. Nice fit!',
      severity: 0,
    });
  }

  // Most severe first.
  recs.sort((a, b) => b.severity - a.severity);
  return recs;
}

function fmt(v) {
  return v == null ? '–' : Math.round(v);
}

// Severity = how far outside the range, normalised by range width.
function sev(value, range) {
  if (value == null) return 0;
  const [lo, hi] = range;
  const width = Math.max(1, hi - lo);
  if (value < lo) return (lo - value) / width;
  if (value > hi) return (value - hi) / width;
  return 0;
}
