const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { CHANNELS } = require('../src/config');
const {
  DEFAULT_FILTERS, applyFilters, consentWaterfall, projectResults, projectionDisplay,
  createSegmentState, applyRecommendation, setFilter,
} = require('../src/segments');

const M = buildModel();
const keyOf = (ch) => CHANNELS.find((c) => c.id === ch).consentKey;
const contacts = (f, ch) => (ch === 'sms' ? f.phones : ch === 'push' ? [] : f.emails);

test('minors and opted-out never eligible', () => {
  for (const ch of ['email', 'sms', 'push', 'social']) {
    const w = consentWaterfall(M.fans, ch);
    const key = keyOf(ch);
    // independent recompute: rule filter, then first fan per contact in fanId order
    const pass = M.fans
      .filter((f) => !f.isMinor && !f.dnc && f.consent[key] === 'opt_in')
      .sort((a, b) => (a.fanId < b.fanId ? -1 : 1));
    const seen = new Set();
    let eligible = 0;
    for (const f of pass) {
      const cs = contacts(f, ch);
      if (cs.some((c) => seen.has(c))) continue;
      cs.forEach((c) => seen.add(c));
      eligible++;
    }
    assert.equal(w.eligible, eligible, ch);
    assert.equal(w.start, M.fans.length);
    assert.equal(w.start - w.steps.reduce((a, s) => a + s.removed, 0), w.eligible);
    assert.deepEqual(w.steps.map((s) => s.id), ['no_opt_in', 'opted_out', 'dnc', 'minor', 'duplicate']);
    // the rules themselves, stated directly
    const bad = M.fans.filter((f) => f.isMinor || f.dnc || f.consent[key] !== 'opt_in');
    assert.ok(bad.length > 0 && w.eligible <= M.fans.length - bad.length);
    assert.ok(M.fans.some((f) => f.isMinor) && M.fans.some((f) => f.consent[key] === 'opt_out'));
  }
});

test('social uses email consent', () => {
  assert.equal(consentWaterfall(M.fans, 'social').eligible, consentWaterfall(M.fans, 'email').eligible);
});

test('waterfall adds up on screen', () => {
  const d = consentWaterfall(M.fans, 'email').display;
  assert.equal(d.total, d.parts.reduce((a, b) => a + b, 0));
});

test('empty audience', () => {
  const none = applyFilters(M.fans, { games2026Min: 999 });
  const w = consentWaterfall(none, 'email');
  const r = projectResults(w.eligible, ['email', 'sms']);
  assert.equal(w.eligible, 0);
  assert.ok(JSON.stringify([w, r]).match(/NaN|Infinity/) === null);
  assert.equal(r.combined.revenue, 0);
  const fin = (v, what) => assert.ok(Number.isFinite(v), `${what} not finite: ${v}`);
  fin(w.start, 'start'); fin(w.eligible, 'eligible');
  w.steps.forEach((s) => fin(s.removed, `removed ${s.id}`));
  w.display.parts.forEach((v, i) => fin(v, `display part ${i}`));
  fin(w.display.total, 'display total');
  for (const c of r.perChannel) {
    Object.entries(c.metrics).forEach(([k, v]) => fin(v, `metric ${c.channelId}.${k}`));
    fin(c.revenue, `revenue ${c.channelId}`);
  }
  fin(r.combined.purchases, 'combined purchases'); fin(r.combined.revenue, 'combined revenue');
});

test('editing clears recommendation source', () => {
  let s = applyRecommendation(createSegmentState(), { id: 'x', name: 'X', filters: { groupOutingsMin: 2 } });
  assert.equal(s.fromRecommendation.id, 'x');
  assert.equal(s.filters.groupOutingsMin, 2);
  assert.deepEqual(s.channelIds, ['email']);
  s = setFilter(s, 'regions', ['Home state']);
  assert.equal(s.fromRecommendation, null);
  assert.deepEqual(s.filters.regions, ['Home state']);
  assert.equal(createSegmentState().filters.regions.length, 0);
});

test('filters express rules exactly', () => {
  const n = (f) => applyFilters(M.fans, f).length;
  const count = (p) => M.fans.filter(p).length;
  assert.equal(applyFilters(M.fans, {}).length, M.fans.length);
  assert.equal(n({ keptTransferring2026: true }), count((f) => f.transfersSent[2026] > 0));
  assert.equal(n({ retailOrApp2026: true }), count((f) => f.retailOrApp[2026]));
  assert.equal(n({ neverOwnTicket: true }), count((f) => !f.ownTicketEver));
  assert.equal(n({ premiumViaTransferOrGroup: true }), count((f) => f.premium.viaTransfer + f.premium.viaGroup > 0));
  assert.equal(n({ premiumViaTransferOrGroup: true, excludePremiumOwn: true }),
    count((f) => f.premium.viaTransfer + f.premium.viaGroup > 0 && f.premium.own === 0));
  assert.equal(n({ kidsClubHousehold: true }), count((f) => f.kidsClubChildren.length > 0));
  assert.equal(n({ attendanceChangeMaxPct: -20 }), count((f) => f.attendanceChangePct !== null && f.attendanceChangePct <= -20));
  assert.equal(n({ fnbPercentile2026Min: 50 }), count((f) => f.fnbPercentile2026 !== null && f.fnbPercentile2026 >= 50));
  assert.equal(n({ plan2026: ['none'] }), count((f) => f.plans[2026] === 'none'));
  assert.equal(n({ plan2026: ['choice', 'reserved'] }), count((f) => ['choice', 'reserved'].includes(f.plans[2026])));
  assert.equal(n({ seasonsActiveMin: 3 }), count((f) => f.seasonsActive >= 3));
  assert.equal(n({ regions: ['Neighbor state (south)'] }), count((f) => f.region === 'Neighbor state (south)'));
  assert.ok(Object.keys(DEFAULT_FILTERS).length === 16);
});

test('projections use stated rates', () => {
  const r = projectResults(1000, ['email', 'social']);
  const e = r.perChannel[0];
  assert.deepEqual(e.metrics, { delivered: 950, opened: 380, clicked: 60, purchased: 30 });
  assert.equal(e.revenue, 30 * 84);
  assert.deepEqual(r.perChannel[1].metrics, { matched: 620, clicked: 13, purchased: 6 });
  assert.equal(r.combined.purchases, 36);
  assert.equal(r.combined.revenue, 30 * 84 + 6 * 78);
});

test('projectionDisplay formats scaled strings and handles zero audience', () => {
  const z = projectionDisplay(projectResults(0, ['email', 'sms', 'push', 'social']));
  assert.equal(z.combined[0].value, '0');
  assert.equal(z.combined[1].value, '$0');
  for (const c of z.perChannel) for (const r of c.rows) assert.ok(!/NaN|Infinity|-0/.test(r.value));
  const d = projectionDisplay(projectResults(1000, ['email']));
  assert.equal(d.perChannel[0].rows[0].label, 'Delivered');
  assert.equal(d.perChannel[0].rows[0].value, '23.8K');
});
