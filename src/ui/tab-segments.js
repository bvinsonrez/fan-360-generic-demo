// Tab 6: Segment Builder. Filters on the left; live count, consent waterfall and projections on the right.
// Every figure is rendered from the shared formatters and the segments.js display strings, never re-scaled here.
const { CHANNELS, PLANS, REGIONS } = require('../config');
const { scaled, fmtCount } = require('../format');
const {
  DEFAULT_FILTERS, applyFilters, consentWaterfall, projectResults, projectionDisplay,
  createSegmentState, setFilter, assumptionText, combineProjections,
} = require('../segments');
const { EMPTY_TEXT } = require('./charts');

const PLAN_IDS_2026 = ['choice', 'reserved', 'starter', 'ballpark_pass', 'triple_play', 'single', 'none'];
const DUPLICATE_LABEL = 'Duplicate contacts (already merged by linkage)';

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Control specs grouped by rail section. Every DEFAULT_FILTERS key appears exactly once.
const SECTIONS = [
  { title: 'Ticketing', controls: [
    { key: 'plan2026', kind: 'multi', label: '2026 plan', options: PLAN_IDS_2026.map((id) => ({ value: id, label: PLANS[id] })) },
    { key: 'seasonsActiveMin', kind: 'number', label: 'Seasons active, at least (of 3)', blank: 0, min: 0, max: 3 },
    { key: 'games2026Min', kind: 'number', label: '2026 games attended, at least', min: 0 },
    { key: 'games2026Max', kind: 'number', label: '2026 games attended, at most', min: 0 },
    { key: 'attendanceChangeMaxPct', kind: 'number', label: 'Attendance change 2025 to 2026, at or below (%)' },
    { key: 'keptTransferring2026', kind: 'check', label: 'Kept transferring tickets in 2026' },
    { key: 'neverOwnTicket', kind: 'check', label: 'Never owned a ticket of their own' },
    { key: 'singleGameBefore2026', kind: 'check', label: 'Bought single games before 2026' },
    { key: 'premiumViaTransferOrGroup', kind: 'check', label: 'Reached premium areas by transfer or group' },
    { key: 'excludePremiumOwn', kind: 'check', label: 'Never owned premium seats' },
  ] },
  { title: 'F&B', controls: [
    { key: 'fnbPercentile2026Min', kind: 'number', label: '2026 F&B spend percentile, at least', min: 0, max: 100 },
    { key: 'retailOrApp2026', kind: 'check', label: 'Bought from Team Store or team app in 2026' },
  ] },
  { title: 'Groups', controls: [
    { key: 'groupOutingsMin', kind: 'number', label: 'Group outings, at least', blank: 0, min: 0 },
  ] },
  { title: 'Engagement', controls: [
    { key: 'surveySatMax', kind: 'number', label: 'Latest survey satisfaction, at or below' },
  ] },
  { title: 'Household', controls: [
    { key: 'kidsClubHousehold', kind: 'check', label: 'Household has a Kids Club child (parents only)' },
    { key: 'regions', kind: 'multi', label: 'Region', options: REGIONS.map((r) => ({ value: r, label: r })) },
  ] },
];

const CONTROL_BY_KEY = {};
for (const s of SECTIONS) for (const c of s.controls) CONTROL_BY_KEY[c.key] = c;

const planName = (id) => PLANS[id] || id;

// Short text for each active filter, used for the chips shown after opening from a recommendation.
function describeFilters(f) {
  const out = [];
  if (f.plan2026.length) out.push(`2026 plan: ${f.plan2026.map(planName).join(', ')}`);
  if (f.seasonsActiveMin > 0) out.push(`Seasons active at least ${f.seasonsActiveMin}`);
  if (f.games2026Min !== null && f.games2026Min !== undefined) out.push(`2026 games at least ${f.games2026Min}`);
  if (f.games2026Max !== null && f.games2026Max !== undefined) out.push(`2026 games at most ${f.games2026Max}`);
  if (f.attendanceChangeMaxPct !== null && f.attendanceChangeMaxPct !== undefined) out.push(`Attendance change at or below ${f.attendanceChangeMaxPct}%`);
  if (f.fnbPercentile2026Min !== null && f.fnbPercentile2026Min !== undefined) out.push(`F&B percentile at least ${f.fnbPercentile2026Min}`);
  if (f.keptTransferring2026) out.push('Kept transferring in 2026');
  if (f.retailOrApp2026) out.push('Team Store or app buyer in 2026');
  if (f.groupOutingsMin > 0) out.push(`Group outings at least ${f.groupOutingsMin}`);
  if (f.neverOwnTicket) out.push('Never owned a ticket');
  if (f.singleGameBefore2026) out.push('Single-game buyer before 2026');
  if (f.premiumViaTransferOrGroup) out.push('Premium via transfer or group');
  if (f.excludePremiumOwn) out.push('Never owned premium seats');
  if (f.surveySatMax !== null && f.surveySatMax !== undefined) out.push(`Survey satisfaction at or below ${f.surveySatMax}`);
  if (f.kidsClubHousehold) out.push('Kids Club household (parents only)');
  if (f.regions.length) out.push(`Region: ${f.regions.join(', ')}`);
  return out;
}

// Runs one channel through consent and projection; strings come straight from segments.js.
function channelResult(matchedFans, channelId) {
  const w = consentWaterfall(matchedFans, channelId);
  const proj = projectResults(w.eligible, [channelId]);
  return { id: channelId, w, proj, disp: projectionDisplay(proj) };
}

function renderWaterfall(parent, r, empty) {
  const { w } = r;
  const sum = w.display.parts.reduce((a, b) => a + b, 0) || 1;
  const names = ['Eligible after consent', ...w.steps.map((s) => (s.id === 'duplicate' ? DUPLICATE_LABEL : s.label))];
  const box = node('div', 'wf-box');
  if (empty) {
    box.appendChild(node('div', 'chart-empty', EMPTY_TEXT));
  } else {
    const bar = node('div', 'parts-bar');
    w.display.parts.forEach((p, i) => {
      const seg = node('div', `parts-seg ${i === 0 ? 'wf-eligible' : 'wf-removed'}`);
      seg.style.flexGrow = String(Math.max(p, sum * 0.01));
      seg.setAttribute('title', `${names[i]}: ${w.display.labels[i]}`);
      bar.appendChild(seg);
    });
    box.appendChild(bar);
  }
  parent.appendChild(box);
  const list = node('ul', 'parts-list');
  names.forEach((name, i) => {
    const li = node('li', 'parts-item');
    li.appendChild(node('span', `parts-swatch ${i === 0 ? 'wf-eligible' : 'wf-removed'}`));
    li.appendChild(node('span', 'parts-name', i === 0 ? name : `Removed: ${name}`));
    li.appendChild(node('span', i === 0 ? 'parts-value wf-eligible-value' : 'parts-value', i === 0 ? fmtCount(scaled(w.eligible)) : w.display.labels[i]));
    list.appendChild(li);
  });
  parent.appendChild(list);
}

function renderProjection(parent, disp, empty) {
  if (empty) parent.appendChild(node('div', 'chart-empty', EMPTY_TEXT));
  const table = node('div', 'proj-rows');
  for (const row of disp.rows) {
    const line = node('div', `proj-row${row.label === 'Projected revenue' ? ' proj-revenue' : ''}`);
    line.appendChild(node('span', 'proj-label', row.label));
    line.appendChild(node('span', 'proj-value', row.value));
    table.appendChild(line);
  }
  parent.appendChild(table);
}

function renderSegments(container, ctx) {
  const { model, state } = ctx;
  if (!state.segment) state.segment = createSegmentState();
  if (!state.savedSegments) state.savedSegments = [];

  container.textContent = '';
  const layout = node('div', 'seg-layout');
  const rail = node('aside', 'seg-rail');
  const main = node('div', 'seg-main');
  layout.appendChild(rail);
  layout.appendChild(main);
  container.appendChild(layout);

  const banner = node('div', 'seg-banner-slot');
  const countBox = node('div', 'seg-count-box');
  const resultsPanel = node('div', 'seg-panel');
  const savedBox = node('div', 'seg-saved');
  const nameInput = node('input', 'seg-name');

  function onFilter(key, value) {
    state.segment = setFilter(state.segment, key, value);
    paintResults();
  }

  function buildControl(c) {
    const f = state.segment.filters;
    const wrap = node('div', 'ctl');
    if (c.kind === 'check') {
      const label = node('label', 'ctl-check');
      const box = node('input', 'ctl-input');
      box.type = 'checkbox';
      box.checked = !!f[c.key];
      box.setAttribute('data-filter', c.key);
      box.addEventListener('change', () => onFilter(c.key, !!box.checked));
      label.appendChild(box);
      label.appendChild(node('span', 'ctl-text', c.label));
      wrap.appendChild(label);
    } else if (c.kind === 'number') {
      const label = node('label', 'ctl-num');
      label.appendChild(node('span', 'ctl-text', c.label));
      const inp = node('input', 'ctl-input ctl-number');
      inp.type = 'number';
      if (c.min !== undefined) inp.min = String(c.min);
      if (c.max !== undefined) inp.max = String(c.max);
      const cur = f[c.key];
      inp.value = cur === null || cur === undefined || cur === c.blank ? '' : String(cur);
      inp.setAttribute('data-filter', c.key);
      inp.setAttribute('aria-label', c.label);
      inp.addEventListener('input', () => {
        const raw = String(inp.value).trim();
        if (raw === '') { onFilter(c.key, c.blank !== undefined ? c.blank : null); return; }
        const v = Number(raw);
        if (Number.isFinite(v)) onFilter(c.key, v);
      });
      label.appendChild(inp);
      wrap.appendChild(label);
    } else {
      wrap.appendChild(node('div', 'ctl-text ctl-group-label', c.label));
      const opts = node('div', 'ctl-multi');
      for (const o of c.options) {
        const label = node('label', 'ctl-check');
        const box = node('input', 'ctl-input');
        box.type = 'checkbox';
        box.checked = f[c.key].includes(o.value);
        box.setAttribute('data-filter', c.key);
        box.setAttribute('data-value', o.value);
        box.addEventListener('change', () => {
          const cur = state.segment.filters[c.key];
          const next = box.checked ? cur.concat(o.value) : cur.filter((x) => x !== o.value);
          onFilter(c.key, next);
        });
        label.appendChild(box);
        label.appendChild(node('span', 'ctl-text', o.label));
        opts.appendChild(label);
      }
      wrap.appendChild(opts);
    }
    return wrap;
  }

  function paintRail() {
    rail.textContent = '';
    const head = node('div', 'rail-head');
    head.appendChild(node('h2', 'rail-title', 'Filters'));
    const reset = node('button', 'btn btn-quiet', 'Reset filters');
    reset.type = 'button';
    reset.addEventListener('click', onReset);
    head.appendChild(reset);
    rail.appendChild(head);
    for (const s of SECTIONS) {
      const sec = node('section', 'rail-section');
      sec.appendChild(node('h3', 'rail-section-title', s.title));
      for (const c of s.controls) sec.appendChild(buildControl(c));
      rail.appendChild(sec);
    }
  }

  function onReset() {
    state.segment = { ...createSegmentState(), channelIds: state.segment.channelIds.slice() };
    paintRail();
    paintResults();
  }

  function onChannel(id) {
    const cur = state.segment.channelIds;
    let next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id);
    if (!next.length) next = cur;
    state.segment = { ...state.segment, channelIds: CHANNELS.map((c) => c.id).filter((x) => next.includes(x)) };
    paintResults();
  }

  function onSave() {
    const matched = applyFilters(model.fans, state.segment.filters).length;
    const name = nameInput.value.trim() || `Segment ${state.savedSegments.length + 1}`;
    state.savedSegments.push({
      name,
      filters: { ...state.segment.filters, plan2026: state.segment.filters.plan2026.slice(), regions: state.segment.filters.regions.slice() },
      matched,
    });
    nameInput.value = '';
    paintSaved();
  }

  function onLoad(seg) {
    state.segment = {
      ...state.segment,
      filters: { ...DEFAULT_FILTERS, ...seg.filters, plan2026: seg.filters.plan2026.slice(), regions: seg.filters.regions.slice() },
      fromRecommendation: null,
    };
    paintRail();
    paintResults();
  }

  function paintSaved() {
    savedBox.textContent = '';
    if (!state.savedSegments.length) return;
    savedBox.appendChild(node('h3', 'rail-section-title', 'Saved segments'));
    for (const seg of state.savedSegments) {
      const row = node('div', 'saved-row');
      row.appendChild(node('span', 'saved-name', seg.name));
      row.appendChild(node('span', 'saved-count', `${fmtCount(scaled(seg.matched))} fans`));
      const b = node('button', 'btn btn-quiet', 'Load');
      b.type = 'button';
      b.addEventListener('click', () => onLoad(seg));
      row.appendChild(b);
      savedBox.appendChild(row);
    }
  }

  // Repaints only the results side, so number inputs in the rail keep focus while typing.
  function paintResults() {
    const seg = state.segment;
    const matchedFans = applyFilters(model.fans, seg.filters);
    const empty = matchedFans.length === 0;
    const results = seg.channelIds.map((id) => channelResult(matchedFans, id));

    banner.textContent = '';
    if (seg.fromRecommendation) {
      const b = node('div', 'seg-banner');
      b.appendChild(node('div', 'seg-banner-title', `From recommendation: ${seg.fromRecommendation.name}`));
      const chips = node('div', 'filter-chips');
      for (const t of describeFilters(seg.filters)) chips.appendChild(node('span', 'filter-chip', t));
      b.appendChild(chips);
      banner.appendChild(b);
    }

    countBox.textContent = '';
    countBox.appendChild(node('div', 'seg-count', fmtCount(scaled(matchedFans.length))));
    countBox.appendChild(node('div', 'seg-count-label', 'fans match these filters'));
    for (const r of results) {
      const line = node('div', 'seg-eligible-line');
      line.appendChild(node('span', 'seg-eligible-name', `Eligible after consent, ${CHANNELS.find((c) => c.id === r.id).label}: `));
      line.appendChild(node('span', `seg-eligible seg-eligible-${r.id}`, fmtCount(scaled(r.w.eligible))));
      countBox.appendChild(line);
    }

    resultsPanel.textContent = '';
    const chipRow = node('div', 'chan-row');
    chipRow.appendChild(node('span', 'pf-bar-label', 'Channels'));
    for (const ch of CHANNELS) {
      const b = node('button', 'chip-btn', ch.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(seg.channelIds.includes(ch.id)));
      b.setAttribute('data-channel', ch.id);
      b.addEventListener('click', () => onChannel(ch.id));
      chipRow.appendChild(b);
    }
    resultsPanel.appendChild(chipRow);

    const cols = node('div', 'seg-cols');
    for (const r of results) {
      const ch = CHANNELS.find((c) => c.id === r.id);
      const card = node('section', 'chart-card seg-channel');
      card.appendChild(node('h3', 'chart-title', ch.label));
      if (ch.note) card.appendChild(node('p', 'seg-note', ch.note));
      card.appendChild(node('h4', 'seg-sub', 'Consent waterfall'));
      renderWaterfall(card, r, empty);
      card.appendChild(node('h4', 'seg-sub', 'Projected results'));
      renderProjection(card, r.disp.perChannel[0], empty);
      card.appendChild(node('p', 'seg-assumption', assumptionText(ch)));
      cols.appendChild(card);
    }
    resultsPanel.appendChild(cols);

    if (results.length > 1) {
      const combined = combineProjections(results.map((r) => r.proj));
      const box = node('section', 'chart-card seg-combined');
      box.appendChild(node('h3', 'chart-title', 'All selected channels'));
      for (const row of combined) {
        const line = node('div', 'proj-row proj-revenue');
        line.appendChild(node('span', 'proj-label', row.label));
        line.appendChild(node('span', 'proj-value', row.value));
        box.appendChild(line);
      }
      resultsPanel.appendChild(box);
    }
  }

  // Save row sits under the rail so both roles can reach it.
  const saveRow = node('div', 'save-row');
  nameInput.type = 'text';
  nameInput.placeholder = 'Segment name';
  nameInput.setAttribute('aria-label', 'Segment name');
  const saveBtn = node('button', 'btn', 'Save segment');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', onSave);
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);

  main.appendChild(node('p', 'sys-intro', 'Build an audience from linked attributes. Consent and minors rules apply before anything is sent.'));
  const top = node('div', 'seg-top');
  top.appendChild(node('h2', 'seg-title', 'Segment Builder'));
  top.appendChild(countBox);
  main.appendChild(top);
  main.appendChild(banner);
  main.appendChild(resultsPanel);
  main.appendChild(saveRow);
  main.appendChild(savedBox);

  paintRail();
  paintSaved();
  paintResults();
}

module.exports = { renderSegments, describeFilters, CONTROL_BY_KEY };
