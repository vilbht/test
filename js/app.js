// app.js — wires the camera, pose detection, recording, results and history.

import { initPose, detect } from './pose.js';
import {
  computeFrameAngles, pickSide, boneList, sideLandmarks, LM,
} from './angles.js';
import {
  METRICS, DISCIPLINES, statusFor, buildRecommendations,
} from './fitModel.js';
import {
  loadSessions, saveSession, deleteSession, clearSessions, newId,
} from './storage.js';
import {
  SIZING_FIELDS, CURRENT_FIELDS, computeSizing,
} from './sizing.js';

// ---- DOM ----
const $ = (sel) => document.querySelector(sel);
const video = $('#video');
const canvas = $('#overlay');
const ctx = canvas.getContext('2d');

const els = {
  status: $('#status'),
  discipline: $('#discipline'),
  startCam: $('#startCam'),
  record: $('#record'),
  live: $('#liveAngles'),
  recordBar: $('#recordBar'),
  recordFill: $('#recordFill'),
  results: $('#results'),
  resultsBody: $('#resultsBody'),
  recs: $('#recs'),
  saveBtn: $('#saveBtn'),
  historyList: $('#historyList'),
  clearHistory: $('#clearHistory'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  // Sizing calculator
  sizeDiscipline: $('#sizeDiscipline'),
  sizeBody: $('#sizeBody'),
  sizeCurrent: $('#sizeCurrent'),
  calcBtn: $('#calcBtn'),
  sizeSaveBtn: $('#sizeSaveBtn'),
  sizeStatus: $('#sizeStatus'),
  sizeResults: $('#sizeResults'),
};

const RECORD_SECONDS = 15;

let running = false;        // camera/detection loop active
let recording = false;
let recordStart = 0;
let frames = [];            // collected per-frame angle objects during recording
let lastSummary = null;     // latest computed summary (for saving)
let lastSide = 'right';
let lastSizing = null;      // latest sizing result (for saving)

// ---- Tabs ----
els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => t.classList.remove('active'));
    els.panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $('#panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'history') renderHistory();
  });
});

// ---- Discipline selectors ----
Object.entries(DISCIPLINES).forEach(([key, d]) => {
  for (const sel of [els.discipline, els.sizeDiscipline]) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
});

// ---- Sizing calculator ----
buildSizingInputs();
els.calcBtn.addEventListener('click', onCalculate);
els.sizeSaveBtn.addEventListener('click', onSizeSave);

function buildSizingInputs() {
  els.sizeBody.innerHTML = Object.entries(SIZING_FIELDS).map(([key, f]) => fieldHtml('size', key, f)).join('');
  els.sizeCurrent.innerHTML = Object.entries(CURRENT_FIELDS).map(([key, f]) => fieldHtml('cur', key, f)).join('');
}

function fieldHtml(prefix, key, f) {
  const id = `${prefix}-${key}`;
  const labelUnit = f.unit ? ` <span class="unit">(${f.unit})</span>` : '';
  const req = f.required ? ' <span class="req">*</span>' : '';
  let control;
  if (f.select) {
    control = `<select id="${id}" data-key="${key}">${f.options.map((o) =>
      `<option value="${o.value}">${o.label}</option>`).join('')}</select>`;
  } else {
    control = `<input id="${id}" data-key="${key}" type="number" inputmode="decimal" step="0.1" min="0" placeholder="–" />`;
  }
  return `<label class="field" title="${f.help || ''}">
    <span>${f.label}${labelUnit}${req}</span>
    ${control}
  </label>`;
}

function readInputs() {
  const out = {};
  Object.keys(SIZING_FIELDS).forEach((k) => { out[k] = document.querySelector(`#size-${k}`).value; });
  Object.keys(CURRENT_FIELDS).forEach((k) => { out[k] = document.querySelector(`#cur-${k}`).value; });
  return out;
}

function onCalculate() {
  const inputs = readInputs();
  if (!inputs.inseam || parseFloat(inputs.inseam) <= 0) {
    setSizeStatus('Enter your inseam to calculate a fit.', true);
    els.sizeResults.classList.add('hidden');
    els.sizeSaveBtn.disabled = true;
    return;
  }
  const discipline = els.sizeDiscipline.value;
  const results = computeSizing(inputs, discipline);
  lastSizing = { inputs, discipline, results };
  renderSizing(lastSizing, els.sizeResults);
  els.sizeResults.classList.remove('hidden');
  els.sizeSaveBtn.disabled = false;
  setSizeStatus('Recommended starting fit below. Adjust in small steps.');
}

function renderSizing(sizing, host, embedded = false) {
  const rows = sizing.results.map((r) => {
    const rec = r.recommended != null ? `${r.recommended}${r.unit}` : (r.range ? '' : '–');
    const range = r.range ? `${r.range[0]}–${r.range[1]}${r.unit}` : (r.recommended != null ? '' : '');
    const target = r.range ? range : rec;
    const yours = r.current != null ? `${r.current}${r.unit}` : '–';
    let status = '';
    if (r.status === 'ok') status = '<span class="badge badge-ok">In range</span>';
    else if (r.status === 'adjust') status = `<span class="badge badge-adjust">${r.direction} ${r.delta}${r.unit}</span>`;
    return `<tr>
      <td><div class="metric-name">${r.label}</div><div class="metric-help">${r.note || ''}</div></td>
      <td class="num">${target || '–'}</td>
      <td class="num">${yours}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    ${embedded ? '' : '<div class="results-head"><h2>Recommended fit</h2></div>'}
    <table class="results-table">
      <thead><tr><th>Setting</th><th>Recommended</th><th>Your value</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="disclaimer">⚠️ These are conventional starting points (e.g. LeMond saddle height, inseam-based crank and frame). They are not a professional bike fit — set them up, then fine-tune in small steps and stop if anything hurts.</p>`;
}

function onSizeSave() {
  if (!lastSizing) return;
  const session = {
    id: newId(),
    date: new Date().toISOString(),
    type: 'sizing',
    discipline: lastSizing.discipline,
    disciplineLabel: DISCIPLINES[lastSizing.discipline].label,
    inputs: lastSizing.inputs,
    results: lastSizing.results,
  };
  saveSession(session);
  setSizeStatus('Saved to History.');
  els.sizeSaveBtn.textContent = 'Saved ✓';
  setTimeout(() => (els.sizeSaveBtn.textContent = 'Save to history'), 1500);
}

function setSizeStatus(msg, isError = false) {
  els.sizeStatus.textContent = msg;
  els.sizeStatus.classList.toggle('error', isError);
}

// ---- Camera + pose ----
els.startCam.addEventListener('click', startCamera);
els.record.addEventListener('click', toggleRecording);
els.saveBtn.addEventListener('click', onSave);
els.clearHistory.addEventListener('click', () => {
  if (confirm('Delete all saved sessions on this device?')) {
    clearSessions();
    renderHistory();
  }
});

async function startCamera() {
  setStatus('Loading pose model…');
  els.startCam.disabled = true;
  try {
    await initPose();
  } catch (e) {
    setStatus('Could not load the pose model. Check your connection and reload.', true);
    els.startCam.disabled = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    setStatus('Camera access was denied or unavailable.', true);
    els.startCam.disabled = false;
    return;
  }
  els.record.disabled = false;
  els.startCam.textContent = 'Camera running';
  running = true;
  setStatus('Stand your bike side-on to the camera, then start a recording while pedalling.');
  requestAnimationFrame(loop);
}

let lastTs = -1;
function loop(now) {
  if (!running) return;
  if (video.readyState >= 2) {
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ts = performance.now();
    if (ts !== lastTs) {
      lastTs = ts;
      const landmarks = detect(video, ts);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (landmarks) {
        const side = pickSide(landmarks);
        lastSide = side;
        const angles = computeFrameAngles(landmarks, side);
        drawSkeleton(landmarks, side, angles);
        updateLiveAngles(angles);
        if (recording && angles) frames.push(angles);
      }
    }
  }
  if (recording) {
    const elapsed = (performance.now() - recordStart) / 1000;
    els.recordFill.style.width = Math.min(100, (elapsed / RECORD_SECONDS) * 100) + '%';
    if (elapsed >= RECORD_SECONDS) stopRecording();
  }
  requestAnimationFrame(loop);
}

function toggleRecording() {
  if (recording) stopRecording();
  else startRecording();
}

function startRecording() {
  frames = [];
  recording = true;
  recordStart = performance.now();
  els.record.textContent = 'Stop';
  els.record.classList.add('recording');
  els.recordBar.classList.remove('hidden');
  setStatus(`Recording ${RECORD_SECONDS}s — keep pedalling at a steady cadence…`);
}

function stopRecording() {
  recording = false;
  els.record.textContent = 'Record';
  els.record.classList.remove('recording');
  els.recordFill.style.width = '0%';
  els.recordBar.classList.add('hidden');
  if (frames.length < 10) {
    setStatus('Not enough clean frames captured — make sure your full side profile is in view, then try again.', true);
    return;
  }
  const summary = summarise(frames);
  lastSummary = summary;
  showResults(summary, els.discipline.value);
  setStatus(`Analysis complete from ${frames.length} frames. Review results below.`);
}

// Reduce recorded frames into one summary value per metric.
function summarise(frames) {
  // Bottom dead centre = max leg extension = max knee interior angle.
  let bottom = frames[0], top = frames[0], minHip = frames[0];
  for (const f of frames) {
    if ((f.kneeInterior ?? -1) > (bottom.kneeInterior ?? -1)) bottom = f;
    if ((f.kneeInterior ?? 999) < (top.kneeInterior ?? 999)) top = f;
    if ((f.hipAngle ?? 999) < (minHip.hipAngle ?? 999)) minHip = f;
  }
  const mean = (key) => {
    const vals = frames.map((f) => f[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const summary = {};
  for (const [key, m] of Object.entries(METRICS)) {
    if (m.summary === 'bottom') summary[key] = bottom[key];
    else if (m.summary === 'top') summary[key] = top[key];
    else if (m.summary === 'minHip') summary[key] = minHip.hipAngle;
    else summary[key] = mean(key);
  }
  return summary;
}

// ---- Live overlay ----
function updateLiveAngles(angles) {
  if (!angles) { els.live.innerHTML = '<span class="muted">No rider detected…</span>'; return; }
  const items = [
    ['Knee', angles.kneeInterior],
    ['Hip', angles.hipAngle],
    ['Back', angles.backAngle],
    ['Elbow', angles.elbowAngle],
  ];
  els.live.innerHTML = items.map(([k, v]) =>
    `<span class="chip"><b>${k}</b> ${v == null ? '–' : Math.round(v)}°</span>`).join('');
}

function drawSkeleton(landmarks, side, angles) {
  const w = canvas.width, h = canvas.height;
  // bones
  ctx.lineWidth = Math.max(3, w / 320);
  ctx.strokeStyle = '#19c37d';
  for (const [a, b] of boneList(side)) {
    const pa = landmarks[a], pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  // joints
  const s = sideLandmarks(side);
  const joints = [s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle];
  ctx.fillStyle = '#fff';
  for (const i of joints) {
    const p = landmarks[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(4, w / 200), 0, Math.PI * 2);
    ctx.fill();
  }
  // knee angle label
  if (angles && angles.kneeInterior != null) {
    const k = landmarks[s.knee];
    label(ctx, `${Math.round(angles.kneeInterior)}°`, k.x * w + 10, k.y * h, w);
  }
}

function label(ctx, text, x, y, w) {
  ctx.font = `${Math.max(14, w / 45)}px system-ui, sans-serif`;
  const pad = 4;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - pad, y - 16, tw + pad * 2, 22);
  ctx.fillStyle = '#19c37d';
  ctx.fillText(text, x, y);
}

// ---- Results rendering ----
function showResults(summary, discipline, container) {
  const targets = DISCIPLINES[discipline].targets;
  const bodyEl = container ? container.querySelector('.results-body') : els.resultsBody;
  const recsEl = container ? container.querySelector('.recs') : els.recs;

  bodyEl.innerHTML = Object.entries(METRICS).map(([key, m]) => {
    const v = summary[key];
    const [lo, hi] = targets[key];
    const st = statusFor(v, targets[key]);
    return `<tr class="st-${st}">
      <td><div class="metric-name">${m.label}</div><div class="metric-help">${m.help}</div></td>
      <td class="num">${v == null ? '–' : Math.round(v)}${m.unit}</td>
      <td class="num">${lo}–${hi}${m.unit}</td>
      <td><span class="badge badge-${st}">${st === 'ok' ? 'In range' : st === 'unknown' ? 'No data' : st === 'low' ? 'Below' : 'Above'}</span></td>
    </tr>`;
  }).join('');

  const recs = buildRecommendations(summary, discipline);
  recsEl.innerHTML = recs.map((r) => {
    const sevClass = r.severity >= 1 ? 'sev-high' : r.severity > 0 ? 'sev-med' : 'sev-none';
    return `<div class="rec ${sevClass}">
      <div class="rec-head"><span class="rec-comp">${r.component}</span><span class="rec-action">${r.action}</span></div>
      <div class="rec-detail">${r.detail}</div>
    </div>`;
  }).join('');

  if (!container) els.results.classList.remove('hidden');
}

function onSave() {
  if (!lastSummary) return;
  const session = {
    id: newId(),
    date: new Date().toISOString(),
    discipline: els.discipline.value,
    disciplineLabel: DISCIPLINES[els.discipline.value].label,
    side: lastSide,
    summary: lastSummary,
  };
  saveSession(session);
  setStatus('Session saved to History.');
  els.saveBtn.textContent = 'Saved ✓';
  setTimeout(() => (els.saveBtn.textContent = 'Save to history'), 1500);
}

// ---- History ----
function renderHistory() {
  const sessions = loadSessions();
  if (sessions.length === 0) {
    els.historyList.innerHTML = '<p class="muted">No saved sessions yet. Run a capture and tap “Save to history”.</p>';
    return;
  }
  els.historyList.innerHTML = sessions.map((s) => {
    const d = new Date(s.date);
    const kind = s.type === 'sizing'
      ? '<span class="badge badge-kind">Sizing</span>'
      : `<span class="muted">${s.side || ''} side</span>`;
    return `<details class="hist-item">
      <summary>
        <span class="hist-date">${d.toLocaleString()}</span>
        <span class="badge badge-ok">${s.disciplineLabel}</span>
        ${kind}
        <button class="link-btn del" data-id="${s.id}">Delete</button>
      </summary>
      <div class="hist-detail" id="hd-${s.id}"></div>
    </details>`;
  }).join('');

  // Lazy-render details + wire deletes.
  sessions.forEach((s) => {
    const host = $('#hd-' + s.id);
    if (s.type === 'sizing') {
      renderSizing(s, host, true);
    } else {
      host.innerHTML = `<table class="results-table"><thead><tr><th>Metric</th><th>Value</th><th>Target</th><th>Status</th></tr></thead><tbody class="results-body"></tbody></table><div class="recs"></div>`;
      showResults(s.summary, s.discipline, host);
    }
  });
  els.historyList.querySelectorAll('.del').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      deleteSession(b.dataset.id);
      renderHistory();
    });
  });
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('error', isError);
}

// Initial paint.
renderHistory();
setStatus('Tap “Start camera” and allow access to begin.');
