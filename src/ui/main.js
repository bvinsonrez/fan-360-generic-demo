// App shell: header state, tab bar, routing and shared state.
// Tab renderers live in TABS (see registerTab); an unregistered tab shows a placeholder.
const { buildModel } = require('../model');
const { createSegmentState } = require('../segments');
const { destroyAllCharts } = require('./charts');
const { renderSystemTab } = require('./tab-systems');
const { renderFan360 } = require('./tab-fan360');
const { renderProfile } = require('./tab-profile');
const { renderSegments } = require('./tab-segments');
const { renderRecs } = require('./tab-recs');

const TAB_GROUPS = [
  { label: 'Your systems today', tabs: [
    { id: 'ticketing', label: '1 Ticketing & Entry' },
    { id: 'fnb', label: '2 F&B & Retail' },
    { id: 'groups', label: '3 Groups & Experiences' },
  ] },
  { label: 'Linked', tabs: [
    { id: 'fan360', label: '4 Fan 360' },
    { id: 'profile', label: '5 Individual View' },
    { id: 'segments', label: '6 Segment Builder' },
    { id: 'recs', label: '7 Segment Recommendations' },
  ] },
];
const TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));

const state = { tab: 'ticketing', role: 'sales', selectedFanId: null, segment: createSegmentState() };
let model = null;

// Renderer signature: (container, { model, state, goTo, setState, payload }).
const TABS = {
  ticketing: (c, ctx) => renderSystemTab(c, ctx.model.views.ticketing),
  fnb: (c, ctx) => renderSystemTab(c, ctx.model.views.fnb),
  groups: (c, ctx) => renderSystemTab(c, ctx.model.views.groups),
  fan360: (c, ctx) => renderFan360(c, ctx.model.views.fan360),
  profile: (c, ctx) => renderProfile(c, ctx),
  segments: (c, ctx) => renderSegments(c, ctx),
  recs: (c, ctx) => renderRecs(c, ctx),
};

function registerTab(id, renderer) { TABS[id] = renderer; }

function tabLabel(id) {
  for (const g of TAB_GROUPS) for (const t of g.tabs) if (t.id === id) return t.label;
  return id;
}

function renderPlaceholder(container, id) {
  container.textContent = '';
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = `${tabLabel(id)} is coming together in the next build step.`;
  container.appendChild(p);
}

function renderTabBar() {
  const bar = document.getElementById('tabbar');
  bar.textContent = '';
  TAB_GROUPS.forEach((group, gi) => {
    if (gi > 0) { const sep = document.createElement('div'); sep.className = 'tab-sep'; bar.appendChild(sep); }
    const wrap = document.createElement('div');
    wrap.className = 'tab-group';
    wrap.setAttribute('role', 'tablist');
    wrap.setAttribute('aria-label', group.label);
    const lab = document.createElement('div');
    lab.className = 'tab-group-label';
    lab.textContent = group.label;
    wrap.appendChild(lab);
    const row = document.createElement('div');
    row.className = 'tab-group-tabs';
    for (const t of group.tabs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.id = `tab-${t.id}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === state.tab));
      b.textContent = t.label;
      b.addEventListener('click', () => onTabClick(t.id));
      row.appendChild(b);
    }
    wrap.appendChild(row);
    bar.appendChild(wrap);
  });
}

function render(payload) {
  const container = document.getElementById('app');
  destroyAllCharts();
  renderTabBar();
  if (!model) return;
  const renderer = TABS[state.tab];
  if (renderer) renderer(container, { model, state, goTo, setState, payload });
  else renderPlaceholder(container, state.tab);
}

function goTo(tabId, payload) {
  if (!TAB_IDS.includes(tabId)) throw new Error(`Unknown tab ${tabId}`);
  state.tab = tabId;
  render(payload);
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function onTabClick(id) { goTo(id); }

function mount(m) {
  model = m;
  render();
}

const api = { state, TABS, TAB_IDS, registerTab, goTo, setState, mount };
if (typeof globalThis !== 'undefined') globalThis.__fan360 = api;

// Paint the loading state first, then build the model on the next tick.
if (typeof document !== 'undefined') {
  renderTabBar();
  setTimeout(() => mount(buildModel()), 0);
}

module.exports = api;
