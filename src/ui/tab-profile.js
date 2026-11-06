// Tab 5: hero picker, search, role toggle and the role-masked unified profile.
// Per-person values are shown as the view model formats them (not scaled).
const { searchFans, fanProfileView, ROLES } = require('../views-profile');
const { SEASONS } = require('../config');

const SOURCE_NAMES = {
  ticketing: 'Ticketing & Entry', fnb: 'F&B & Retail', groups: 'Groups & Experiences',
  experiences: 'Groups & Experiences', surveys: 'Survey', kidsClub: 'Kids Club',
};

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function valueNode(f) {
  return f.restricted ? node('span', 'pill-restricted', f.value) : node('span', 'pf-value', f.value);
}

function renderSwimlanes(lanes) {
  const wrap = node('div', 'lanes');
  const head = node('div', 'lane lane-head');
  head.appendChild(node('div', 'lane-name'));
  const cols = node('div', 'lane-cols');
  for (const yr of SEASONS) cols.appendChild(node('div', 'lane-season', String(yr)));
  head.appendChild(cols);
  wrap.appendChild(head);
  for (const lane of lanes) {
    const row = node('div', 'lane');
    row.appendChild(node('div', 'lane-name', lane.system));
    const body = node('div', 'lane-cols');
    for (const yr of SEASONS) {
      const cell = node('div', 'lane-cell');
      for (const ev of lane.events.filter((e) => e.season === yr)) {
        cell.appendChild(node('div', `lane-event lane-${ev.kind}`, ev.label));
      }
      body.appendChild(cell);
    }
    row.appendChild(body);
    wrap.appendChild(row);
  }
  return wrap;
}

function renderProfileBody(el, view) {
  el.textContent = '';
  const h = view.header;
  const top = node('div', 'pf-header');
  top.appendChild(node('h2', 'pf-name', h.name));
  top.appendChild(node('span', 'pf-meta', `${h.region}, ${h.systems} ${h.systems === 1 ? 'system' : 'systems'}, match confidence ${h.confidence}`));
  top.appendChild(node('span', 'pf-meta pf-role', `Viewing as ${h.roleLabel}`));
  el.appendChild(top);

  const cols = node('div', 'pf-cols');
  const left = node('div', 'pf-col');
  const groups = [];
  for (const f of view.fields) {
    let g = groups.find((x) => x.name === f.group);
    if (!g) { g = { name: f.group, rows: [] }; groups.push(g); }
    g.rows.push(f);
  }
  for (const g of groups) {
    const sec = node('section', 'pf-group');
    sec.appendChild(node('h3', 'pf-group-title', g.name));
    for (const f of g.rows) {
      const row = node('div', 'pf-row');
      row.appendChild(node('span', 'pf-label', f.label));
      row.appendChild(valueNode(f));
      sec.appendChild(row);
    }
    if (g.name === 'Linkage') {
      for (const s of view.sources) {
        const row = node('div', 'pf-row');
        row.appendChild(node('span', 'pf-label', `Linked record (${SOURCE_NAMES[s.source] || s.source})`));
        row.appendChild(node('span', 'pf-value', `${s.id}, ${s.confidence} confidence`));
        sec.appendChild(row);
      }
    }
    left.appendChild(sec);
  }
  cols.appendChild(left);

  const right = node('div', 'pf-col');
  const tl = node('section', 'pf-group');
  tl.appendChild(node('h3', 'pf-group-title', 'Three seasons across systems'));
  tl.appendChild(renderSwimlanes(view.swimlanes));
  right.appendChild(tl);
  if (view.household.length) {
    const hh = node('section', 'pf-group');
    hh.appendChild(node('h3', 'pf-group-title', 'Household'));
    for (const r of view.household) {
      const row = node('div', 'pf-row');
      row.appendChild(node('span', 'pf-label', r.label));
      row.appendChild(valueNode(r));
      hh.appendChild(row);
    }
    right.appendChild(hh);
  }
  cols.appendChild(right);
  el.appendChild(cols);
}

function renderProfile(container, ctx) {
  const { model, state, payload } = ctx;
  if (payload && payload.fanId !== undefined && payload.fanId !== null) state.selectedFanId = payload.fanId;
  const heroes = searchFans(model.fans, '');
  if (state.selectedFanId === null || state.selectedFanId === undefined || !model.fanById.has(state.selectedFanId)) {
    state.selectedFanId = heroes[0].fanId;
  }

  container.textContent = '';
  container.appendChild(node('p', 'sys-intro', 'One linked fan across three seasons and three systems. Switch roles to see what each team is allowed to see.'));
  const bar = node('div', 'pf-bar');
  const chips = node('div', 'chips');
  const search = node('input', 'pf-search');
  search.type = 'search';
  search.placeholder = 'Search fans by name or email';
  search.setAttribute('aria-label', 'Search fans by name or email');
  const toggle = node('div', 'role-toggle');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Role');
  const results = node('div', 'pf-results');
  const body = node('div', 'pf-body');

  function paintChips() {
    chips.textContent = '';
    for (const h of heroes) {
      const b = node('button', 'chip-btn', h.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(h.fanId === state.selectedFanId));
      b.addEventListener('click', () => onPick(h.fanId));
      chips.appendChild(b);
    }
  }
  function paintToggle() {
    toggle.textContent = '';
    for (const id of ['sales', 'privacy']) {
      const b = node('button', 'role-btn', ROLES[id]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.role === id));
      b.addEventListener('click', () => onRole(id));
      toggle.appendChild(b);
    }
  }
  function paintResults() {
    results.textContent = '';
    if (!search.value.trim()) return;
    const found = searchFans(model.fans, search.value);
    if (!found.length) { results.appendChild(node('div', 'pf-none', 'No fans match that search')); return; }
    for (const f of found) {
      const b = node('button', 'result-btn', f.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(f.fanId === state.selectedFanId));
      b.addEventListener('click', () => onPick(f.fanId));
      results.appendChild(b);
    }
  }
  function paintBody() {
    renderProfileBody(body, fanProfileView(model.fanById.get(state.selectedFanId), state.role, model.world));
  }
  function paintAll() { paintChips(); paintToggle(); paintResults(); paintBody(); }
  // Only the profile, chips and results repaint, so the search box keeps focus and text.
  function onPick(fanId) { state.selectedFanId = fanId; paintAll(); }
  function onRole(role) { state.role = role; paintAll(); }

  search.addEventListener('input', paintResults);
  bar.appendChild(node('span', 'pf-bar-label', 'Hero fans'));
  bar.appendChild(chips);
  bar.appendChild(search);
  bar.appendChild(toggle);
  container.appendChild(bar);
  container.appendChild(results);
  container.appendChild(body);
  paintAll();
}

module.exports = { renderProfile };
