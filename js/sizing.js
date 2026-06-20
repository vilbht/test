// sizing.js — no-camera bike sizing calculator.
//
// Turns body measurements (and optionally your current bike setup) into a
// recommended starting fit per discipline. Formulas are conventional
// starting-point estimates (LeMond saddle height, inseam-based crank/frame),
// not a professional fit — see the disclaimer in the UI.

import { DISCIPLINES } from './fitModel.js';

// Body / rider inputs. `inseam` is required; everything else refines the result.
export const SIZING_FIELDS = {
  inseam: { label: 'Inseam', unit: 'cm', required: true, help: 'Barefoot, book pulled up firmly to crotch, floor to top edge. Drives saddle height, crank and frame size.' },
  height: { label: 'Height', unit: 'cm', required: false, help: 'Used for frame size bands and to estimate bar width if shoulders are blank.' },
  torso: { label: 'Torso length', unit: 'cm', required: false, help: 'Sternal notch (top of breastbone) to top of inseam. With arm length, estimates reach.' },
  arm: { label: 'Arm length', unit: 'cm', required: false, help: 'Acromion (bony shoulder tip) to middle of closed fist. With torso, estimates reach.' },
  shoulderWidth: { label: 'Shoulder width', unit: 'cm', required: false, help: 'Bony point to bony point across the shoulders. Drives handlebar width.' },
  flexibility: {
    label: 'Flexibility', unit: '', required: false, select: true,
    options: [
      { value: 'medium', label: 'Average' },
      { value: 'low', label: 'Limited' },
      { value: 'high', label: 'Very flexible' },
    ],
    help: 'How comfortable you are folding forward. Affects the saddle-to-bar drop.',
  },
};

// Optional "my current bike" inputs — when provided, results show how far off
// you are and which way to move.
export const CURRENT_FIELDS = {
  saddleHeight: { label: 'Saddle height', unit: 'cm', help: 'Center of bottom bracket to top of saddle, measured along the seat tube.' },
  crankLength: { label: 'Crank length', unit: 'mm', help: 'Usually printed on the back of the crank arm.' },
  setback: { label: 'Saddle setback', unit: 'cm', help: 'Horizontal distance the saddle nose sits behind the bottom bracket.' },
  barDrop: { label: 'Saddle-to-bar drop', unit: 'cm', help: 'Vertical drop from saddle top to handlebar top.' },
  reach: { label: 'Saddle-to-bar reach', unit: 'cm', help: 'Horizontal distance from saddle nose to handlebar.' },
};

// Per-discipline factors. Keys match DISCIPLINES in fitModel.js.
export const SIZING_DISCIPLINE = {
  road:   { dropBar: true,  setback: [4, 7],  reachFactor: 0.47, drop: { low: [3, 5],  medium: [5, 8],  high: [8, 12] } },
  tt:     { dropBar: true,  setback: [0, 3],  reachFactor: 0.50, drop: { low: [8, 12], medium: [12, 16], high: [16, 22] } },
  mtb:    { dropBar: false, setback: [3, 6],  reachFactor: 0.45, drop: { low: [-2, 2], medium: [0, 4],  high: [3, 7] } },
  gravel: { dropBar: true,  setback: [4, 7],  reachFactor: 0.46, drop: { low: [2, 4],  medium: [4, 7],  high: [6, 10] } },
};

const CRANK_OPTIONS = [165, 167.5, 170, 172.5, 175];
const BAR_OPTIONS = [38, 40, 42, 44];

function snap(value, options) {
  return options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0]);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

// MTB frame size band from height (cm).
function mtbFrameBand(height) {
  if (height == null) return null;
  if (height < 165) return 'S (15–16")';
  if (height < 175) return 'M (17–18")';
  if (height < 185) return 'L (19")';
  return 'XL (21")';
}

// Compare a current value to a recommended point or range.
// Returns { delta, direction, status }.
function compareToTarget(current, recommended, range, kind) {
  if (current == null) return { delta: null, direction: null, status: null };
  // Use the range when available, otherwise the single recommended value.
  let lo, hi;
  if (range) { [lo, hi] = range; } else { lo = hi = recommended; }
  const tol = 0.05 * (recommended || hi || 1); // 5% tolerance for point targets
  if (current < lo - (range ? 0 : tol)) {
    return { delta: round1((range ? lo : recommended) - current), direction: raiseWord(kind, 'up'), status: 'adjust' };
  }
  if (current > hi + (range ? 0 : tol)) {
    return { delta: round1(current - (range ? hi : recommended)), direction: raiseWord(kind, 'down'), status: 'adjust' };
  }
  return { delta: 0, direction: 'in range', status: 'ok' };
}

function raiseWord(kind, dir) {
  if (kind === 'height' || kind === 'drop') return dir === 'up' ? 'raise' : 'lower';
  if (kind === 'setback' || kind === 'reach') return dir === 'up' ? 'move back / out' : 'move forward / in';
  return dir === 'up' ? 'increase' : 'decrease';
}

// Main entry point. inputs: numeric cm/mm values (+ flexibility string).
export function computeSizing(inputs, discipline) {
  const d = SIZING_DISCIPLINE[discipline];
  const rows = [];
  const inseam = num(inputs.inseam);
  const height = num(inputs.height);
  const torso = num(inputs.torso);
  const arm = num(inputs.arm);
  const shoulders = num(inputs.shoulderWidth);
  const flex = inputs.flexibility || 'medium';

  // Saddle height (cm) — LeMond/Hamley, BB center to saddle top along seat tube.
  if (inseam != null) {
    const rec = round1(inseam * 0.883);
    const range = [round1(inseam * 0.875), round1(inseam * 0.890)];
    rows.push({
      key: 'saddleHeight', label: 'Saddle height', unit: 'cm',
      recommended: rec, range,
      note: 'BB center → saddle top, along the seat tube.',
      ...compareToTarget(num(inputs.saddleHeight), rec, range, 'height'),
      current: num(inputs.saddleHeight),
    });

    // Crank length (mm).
    const rawCrank = inseam * 2.1;
    const crank = snap(rawCrank, CRANK_OPTIONS);
    rows.push({
      key: 'crankLength', label: 'Crank length', unit: 'mm',
      recommended: crank, range: null,
      note: `Computed ${Math.round(rawCrank)} mm → nearest common size.`,
      ...compareToTarget(num(inputs.crankLength), crank, null, 'other'),
      current: num(inputs.crankLength),
    });

    // Frame size.
    if (d.dropBar) {
      const frame = round1(inseam * 0.65);
      rows.push({
        key: 'frame', label: 'Frame size (seat tube, c–t)', unit: 'cm',
        recommended: frame, range: [round1(frame - 1.5), round1(frame + 1.5)],
        note: 'Drop-bar frame seat-tube length, center to top.',
        delta: null, direction: null, status: null, current: null,
      });
    } else {
      rows.push({
        key: 'frame', label: 'Frame size', unit: '',
        recommended: mtbFrameBand(height) || 'enter height', range: null,
        note: 'Mountain frame size band from height.',
        delta: null, direction: null, status: null, current: null,
      });
    }

    // Saddle setback (range).
    rows.push({
      key: 'setback', label: 'Saddle setback', unit: 'cm',
      recommended: null, range: d.setback,
      note: 'Saddle nose behind the bottom bracket (starting window).',
      ...compareToTarget(num(inputs.setback), (d.setback[0] + d.setback[1]) / 2, d.setback, 'setback'),
      current: num(inputs.setback),
    });
  }

  // Saddle-to-bar drop (range, by discipline + flexibility).
  const dropRange = d.drop[flex] || d.drop.medium;
  rows.push({
    key: 'barDrop', label: 'Saddle-to-bar drop', unit: 'cm',
    recommended: null, range: dropRange,
    note: `Based on ${flexLabel(flex)} flexibility.`,
    ...compareToTarget(num(inputs.barDrop), (dropRange[0] + dropRange[1]) / 2, dropRange, 'drop'),
    current: num(inputs.barDrop),
  });

  // Handlebar width (cm).
  if (d.dropBar) {
    let barRec;
    let note;
    if (shoulders != null) { barRec = snap(shoulders, BAR_OPTIONS); note = 'Matched to shoulder width.'; }
    else if (height != null) { barRec = snap(38 + (height - 165) * 0.1, BAR_OPTIONS); note = 'Estimated from height — measure shoulders for accuracy.'; }
    if (barRec != null) {
      rows.push({
        key: 'barWidth', label: 'Handlebar width (c–c)', unit: 'cm',
        recommended: barRec, range: null, note,
        delta: null, direction: null, status: null, current: null,
      });
    }
  }

  // Saddle-to-bar reach (needs torso + arm).
  if (torso != null && arm != null) {
    const rec = round1((torso + arm) * d.reachFactor);
    rows.push({
      key: 'reach', label: 'Saddle-to-bar reach', unit: 'cm',
      recommended: rec, range: [round1(rec - 1.5), round1(rec + 1.5)],
      note: 'Approximate starting reach from torso + arm.',
      ...compareToTarget(num(inputs.reach), rec, [round1(rec - 1.5), round1(rec + 1.5)], 'reach'),
      current: num(inputs.reach),
    });
  } else {
    rows.push({
      key: 'reach', label: 'Saddle-to-bar reach', unit: 'cm',
      recommended: null, range: null, note: 'Enter torso + arm length to estimate.',
      delta: null, direction: null, status: null, current: num(inputs.reach),
    });
  }

  return rows;
}

export function disciplineLabel(key) {
  return DISCIPLINES[key]?.label || key;
}

function flexLabel(flex) {
  return flex === 'low' ? 'limited' : flex === 'high' ? 'very flexible' : 'average';
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
