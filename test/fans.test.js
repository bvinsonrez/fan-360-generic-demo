const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { SEASONS, PLANS } = require('../src/config');
const { scaled, fmtCount, fmtMultiple, fmtPct } = require('../src/format');

const M = buildModel();
const m = M.views.fan360.metrics;

test('spec 7.5 targets', () => {
  assert.ok(m.recordsPerFan >= 1.6 && m.recordsPerFan <= 1.9, `recordsPerFan ${m.recordsPerFan}`);
  assert.ok(m.multiSystemShare >= 0.12 && m.multiSystemShare <= 0.16, `multiSystemShare ${m.multiSystemShare}`);
  assert.ok(m.valueMultiple >= 2.5 && m.valueMultiple <= 3.2, `valueMultiple ${m.valueMultiple}`);
  assert.notEqual(fmtMultiple(m.valueMultiple), '2.9x');
  assert.ok(m.fnbIdentifiedShare >= 0.08 && m.fnbIdentifiedShare <= 0.15, `fnbIdentifiedShare ${m.fnbIdentifiedShare}`);
  assert.notEqual(fmtPct(1 - m.fnbIdentifiedShare), '96%');
  assert.ok(m.dupContactShare >= 0.15 && m.dupContactShare <= 0.25, `dupContactShare ${m.dupContactShare}`);
});

test('cross-tab reconciliation', () => {
  const W = M.world;
  // Tab 1: total scans KPI equals the sum of the per-game attendance series.
  const att = M.views.ticketing.charts.find((c) => c.id === 'attendanceByGame');
  const seriesTotal = att.series.reduce((a, s) => a + s.data.reduce((x, y) => x + (y || 0), 0), 0);
  assert.equal(seriesTotal, scaled(W.scans.length));
  const scanKpi = M.views.ticketing.kpis.find((k) => k.id === 'scans');
  assert.equal(scanKpi.value, fmtCount(seriesTotal));
  // Tab 4: resolved fans equals the fan list.
  assert.equal(M.linkage.stats.resolvedFans, M.fans.length);
  assert.equal(M.views.fan360.kpis.find((k) => k.id === 'resolvedFans').value, fmtCount(scaled(M.fans.length)));
  // Fans' ticketing games equal ticketing scans attributed to accounts.
  const ticketScans = W.scans.filter((s) => s.tktId).length;
  const fanTicketGames = M.fans.reduce((a, f) => a + SEASONS.reduce((x, yr) => x + f.ticketGames[yr], 0), 0);
  assert.equal(fanTicketGames, ticketScans);
  // Every named group participant is one outing for one fan.
  const named = W.groups.reduce((a, g) => a + 1 + g.knownAttendees.length, 0);
  assert.equal(M.fans.reduce((a, f) => a + f.groupOutings, 0), named);
  // Identified F&B dollars all land on a fan.
  const fnbWorld = W.fnbIdentified.reduce((a, t) => a + t.amount, 0);
  const fnbFans = M.fans.reduce((a, f) => a + SEASONS.reduce((x, yr) => x + f.fnbSpend[yr], 0), 0);
  assert.ok(Math.abs(fnbWorld - fnbFans) < 0.01, `${fnbWorld} vs ${fnbFans}`);
  // Kids Club rows all land on a fan.
  assert.equal(M.fans.reduce((a, f) => a + f.kidsClubChildren.length, 0), W.kidsClub.length);
  // Tab 2 identified share matches tab 4 metric.
  const anonTxns = W.fnbAnonymous.reduce((a, g) => a + g.txns, 0);
  assert.equal(m.fnbIdentifiedShare, W.fnbIdentified.length / (W.fnbIdentified.length + anonTxns));
});

test('funnel adds up on screen', () => {
  const f = M.views.fan360.funnel;
  assert.equal(f.total, f.parts.reduce((a, b) => a + b, 0));
  const b = M.views.fan360.matchBreakdown;
  assert.equal(b.total, b.parts.reduce((a, x) => a + x, 0));
});

test('groups cantTell uses computed N', () => {
  assert.match(M.views.groups.cantTell, /the \d+ other people/);
  const sizes = M.world.groups.map((g) => g.size).sort((a, b) => a - b);
  const mid = sizes.length >> 1;
  const med = sizes.length % 2 ? sizes[mid] : Math.round((sizes[mid - 1] + sizes[mid]) / 2);
  assert.match(M.views.groups.cantTell, new RegExp(`the ${med - 1} other people`));
});

test('chart budget', () => {
  for (const v of ['ticketing', 'fnb', 'groups']) {
    assert.ok(M.views[v].charts.length <= 4);
    assert.ok(M.views[v].charts.length >= 1);
    for (const k of M.views[v].kpis) assert.equal(typeof k.value, 'string');
    for (const c of M.views[v].charts) assert.ok(c.series.filter((s) => s.highlight).length <= 1, c.id);
  }
});

test('every hero has systems ≥ 2', () => {
  const heroes = M.fans.filter((f) => f.heroId);
  assert.equal(heroes.length, 4);
  for (const f of heroes) assert.ok(f.systems >= 2, f.heroId);
});

test('fan fields', () => {
  for (const f of M.fans) {
    assert.ok(f.systems >= 1 && f.systems <= 3, f.fanId);
    for (const yr of SEASONS) assert.ok(f.plans[yr] in PLANS);
    if (f.fnbSpend[2026] > 0) assert.ok(f.fnbPercentile2026 >= 0 && f.fnbPercentile2026 <= 100);
    else assert.equal(f.fnbPercentile2026, null);
    if (f.games[2025] === 0) assert.equal(f.attendanceChangePct, null);
  }
  assert.equal(M.fanById.get(M.fans[0].fanId), M.fans[0]);
  const h = Object.fromEntries(M.fans.filter((f) => f.heroId).map((f) => [f.heroId, f]));
  assert.equal(h.H1.plans[2026], 'ballpark_pass');
  assert.ok(h.H1.games[2026] >= 20);
  assert.ok(h.H2.attendanceChangePct <= -40);
  assert.ok(h.H2.transfersSent[2026] > 0);
  assert.equal(h.H2.surveySat, 3);
  assert.equal(h.H3.ownTicketEver, false);
  assert.ok(h.H3.groupOutings >= 2);
  assert.equal(h.H4.kidsClubChildren.length, 2);
  assert.equal(h.H4.singleGameBefore2026, true);
});

test('consent joins normalized contacts', () => {
  // Every consent row whose contact belongs to some fan affects that fan's consent.
  const withEmailOptIn = M.fans.filter((f) => f.consent.email === 'opt_in').length;
  assert.ok(withEmailOptIn > 0);
  for (const f of M.fans.slice(0, 2000)) {
    for (const ch of ['email', 'sms', 'push']) {
      assert.ok(['opt_in', 'opt_out', 'none'].includes(f.consent[ch]));
      if (f.consent[ch] !== 'none') assert.equal(f.consentDetail[ch].status, f.consent[ch]);
    }
  }
  assert.ok(M.fans.some((f) => f.dnc));
});

test('value chart: 1 vs 2+ systems, highlight on the max, takeaway matches', () => {
  const c = M.views.fan360.valueBySystems;
  assert.deepEqual(c.labels, ['1 system', '2+ systems']);
  const d = c.series[0].data;
  assert.equal(d[c.highlightIndex], Math.max(...d));
  assert.ok(Math.abs(d[1] / d[0] - m.valueMultiple) < 0.02);
  assert.ok(M.views.fan360.takeaways.valueBySystems.includes(fmtMultiple(m.valueMultiple)));
});

test('every highlighted bar is the largest value in its series', () => {
  const charts = [...['ticketing', 'fnb', 'groups'].flatMap((v) => M.views[v].charts),
    M.views.fan360.overlap, M.views.fan360.valueBySystems];
  for (const c of charts) {
    if (c.type !== 'bar' || c.highlightIndex === undefined) continue;
    const d = c.series[0].data;
    assert.equal(d[c.highlightIndex], Math.max(...d), c.id);
  }
});

test('F&B identified (tab 2) and anonymous (tab 4) shares add to 100 on screen', () => {
  const id = M.views.fnb.kpis.find((k) => k.id === 'identifiedShare').value;
  const anon = M.views.fan360.kpis.find((k) => k.id === 'anonFnb').value;
  assert.equal(Math.round((parseFloat(id) + parseFloat(anon)) * 10), 1000, `${id} + ${anon}`);
  for (const s of [id, anon]) assert.ok(!['96%', '9%', '22%'].includes(s), s);
});

test('dup contacts count only real fans', () => {
  const fanEmails = new Set(M.fans.flatMap((f) => f.emails));
  const fansWithListEmail = new Set();
  const byEmail = new Map();
  for (const f of M.fans) for (const e of f.emails) byEmail.set(e, f.fanId);
  const W = M.world;
  const list = new Set([...W.ticketing.map((t) => t.email), ...W.fnbIdentified.map((t) => t.email),
    ...W.groups.flatMap((g) => [g.organizer.email, ...g.knownAttendees.map((k) => k.email)])]
    .filter(Boolean).map((e) => e.trim().toLowerCase()));
  for (const e of list) if (fanEmails.has(e)) fansWithListEmail.add(byEmail.get(e));
  assert.equal(m.duplicateEmails, list.size - fansWithListEmail.size);
});

test('model carries six recommendation cards', () => {
  assert.equal(M.recommendations.length, 6);
});

test('season-ramp charts carry no accent; accent charts highlight one thing', () => {
  const charts = ['ticketing', 'fnb', 'groups'].flatMap((v) => M.views[v].charts);
  for (const c of charts) {
    const n = c.series.filter((s) => s.highlight).length + (c.highlightIndex !== undefined ? 1 : 0);
    if (c.seasonSeries) assert.equal(n, 0, c.id);
    assert.ok(n <= 1, c.id);
  }
});
