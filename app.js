/* app.js - openclaw soccer dashboard */

const DATA_ROOT = getDataRoot();
let currentData = null;

function getDataRoot() {
  const params = new URLSearchParams(window.location.search);
  const root = params.get('dataRoot') || 'data';
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(root)) return './data';
  return `./${root}`;
}

async function init() {
  try {
    const manifest = await fetchJSON(`${DATA_ROOT}/manifest.json`);
    buildDatePicker(manifest.dates || []);
    if (!manifest.latest) {
      showError('No dashboard dates available');
      return;
    }
    await loadDate(manifest.latest);
  } catch (e) {
    showError('Failed to load manifest: ' + e.message);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url + '?_=' + Date.now());
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadDate(date) {
  setActiveDate(date);
  setHeaderDate(date);
  showLoading();
  try {
    currentData = await fetchJSON(`${DATA_ROOT}/daily/${date}.json`);
    renderDailyBoard();
    renderDiagnostics();
  } catch (e) {
    showError(`No data for ${date}`);
  }
}

function buildDatePicker(dates) {
  const container = document.getElementById('date-picker');
  container.innerHTML = '';
  dates.forEach(date => {
    const btn = document.createElement('button');
    btn.className = 'date-btn';
    btn.textContent = fmtDate(date);
    btn.dataset.date = date;
    btn.onclick = () => loadDate(date);
    container.appendChild(btn);
  });
}

function setActiveDate(date) {
  document.querySelectorAll('.date-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.date === date);
  });
}

function setHeaderDate(date) {
  const el = document.getElementById('header-date');
  if (el) el.textContent = fmtDateLong(date);
}

function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m-1]} ${+d}`;
}

function fmtDateLong(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m-1]} ${+d}, ${y}`;
}

function showLoading() {
  document.getElementById('summary-pills').innerHTML = '';
  document.getElementById('games-list').innerHTML =
    '<div class="empty-state loading">Loading...</div>';
  document.getElementById('diag-content').innerHTML =
    '<div class="empty-state loading">Loading...</div>';
}

function showError(msg) {
  document.getElementById('games-list').innerHTML =
    `<div class="empty-state">${esc(msg)}</div>`;
  document.getElementById('summary-pills').innerHTML = '';
  document.getElementById('diag-content').innerHTML =
    `<div class="empty-state">${esc(msg)}</div>`;
}

function renderDailyBoard() {
  const d = currentData;
  renderSummaryPills(d.summary || {});
  renderGames(d.games || [], d.blocked || []);
}

function renderSummaryPills(s) {
  const el = document.getElementById('summary-pills');
  const ev = evTotal(s.positive_ev);
  const totalGames = s.total_games || 0;
  el.innerHTML = `
    <span class="pill pill-games">${totalGames} game${totalGames !== 1 ? 's' : ''}</span>
    ${s.moneyline_markets ? `<span class="pill pill-ml">${s.moneyline_markets} ML</span>` : ''}
    ${s.total_markets ? `<span class="pill pill-total">${s.total_markets} total</span>` : ''}
    ${s.total_model_only ? `<span class="pill pill-ml">${s.total_model_only} model-only</span>` : ''}
    ${s.blocked_games ? `<span class="pill pill-blocked">${s.blocked_games} blocked</span>` : ''}
    ${ev ? `<span class="pill pill-ev">+EV: ${ev}</span>` : ''}
  `;
}

function evTotal(ev) {
  if (!ev) return 0;
  return (ev.moneyline_games || 0) + (ev.total_games || 0);
}

function renderGames(games, blocked) {
  const list = document.getElementById('games-list');
  if (!games.length && !blocked.length) {
    list.innerHTML = '<div class="empty-state">No fixtures for this date</div>';
    return;
  }
  list.innerHTML = '';
  games.forEach(g => list.appendChild(buildGameCard(g)));

  if (blocked && blocked.length) {
    const hdr = document.createElement('div');
    hdr.className = 'blocked-header';
    hdr.textContent = `Blocked (${blocked.length})`;
    list.appendChild(hdr);
    blocked.forEach(b => list.appendChild(buildBlockedCard(b)));
  }
}

function buildGameCard(g) {
  const hasEv = hasPositiveEv(g);
  const card = el('div', `game-card${hasEv ? ' has-ev' : ''}`);
  card.appendChild(buildCardHeader(g));
  card.appendChild(buildCardMeta(g));
  card.appendChild(buildCardBody(g));
  return card;
}

function buildCardHeader(g) {
  const p = g.probabilities || {};
  const s = g.projected_score || {};
  const row = el('div', 'card-header');
  row.innerHTML = `
    <div class="team-block">
      <div class="team-name">${esc(g.home_team)}</div>
      <div class="team-prob">${pct(p.home_win)} win</div>
    </div>
    <div class="vs-block">
      <div class="projected-score">${fmt1(s.home)} - ${fmt1(s.away)}</div>
      <div class="draw-prob">Draw ${pct(p.draw)}</div>
    </div>
    <div class="team-block away">
      <div class="team-name">${esc(g.away_team)}</div>
      <div class="team-prob">${pct(p.away_win)} win</div>
    </div>
  `;
  return row;
}

function buildCardMeta(g) {
  const ms = g.market_status || {};
  const row = el('div', 'card-meta');
  row.innerHTML = `
    <span class="meta-tag"><strong>${esc(g.competition)}</strong></span>
    ${g.stage ? `<span class="meta-sep">/</span><span class="meta-tag">${esc(g.stage)}</span>` : ''}
    <div class="market-badges">
      ${marketBadge(ms.moneyline, 'ML')}
      ${marketBadge(ms.total, 'TOT')}
    </div>
  `;
  return row;
}

function marketBadge(status, label) {
  const cls = status === 'available' ? 'badge-available'
    : status === 'model_only' ? 'badge-model-only'
    : 'badge-missing';
  const suffix = status === 'available' ? 'OK'
    : status === 'model_only' ? '~'
    : '-';
  return `<span class="badge ${cls}">${label} ${suffix}</span>`;
}

function buildCardBody(g) {
  const body = el('div', 'card-body');
  body.appendChild(buildProbSection(g));
  body.appendChild(buildMarketSection(g));
  return body;
}

function buildProbSection(g) {
  const p = g.probabilities || {};
  const sec = el('div', 'card-section');
  const intelHtml = buildIntelHtml(g.intel_modifiers);
  sec.innerHTML = `
    <div class="section-label">Model Probabilities</div>
    ${probBar('HOM', p.home_win, 'home')}
    ${probBar('DRW', p.draw, 'draw')}
    ${probBar('AWY', p.away_win, 'away')}
    ${probBar('BTS', p.btts, 'btts')}
    <div class="score-band">Likely: <span>${esc(p.likely_score_band || '-')}</span></div>
    ${intelHtml}
  `;
  return sec;
}

function buildIntelHtml(modifiers) {
  if (!modifiers || !modifiers.length) return '';
  const items = modifiers.map(m => {
    const side = m.side || '';
    const scope = m.scope || m.type || '';
    const descriptor = m.reason || m.detail || m.key || '';
    const mult = m.multiplier != null ? ` x${m.multiplier}` : '';
    return `<div class="intel-item">
      <span class="intel-side">${esc(side)}</span>
      ${scope ? `<span class="intel-type">[${esc(scope)}${esc(mult)}]</span>` : ''}
      <span>${esc(descriptor)}</span>
    </div>`;
  }).join('');
  return `<div class="intel-list">${items}</div>`;
}

function probBar(label, val, cls) {
  const width = val != null ? Math.round(val * 100) : 0;
  return `
    <div class="prob-row">
      <span class="prob-label">${label}</span>
      <div class="prob-bar-wrap"><div class="prob-bar ${cls}" style="width:${width}%"></div></div>
      <span class="prob-val">${val != null ? pct(val) : '-'}</span>
    </div>`;
}

function buildMarketSection(g) {
  const sec = el('div', 'card-section');
  const ms = g.market_status || {};
  const markets = g.markets || {};
  let content = '';

  if (ms.moneyline === 'available' && markets.moneyline) {
    content += `<div class="section-label">3-Way</div>${buildMoneylineRows(markets.moneyline)}`;
  } else {
    content += `<div class="section-label">3-Way</div>
      <div class="market-row"><span class="market-key">No odds</span></div>`;
  }

  if (ms.total === 'available' && markets.total) {
    content += `<div class="section-label" style="margin-top:12px">Total</div>
      ${buildTotalRows(markets.total)}`;
  } else if (ms.total === 'model_only' && markets.total) {
    content += `<div class="section-label" style="margin-top:12px">Total</div>
      <div class="model-only-note">Model projection - No book odds</div>
      ${buildTotalModelOnlyRows(markets.total)}`;
  } else {
    content += `<div class="section-label" style="margin-top:12px">Total</div>
      <div class="market-row"><span class="market-key">No odds</span></div>`;
  }

  sec.innerHTML = content;
  return sec;
}

function buildMoneylineRows(ml) {
  const rows = [
    ['Home', ml.home_odds, ml.home_model_prob, ml.home_ev],
    ['Draw', ml.draw_odds, ml.draw_model_prob, ml.draw_ev],
    ['Away', ml.away_odds, ml.away_model_prob, ml.away_ev],
  ];
  const bestEv = Math.max(...rows.map(r => r[3] ?? -Infinity));
  return rows.map(([label, odds, prob, ev]) => {
    const isBest = ev != null && ev === bestEv && ev > 0;
    const evClass = isBest ? 'best' : ev > 0 ? 'positive' : ev < 0 ? 'negative' : 'null-val';
    return `<div class="market-row">
      <span class="market-key">${label} ${fmtOdds(odds)} / ${pct(prob)}</span>
      <span class="market-val ${evClass}">${ev != null ? evStr(ev) : '-'}</span>
    </div>`;
  }).join('');
}

function buildTotalRows(t) {
  const bestSide = String(t.best_side || '').toUpperCase();
  const overBest = bestSide === 'OVER' && (t.best_ev || 0) > 0;
  const underBest = bestSide === 'UNDER' && (t.best_ev || 0) > 0;
  const overClass = overBest ? 'best' : (t.over_ev || 0) > 0 ? 'positive' : (t.over_ev || 0) < 0 ? 'negative' : 'null-val';
  const underClass = underBest ? 'best' : (t.under_ev || 0) > 0 ? 'positive' : (t.under_ev || 0) < 0 ? 'negative' : 'null-val';
  return `
    <div class="market-row">
      <span class="market-key">O${t.line} ${fmtOdds(t.over_odds)} / ${pct(t.over_model_prob)}</span>
      <span class="market-val ${overClass}">${evStr(t.over_ev)}</span>
    </div>
    <div class="market-row">
      <span class="market-key">U${t.line} ${fmtOdds(t.under_odds)} / ${pct(t.under_model_prob)}</span>
      <span class="market-val ${underClass}">${evStr(t.under_ev)}</span>
    </div>`;
}

function buildTotalModelOnlyRows(t) {
  return `
    <div class="market-row">
      <span class="market-key">O${t.line} / model ${pct(t.over_model_prob)}</span>
      <span class="market-val null-val">no odds</span>
    </div>
    <div class="market-row">
      <span class="market-key">U${t.line} / model ${pct(t.under_model_prob)}</span>
      <span class="market-val null-val">no odds</span>
    </div>`;
}

function buildBlockedCard(b) {
  const card = el('div', 'game-card blocked-card');
  card.innerHTML = `
    <div class="card-header" style="grid-template-columns:1fr">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div class="team-name" style="font-size:13px">${esc(b.home_team)} vs ${esc(b.away_team)}</div>
          <div class="team-prob">${esc(b.competition)}${b.stage ? ' / ' + esc(b.stage) : ''}</div>
        </div>
        <span class="badge badge-blocked">Blocked</span>
      </div>
    </div>
    <div class="card-meta">
      <span class="meta-tag reason-text">${esc(b.reason)}</span>
    </div>`;
  return card;
}

function renderDiagnostics() {
  const container = document.getElementById('diag-content');
  if (!currentData) return;

  const a = currentData.audit || {};
  const cov = a.source_coverage || {};
  const blocked = currentData.blocked || [];

  container.innerHTML = `
    <div class="diag-run-label">
      Audit / ${esc(currentData.run_date)} / ${esc(a.schema_label || '')}
    </div>

    <div class="diag-grid">
      ${diagCard(cov.fixtures_found ?? '-', 'Fixtures Found', '')}
      ${diagCard(cov.modelable_games ?? '-', 'Modelable', 'amber')}
      ${diagCard(a.blocked_count ?? 0, 'Blocked', a.blocked_count ? 'red' : '')}
      ${diagCard(cov.moneyline_markets ?? 0, 'Moneyline Mkts', 'green')}
      ${diagCard(cov.total_markets ?? 0, 'Total Mkts', 'green')}
      ${diagCard(`${a.missing_moneyline ?? 0} / ${a.missing_total ?? 0}`, 'Missing ML / Tot', '')}
    </div>

    <div class="diag-section-title">Source Coverage</div>
    <div class="diag-card" style="margin-bottom:16px">
      ${Object.entries(cov).map(([k, v]) => `
        <div class="coverage-row">
          <span class="cov-key">${esc(k.replace(/_/g, ' '))}</span>
          <span class="cov-val">${esc(String(v))}</span>
        </div>`).join('') || '<div class="coverage-row"><span class="cov-key">No coverage data</span></div>'}
    </div>

    <div class="diag-section-title">Blocked Fixtures</div>
    <div class="diag-card" style="padding:0;margin-bottom:16px;overflow:hidden">
      ${blocked.length === 0
        ? '<div style="padding:14px 18px;font-family:var(--font-mono);font-size:11px;color:var(--muted-text)">None</div>'
        : `<table class="blocked-table">
          <thead><tr><th>Fixture</th><th>Competition</th><th>Reason</th></tr></thead>
          <tbody>
            ${blocked.map(b => `
              <tr>
                <td>${esc(b.home_team)} vs ${esc(b.away_team)}</td>
                <td>${esc(b.competition || '-')}</td>
                <td class="reason-cell">${esc(b.reason)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
    </div>

    <div class="diag-section-title">Warnings</div>
    <div class="diag-card">
      ${!a.warnings || a.warnings.length === 0
        ? '<div class="no-warnings">No warnings</div>'
        : a.warnings.map(w => `<div class="warning-item">${esc(w)}</div>`).join('')}
    </div>
  `;
}

function diagCard(val, label, colorClass) {
  return `<div class="diag-card">
    <div class="diag-val${colorClass ? ' ' + colorClass : ''}">${esc(String(val))}</div>
    <div class="diag-label">${esc(label)}</div>
  </div>`;
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(v) {
  return v != null ? Math.round(v * 100) + '%' : '-';
}

function fmt1(v) {
  return v != null ? v.toFixed(1) : '-';
}

function fmtOdds(v) {
  if (v == null) return '-';
  return v > 0 ? `+${v}` : `${v}`;
}

function evStr(v) {
  if (v == null) return '-';
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}u`;
}

function hasPositiveEv(g) {
  const markets = g.markets || {};
  const ml = markets.moneyline;
  if (ml && ((ml.home_ev || 0) > 0 || (ml.draw_ev || 0) > 0 || (ml.away_ev || 0) > 0)) return true;
  const tot = markets.total;
  if (tot && tot.market_available && ((tot.over_ev || 0) > 0 || (tot.under_ev || 0) > 0)) return true;
  return false;
}

document.addEventListener('DOMContentLoaded', init);
