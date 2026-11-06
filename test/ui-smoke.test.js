// Renders tabs 4 and 5 against a minimal DOM stub (no browser, no dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { renderFan360 } = require('../src/ui/tab-fan360');
const { renderProfile } = require('../src/ui/tab-profile');
const { renderSegments } = require('../src/ui/tab-segments');
const { renderRecs } = require('../src/ui/tab-recs');
const { createSegmentState, DEFAULT_FILTERS } = require('../src/segments');
const { scaled, fmtCount, fmtMoney } = require('../src/format');
const { COPY } = require('../src/config');

function makeNode(tag) {
  const n = {
    tag, className: '', children: [], listeners: {}, style: {}, attrs: {}, _text: '', value: '',
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { this.listeners[t] = f; },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); },
    set textContent(v) { this._text = v; this.children = []; },
  };
  return n;
}
globalThis.document = { createElement: makeNode };
const walk = (n, fn) => { fn(n); n.children.forEach((c) => walk(c, fn)); };
const find = (n, cls) => { const out = []; walk(n, (x) => { if (x.className.split(' ').includes(cls)) out.push(x); }); return out; };

const M = buildModel();
const ctxFor = (state, payload) => ({ model: M, state, goTo() {}, setState() {}, payload });

test('tab 4 renders parts, takeaways and a large tile', () => {
  const el = makeNode('div');
  renderFan360(el, M.views.fan360);
  const text = el.textContent;
  assert.ok(text.includes(M.views.fan360.funnel.totalLabel));
  assert.ok(text.includes(M.views.fan360.takeaways.valueBySystems));
  assert.equal(find(el, 'kpi-large').length, 1);
  assert.equal(find(el, 'takeaway').length, 4);
});

test('tab 5 renders every hero in both roles', () => {
  for (const h of ['H1', 'H2', 'H3', 'H4']) {
    const fan = M.fans.find((f) => f.heroId === h);
    for (const role of ['sales', 'privacy']) {
      const el = makeNode('div');
      renderProfile(el, ctxFor({ role, selectedFanId: fan.fanId }));
      assert.ok(el.textContent.includes(fan.name));
      assert.ok(!el.textContent.includes('-09-30'));
    }
  }
});

test('tab 5 defaults to H1, masks for sales, shows child join date for privacy', () => {
  const state = { role: 'sales', selectedFanId: null };
  const el = makeNode('div');
  renderProfile(el, ctxFor(state));
  assert.equal(state.selectedFanId, M.fans.find((f) => f.heroId === 'H1').fanId);
  const h4 = M.fans.find((f) => f.heroId === 'H4');
  const sales = makeNode('div');
  renderProfile(sales, ctxFor({ role: 'sales', selectedFanId: h4.fanId }));
  assert.ok(find(sales, 'pill-restricted').length > 0);
  assert.match(sales.textContent, /\d Kids Club members? \(restricted\)/);
  const priv = makeNode('div');
  renderProfile(priv, ctxFor({ role: 'privacy', selectedFanId: h4.fanId }));
  assert.equal(find(priv, 'pill-restricted').length, 0);
  assert.match(priv.textContent, /joined \d{4}-\d{2}-\d{2}/);
});

test('role toggle keeps the selected fan; payload selects a fan', () => {
  const h2 = M.fans.find((f) => f.heroId === 'H2');
  const state = { role: 'sales', selectedFanId: null };
  const el = makeNode('div');
  renderProfile(el, ctxFor(state, { fanId: h2.fanId }));
  assert.equal(state.selectedFanId, h2.fanId);
  const privBtn = find(el, 'role-btn')[1];
  privBtn.listeners.click();
  assert.equal(state.role, 'privacy');
  assert.equal(state.selectedFanId, h2.fanId);
  assert.ok(el.textContent.includes(h2.name));
});

const fresh = () => ({ role: 'sales', selectedFanId: null, segment: createSegmentState() });
const withAttr = (root, k, v) => { const out = []; walk(root, (x) => { if (x.attrs && x.attrs[k] === v) out.push(x); }); return out; };

test('tab 7 heading, notes, first card expanded, no forbidden wording', () => {
  const el = makeNode('div');
  renderRecs(el, ctxFor(fresh()));
  const text = el.textContent;
  assert.ok(text.includes(COPY.recsLabel));
  assert.ok(text.includes(COPY.recsProdNote));
  assert.ok(!/\bAI\b/.test(text));
  assert.equal(find(el, 'rec-body').length, 1);
  assert.equal(find(el, 'rec-open-btn').length, M.recommendations.length);
  const first = M.recommendations[0];
  assert.ok(find(el, 'rec-value')[0].textContent === fmtMoney(first.projectedValue));
  assert.ok(text.includes(first.evidence.segmentValue) && text.includes(first.evidence.baselineValue));
});

test('every card opens in the builder with identical size and eligible strings, and editing clears the banner', () => {
  for (const card of M.recommendations) {
    const state = fresh();
    let dest = null;
    const ctx = { model: M, state, goTo(t) { dest = t; }, setState() {}, payload: undefined };
    const recs = makeNode('div');
    renderRecs(recs, ctx);
    withAttr(recs, 'data-rec', card.id)[0].listeners.click();
    assert.equal(dest, 'segments');
    const seg = makeNode('div');
    renderSegments(seg, ctx);
    assert.equal(find(seg, 'seg-count')[0].textContent, fmtCount(scaled(card.matched)));
    assert.equal(find(seg, 'seg-eligible-email')[0].textContent, fmtCount(scaled(card.eligible)));
    const sizeStr = fmtCount(scaled(card.matched)), eligStr = fmtCount(scaled(card.eligible));
    assert.equal(find(seg, 'seg-count').length, 1);
    assert.equal(find(seg, 'seg-eligible').length, 1);
    assert.equal(find(seg, 'wf-eligible-value').length, 1);
    assert.equal(find(seg, 'wf-eligible-value')[0].textContent, eligStr);
    assert.ok(!seg.textContent.includes('Matched audience'));
    assert.ok(seg.textContent.includes(`From recommendation: ${card.name}`));
    assert.ok(find(seg, 'filter-chip').length > 0);
    // Edit a filter: banner goes away.
    const ctl = withAttr(seg, 'data-filter', 'keptTransferring2026')[0];
    ctl.checked = !state.segment.filters.keptTransferring2026;
    ctl.listeners.change();
    assert.equal(state.segment.fromRecommendation, null);
    assert.ok(!seg.textContent.includes('From recommendation'));
  }
});

test('every DEFAULT_FILTERS key has a control', () => {
  const seg = makeNode('div');
  renderSegments(seg, ctxFor(fresh()));
  for (const key of Object.keys(DEFAULT_FILTERS)) assert.ok(withAttr(seg, 'data-filter', key).length > 0, key);
});

test('zero-match audience shows 0 and the empty state with no NaN', () => {
  const state = fresh();
  const seg = makeNode('div');
  renderSegments(seg, ctxFor(state));
  const kids = withAttr(seg, 'data-filter', 'kidsClubHousehold')[0];
  kids.checked = true; kids.listeners.change();
  const max = withAttr(seg, 'data-filter', 'games2026Max')[0];
  max.value = '-1'; max.listeners.input();
  const text = seg.textContent;
  assert.equal(find(seg, 'seg-count')[0].textContent, '0');
  assert.ok(text.includes('No fans match these filters'));
  assert.ok(text.includes('$0'));
  assert.ok(!/NaN|Infinity|undefined/.test(text));
  // Add SMS: still clean.
  withAttr(seg, 'data-channel', 'sms')[0].listeners.click();
  assert.ok(!/NaN|Infinity|undefined/.test(seg.textContent));
});

test('multi-channel, SMS note, duplicate label, assumptions and save segment', () => {
  const state = fresh();
  const seg = makeNode('div');
  renderSegments(seg, ctxFor(state));
  for (const id of ['sms', 'push', 'social']) withAttr(seg, 'data-channel', id)[0].listeners.click();
  const text = seg.textContent;
  assert.ok(text.includes('Requires documented consent'));
  assert.ok(text.includes('Duplicate contacts (already merged by linkage)'));
  assert.ok(text.includes('average order $84') && text.includes('Purchases 3%'));
  assert.ok(text.includes('Combined revenue'));
  assert.ok(!/NaN|Infinity|undefined/.test(text));
  const save = find(seg, 'btn').find((b) => b.textContent === 'Save segment');
  save.listeners.click();
  assert.equal(state.savedSegments.length, 1);
  assert.equal(typeof state.savedSegments[0].matched, 'number');
  assert.ok(seg.textContent.includes('Saved segments'));
});

test('waterfall eligible equals pinned eligible for every selected channel', () => {
  const state = fresh();
  const seg = makeNode('div');
  renderSegments(seg, ctxFor(state));
  for (const id of ['sms', 'push', 'social']) withAttr(seg, 'data-channel', id)[0].listeners.click();
  const pinned = find(seg, 'seg-eligible').map((n) => n.textContent);
  const wf = find(seg, 'wf-eligible-value').map((n) => n.textContent);
  assert.equal(pinned.length, 4);
  assert.deepEqual(wf, pinned);
});
