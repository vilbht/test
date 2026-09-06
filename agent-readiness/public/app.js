const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STEPS = [
  { id: 'agent', label: 'Fetch as agent' },
  { id: 'wellknown', label: 'robots + agent endpoints' },
  { id: 'human', label: 'Render as human' },
  { id: 'analyse', label: 'Score' },
];

// Dimensions the automated score cannot reach, but the client conversation must.
const BEYOND = [
  { t: 'Agent identity and trust', d: 'Today an agent looks like a bot. The merchant needs a way to tell a legitimate shopping agent acting for a real cardholder from a scraper or a fraud attempt, and to admit the first while blocking the second.', q: 'How would your WAF team recognise a good agent tomorrow?' },
  { t: 'Payment authentication under PSD2', d: 'Strong customer authentication assumes a human is present. An unattended agent purchase needs delegated authentication, a trusted-beneficiary path or an agent credential, plus a defined fallback when a step-up is unavoidable.', q: 'What happens when your agent buys at 02:00 and the issuer asks for a 3DS challenge?' },
  { t: 'Liability, fraud and disputes', d: 'If an agent buys the wrong size, the wrong item or at a stale price, who carries it? Agent-initiated transactions need to be identifiable in the authorisation message before anyone can price the risk.', q: 'Are agent-initiated orders flagged anywhere in your order or auth data?' },
  { t: 'Merchant of record and cross-border', d: 'Agents shop across borders by default. Which legal entity sells into CZ, PL or GR, whether offers.eligibleRegion is honest, and how VAT and OSS are handled all decide whether the order can even be accepted.', q: 'Which entity is the merchant of record when a German agent buys from your .cz storefront?' },
  { t: 'Post-purchase in the agent channel', d: 'Order status, tracking, cancellation and returns are where trust is won. If only a human can read the confirmation email, the agent cannot answer "where is my order?" and the shopper falls back to a call centre.', q: 'Can the agent that placed the order start a return?' },
  { t: 'Price, promotion and loyalty integrity', d: 'Agents compare on landed cost. Member prices, vouchers, instalments and bundle offers that only exist behind a login are invisible, so the merchant looks more expensive than it is.', q: 'How much of your basket value depends on promotions an agent cannot see?' },
  { t: 'Agent traffic economics and observability', d: 'Agent traffic converts differently, hits deep pages hard and skips your merchandising. Most retailers cannot yet separate it in analytics, so they cannot see it growing or attribute revenue to it.', q: 'Can you report agent-referred revenue this quarter?' },
  { t: 'Data rights and brand control', d: 'Feeds and structured data are also a licensing decision. What an assistant may reproduce, how product claims are represented, and how errors get corrected are brand questions, not just technical ones.', q: 'Who signs off on how your products are described inside an assistant?' },
  { t: 'European regulation', d: 'The European Accessibility Act has applied to e-commerce since June 2025, GPSR requires safety information with every listing, and consumer law requires clear pricing and the 14-day withdrawal right. All three push in the same direction as agent readability.', q: 'Is your accessibility remediation programme aware it is also your agent programme?' },
  { t: 'Internal ownership', d: 'Structured data sits with SEO, checkout with e-commerce, authentication with payments, bot policy with security. Agentic commerce is the first initiative that needs all four in one room, and usually nobody owns it.', q: 'Who in your organisation owns agentic commerce this year?' },
];

// ---------- form ----------
fetch('/api/markets').then((r) => r.json()).then((markets) => {
  const sel = $('#market');
  sel.innerHTML = '<option value="">Detect market</option>' + markets.map((m) => `<option value="${m.code}">${esc(m.name)} (${m.currency})</option>`).join('');
});

document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', (e) => {
  e.preventDefault();
  $('#url').value = c.dataset.url;
  $('#scanForm').requestSubmit();
}));

$('#scanForm').addEventListener('submit', (e) => { e.preventDefault(); runScan(); });

function setSteps(activeId, doneIds = []) {
  $('#steps').innerHTML = STEPS.map((s) => {
    const cls = doneIds.includes(s.id) ? 'done' : s.id === activeId ? 'active' : '';
    return `<span class="step ${cls}"><i class="dot"></i>${esc(s.label)}</span>`;
  }).join('');
}

function runScan() {
  const url = $('#url').value.trim();
  if (!url) return;
  const params = new URLSearchParams({ url, market: $('#market').value, render: $('#render').checked ? '1' : '0' });
  $('#error').classList.remove('on');
  $('#report').hidden = true;
  $('#progress').classList.add('on');
  $('#scanBtn').disabled = true;
  const done = [];
  setSteps('agent');

  const es = new EventSource('/api/scan?' + params);
  es.addEventListener('progress', (ev) => {
    const p = JSON.parse(ev.data);
    setSteps(p.step, done);
    if (!done.includes(p.step)) done.push(p.step);
  });
  es.addEventListener('report', (ev) => {
    es.close();
    $('#progress').classList.remove('on');
    $('#scanBtn').disabled = false;
    render(JSON.parse(ev.data));
  });
  es.addEventListener('error', (ev) => {
    es.close();
    $('#progress').classList.remove('on');
    $('#scanBtn').disabled = false;
    let msg = 'The scan could not be completed. Check the URL and your network connection.';
    try { msg = JSON.parse(ev.data).error; } catch { /* connection-level error */ }
    $('#error').textContent = msg;
    $('#error').classList.add('on');
  });
}

// ---------- rendering ----------
const scoreColour = (v) => (v >= 80 ? 'var(--pass)' : v >= 60 ? 'var(--mc-yellow)' : v >= 35 ? 'var(--mc-orange)' : 'var(--mc-red)');

function ring(score) {
  const r = 58, c = 2 * Math.PI * r;
  return `<div class="ring">
    <svg width="132" height="132">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="${scoreColour(score)}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition:stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" data-ring="${c - (c * score) / 100}"/>
    </svg>
    <div class="ring-val"><b>${score}</b><span>/ 100</span></div>
  </div>`;
}

function jsonHtml(obj) {
  if (!obj || !Object.keys(obj).length) return `<span class="empty">// The agent extracted nothing. There is no machine-readable product here.</span>`;
  const json = JSON.stringify(obj, null, 2);
  return esc(json)
    .replace(/&quot;([^&]+?)&quot;(\s*:)/g, '<span class="k">"$1"</span>$2')
    .replace(/:\s&quot;(.*?)&quot;/g, ': <span class="s">"$1"</span>')
    .replace(/:\s(-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
}

function render(r) {
  const s = r.sideBySide;
  const gapCount = s.rows.filter((x) => !x.ok).length;

  const html = `
  <section class="section">
    <div class="card scorecard">
      ${ring(r.score)}
      <div class="score-main">
        <span class="tier tier-${r.tier.id}">${esc(r.tier.label)}</span>
        <h2>${esc(hostOf(r.url))}</h2>
        <p>${esc(r.tier.summary)}</p>
        <p class="score-url" style="margin-top:8px">${esc(r.url)} &middot; ${esc(r.market.name)} &middot; scanned ${new Date(r.scannedAt).toLocaleString()} in ${(r.durationMs / 1000).toFixed(1)}s${r.diagnostics.renderAvailable ? '' : ' &middot; browser render unavailable'}</p>
      </div>
      <div class="score-actions">
        <button class="btn btn-ghost" onclick="window.print()">Export PDF</button>
        <button class="btn btn-ghost" id="copyBtn">Copy summary</button>
        <button class="btn btn-ghost" id="jsonBtn">Download JSON</button>
      </div>
    </div>

    <div class="pillars">
      ${r.pillars.map((p) => `
        <a class="card pillar" href="#p-${p.id}">
          <h3>${esc(p.name)}</h3>
          <div class="val" style="color:${scoreColour(p.score)}">${p.score}</div>
          <div class="meter"><i data-w="${p.score}" style="width:0;background:${scoreColour(p.score)}"></i></div>
          <div class="blurb" style="margin-top:10px">${esc(p.blurb)}</div>
          <div class="sub">${p.checks.filter((c) => c.status === 'fail').length} blocking &middot; ${p.checks.filter((c) => c.status === 'partial').length} partial &middot; weight ${p.weight}%</div>
        </a>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>What a human sees vs what an agent sees</h2>
      <p>Same URL, two clients. ${gapCount} of ${s.rows.length} attributes are missing on the agent side.</p>
    </div>
    <div class="sbs">
      <div class="card pane pane-human">
        <div class="pane-head"><h3>Human &middot; browser</h3><span class="tag">Chromium, JavaScript on</span></div>
        ${s.screenshot ? `<img class="shot" src="${s.screenshot}" alt="Rendered page as a shopper sees it">`
          : `<div class="shot-empty">${esc(s.renderNote || 'No browser render for this scan.')}<br><br>Enable "Browser render" to capture the shopper view.</div>`}
        <div class="pane-stats">
          <span><b>${s.humanSummary.words ?? '—'}</b> words</span>
          <span><b>${s.humanSummary.images ?? '—'}</b> images</span>
          ${s.humanSummary.buttons != null ? `<span><b>${s.humanSummary.buttons}</b> controls</span>` : ''}
          ${s.humanSummary.ms ? `<span><b>${(s.humanSummary.ms / 1000).toFixed(1)}s</b> to render</span>` : ''}
        </div>
      </div>
      <div class="card pane pane-agent">
        <div class="pane-head"><h3>Agent &middot; raw fetch</h3><span class="tag">no JavaScript engine</span></div>
        <pre class="payload">${jsonHtml(r.agentPayload)}</pre>
        <div class="pane-stats">
          <span><b>HTTP ${s.agentSummary.status}</b></span>
          <span><b>${s.agentSummary.words}</b> words</span>
          <span><b>${Math.round(s.agentSummary.bytes / 1024)} KB</b></span>
          <span><b>${s.agentSummary.ms} ms</b></span>
          <span>markup: <b>${esc(s.agentSummary.structured)}</b></span>
        </div>
      </div>
    </div>

    ${s.delta ? (() => {
      const kept = Math.round(s.delta.textRatio * 100);
      const good = s.delta.textRatio >= 0.8;
      const head = good
        ? `${kept}% of what the browser renders is already in the server HTML.`
        : `Only ${kept}% of what the browser renders reaches an agent.`;
      const body = s.delta.missingHighlights.join(' ')
        || 'Content is server-rendered, which is exactly what agents need. Nothing material is hidden behind JavaScript.';
      return `<div class="gapbar ${good ? 'good' : ''}"><div><b>${head}</b>${esc(body)}</div></div>`;
    })() : ''}

    <div class="card" style="margin-top:16px;overflow:hidden">
      <table class="cmp">
        <thead><tr><th></th><th>Attribute</th><th>Human sees</th><th>Agent gets</th></tr></thead>
        <tbody>
          ${s.rows.map((row) => `<tr class="${row.ok ? '' : 'gap'}">
            <td class="tick">${row.ok ? '<span style="color:var(--pass)">&#10003;</span>' : '<span style="color:var(--mc-red)">&#10007;</span>'}</td>
            <td class="lbl">${esc(row.label)}</td>
            <td>${esc(row.human)}</td>
            <td class="agent">${esc(row.agent)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Where to start</h2><p>Ranked by points of overall score unlocked.</p></div>
    <div class="card prio">
      ${r.priorities.map((p) => `<div class="prio-item">
        <div class="prio-num"></div>
        <div>
          <span class="where">${esc(p.pillar)}</span>
          <h4>${esc(p.label)}</h4>
          <p>${esc(p.fix || '')}</p>
          ${p.talkTrack ? `<div class="talk"><b>In the meeting:</b> ${esc(p.talkTrack)}</div>` : ''}
        </div>
        <div class="gain"><b>+${p.gain}</b>points</div>
      </div>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Full diagnostic</h2><p>Every check, with the evidence behind it.</p></div>
    ${r.pillars.map((p, i) => `
      <details class="card pillar-block" id="p-${p.id}" ${i === 0 ? 'open' : ''}>
        <summary>
          <svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m9 6 6 6-6 6"/></svg>
          <div><h3>${esc(p.name)}</h3><span class="count">${p.checks.length} checks &middot; ${p.weight}% of the score</span></div>
          <span class="score-pill" style="color:${scoreColour(p.score)}">${p.score}</span>
        </summary>
        ${p.checks.map((c) => `
          <div class="check">
            <div><span class="status-dot st-${c.status}"></span></div>
            <div>
              <h4>${esc(c.label)} <span class="badge b-${c.status}">${c.status === 'manual' ? 'ask the client' : c.status}</span></h4>
              <div class="duo">
                <div class="h"><span class="lab">Human</span>${esc(c.human || '—')}</div>
                <div class="a"><span class="lab">Agent</span>${esc(c.agent || '—')}</div>
              </div>
              ${c.fix ? `<div class="fix"><b>Fix:</b> ${esc(c.fix)}</div>` : ''}
              ${c.talkTrack ? `<div class="talk"><b>In the meeting:</b> ${esc(c.talkTrack)}</div>` : ''}
            </div>
          </div>`).join('')}
      </details>`).join('')}
  </section>

  <section class="section">
    <div class="section-head"><h2>Market context &mdash; ${esc(r.market.name)}</h2><p>What local payment behaviour does to an agentic flow.</p></div>
    <div class="card market-note">
      <div class="stripe" style="height:auto;align-self:stretch"></div>
      <div>
        <div class="flag">Expected locally: ${esc(r.market.methods.join(', '))} &middot; ${esc(r.market.currency)}</div>
        <p style="margin:6px 0 0;color:var(--ink-2)">${esc(r.market.note)}</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Beyond the score</h2><p>Dimensions no crawler can measure, and that decide whether this ever goes live.</p></div>
    <div class="grid2">
      ${BEYOND.map((b) => `<div class="card tile">
        <h4><span class="stripe"></span>${esc(b.t)}</h4>
        <p>${esc(b.d)}</p>
        <p class="q">Ask: &ldquo;${esc(b.q)}&rdquo;</p>
      </div>`).join('')}
    </div>
  </section>`;

  const report = $('#report');
  report.innerHTML = html;
  report.hidden = false;

  requestAnimationFrame(() => {
    document.querySelectorAll('[data-ring]').forEach((el) => { el.style.strokeDashoffset = el.dataset.ring; });
    document.querySelectorAll('.meter i').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  });

  $('#copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(summaryText(r)).then(() => {
      $('#copyBtn').textContent = 'Copied';
      setTimeout(() => ($('#copyBtn').textContent = 'Copy summary'), 1600);
    });
  });
  $('#jsonBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(r, (k, v) => (k === 'screenshot' ? undefined : v), 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agent-readiness-${hostOf(r.url)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  report.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function summaryText(r) {
  return [
    `Agent readiness - ${hostOf(r.url)} (${r.market.name})`,
    `Overall: ${r.score}/100 - ${r.tier.label}`,
    '',
    ...r.pillars.map((p) => `${p.name}: ${p.score}/100`),
    '',
    'Top actions:',
    ...r.priorities.slice(0, 5).map((p, i) => `${i + 1}. [${p.pillar}] ${p.label} (+${p.gain} pts) - ${p.fix || ''}`),
    '',
    `Scanned ${new Date(r.scannedAt).toLocaleString()} - ${r.url}`,
  ].join('\n');
}
