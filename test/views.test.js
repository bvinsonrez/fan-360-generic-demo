const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { searchFans, fanProfileView, ROLES } = require('../src/views-profile');

const M = buildModel();
const hero = (id) => M.fans.find((f) => f.heroId === id);

test('searchFans edge cases', () => {
  assert.deepEqual(searchFans(M.fans, '').map((f) => f.heroId), ['H1', 'H2', 'H3', 'H4']);
  assert.equal(searchFans(M.fans, 'zzzzqq').length, 0);
  const h1 = hero('H1');
  assert.ok(searchFans(M.fans, h1.name.toUpperCase()).includes(h1));
  assert.ok(searchFans(M.fans, h1.emails[0].toUpperCase()).includes(h1));
  const kcIds = new Set(M.world.kidsClub.map((k) => k.kcId));
  const res = searchFans(M.fans, M.world.kidsClub[0].childFirst);
  assert.ok(res.every((f) => !kcIds.has(f.fanId) && !f.nodes.some((n) => n.source === 'kidsClubChild')));
  assert.ok(searchFans(M.fans, 'a').length <= 20);
});

test('role switch masks without changing fan', () => {
  const h4 = hero('H4');
  const s = fanProfileView(h4, 'sales', M.world), p = fanProfileView(h4, 'privacy', M.world);
  assert.equal(s.header.name, p.header.name);
  assert.equal(s.fields.length, p.fields.length);
  assert.ok(s.fields.some((f) => f.restricted) && !p.fields.some((f) => f.restricted && f.group === 'Consent'));
  assert.ok(s.household.some((h) => h.value.includes('restricted')));
  assert.ok(s.fields.filter((f) => f.restricted).every((f) => f.value === 'Restricted'));
  assert.equal(ROLES.sales, 'Ticket Sales Rep');
  assert.equal(ROLES.privacy, 'Privacy & Data Governance');
  assert.equal(s.header.roleLabel, 'Ticket Sales Rep');
  assert.equal(p.header.roleLabel, 'Privacy & Data Governance');
});

test('contact PII is masked for sales and shown for privacy', () => {
  for (const id of ['H1', 'H2', 'H3', 'H4']) {
    const f = hero(id);
    const s = fanProfileView(f, 'sales', M.world), p = fanProfileView(f, 'privacy', M.world);
    for (const label of ['Email', 'Phone', 'ZIP']) {
      const sf = s.fields.find((x) => x.group === 'Contact' && x.label === label);
      const pf = p.fields.find((x) => x.group === 'Contact' && x.label === label);
      assert.equal(sf.restricted, true, `${id} ${label} sales`);
      assert.equal(sf.value, 'Restricted');
      assert.equal(pf.restricted, false, `${id} ${label} privacy`);
    }
    assert.ok(!JSON.stringify(s).includes('@'), `${id}: no email anywhere in sales view`);
  }
});

test('kids club household line by role', () => {
  const h4 = hero('H4');
  assert.equal(h4.kidsClubChildren.length, 2);
  const s = fanProfileView(h4, 'sales', M.world), p = fanProfileView(h4, 'privacy', M.world);
  assert.deepEqual(s.household, [{ label: 'Kids Club', value: '2 Kids Club members (restricted)', restricted: true }]);
  assert.equal(p.household.length, 2);
  assert.ok(p.household.every((h, i) => !h.restricted && h.value.includes(h4.kidsClubChildren[i].joinDate)));
  const none = fanProfileView(hero('H1'), 'sales', M.world);
  assert.deepEqual(none.household, []);
  const one = M.fans.find((f) => f.kidsClubChildren.length === 1);
  assert.equal(fanProfileView(one, 'sales', M.world).household[0].value, '1 Kids Club member (restricted)');
});

test('swimlanes, sources and per-person values', () => {
  const h1 = hero('H1');
  const v = fanProfileView(h1, 'privacy', M.world);
  assert.deepEqual(v.swimlanes.map((l) => l.system), ['Ticketing & Entry', 'F&B & Retail', 'Groups & Experiences']);
  const tk = v.swimlanes[0].events;
  for (const yr of [2024, 2025, 2026]) {
    if (h1.ticketGames[yr] > 0) assert.ok(tk.some((e) => e.season === yr && e.label.includes(`${h1.ticketGames[yr]} games`)));
  }
  assert.ok(tk.length <= 3 * 3, 'summarized per season, not per scan');
  assert.equal(v.sources.length, h1.nodes.length);
  assert.ok(v.sources.every((s) => ['high', 'medium', 'low'].includes(s.confidence)));
  const h3 = fanProfileView(hero('H3'), 'privacy', M.world);
  assert.ok(h3.swimlanes[2].events.some((e) => /^Group outing: /.test(e.label)));
});
