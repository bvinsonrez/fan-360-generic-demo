const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateWorld } = require('../src/generate');
const { SEED, SAMPLE_SIZE, SEASONS, HOME_GAMES } = require('../src/config');
const { scaled } = require('../src/format');

const W = generateWorld({ seed: SEED, size: SAMPLE_SIZE });

test('deterministic', () => {
  const W2 = generateWorld({ seed: SEED, size: SAMPLE_SIZE });
  assert.deepEqual(W2.ticketing.slice(0, 50), W.ticketing.slice(0, 50));
  assert.equal(W2.scans.length, W.scans.length);
});

test('game counts', () => {
  for (const yr of SEASONS) assert.equal(W.games.filter((g) => g.season === yr).length, HOME_GAMES[yr]);
});

test('per-game scaled attendance 18K–25K, trending down', () => {
  const avg = (yr) => scaled(W.scans.filter((s) => s.season === yr).length) / HOME_GAMES[yr];
  for (const yr of SEASONS) {
    assert.ok(avg(yr) >= 18000 && avg(yr) <= 25000, `${yr}: ${avg(yr)}`);
  }
  assert.ok(avg(2024) > avg(2025) && avg(2025) > avg(2026));
});

test('plan labels by season', () => {
  for (const t of W.ticketing) {
    assert.ok(!['choice', 'reserved', 'starter'].includes(t.seasons[2024]?.plan));
    for (const yr of [2025, 2026]) assert.notEqual(t.seasons[yr]?.plan, 'season_pre');
  }
});

test('ballpark pass has no assigned seat', () => {
  const passTkt = new Set(W.ticketing.filter((t) => t.seasons[2026]?.plan === 'ballpark_pass').map((t) => t.tktId));
  const s = W.scans.filter((x) => passTkt.has(x.tktId) && x.season === 2026 && !x.viaTransfer);
  assert.ok(s.length > 0 && s.every((x) => x.seatArea === 'Standing room / no assigned seat'));
});

test('heroes exist and minors exist', () => {
  for (const h of ['H1', 'H2', 'H3', 'H4']) assert.ok(W.heroes[h]);
  assert.ok(W.people.some((p) => p.isMinor));
});

test('no Math.random in src', () => {
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.js')) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes('Math.random'));
  }
});

test('H2 own scans use one seat area', () => {
  const own = W.scans.filter((s) => s.pid === W.heroes.H2 && !s.viaTransfer && !s.bookingId);
  assert.ok(own.length > 0);
  assert.deepEqual([...new Set(own.map((s) => s.seatArea))], ['Main Level']);
});

test('synthetic contacts: reserved email domains and 555 phones only', () => {
  const emails = [];
  const phones = [];
  const add = (r) => { if (r && r.email) emails.push(r.email); if (r && r.phone) phones.push(r.phone); };
  for (const t of W.ticketing) add(t);
  for (const f of W.fnbIdentified) add(f);
  for (const g of W.groups) { add(g.organizer); for (const k of g.knownAttendees) add(k); }
  for (const e of W.experiences) add(e.buyer);
  for (const k of W.kidsClub) add(k.parent);
  for (const s of W.surveys) add(s);
  for (const c of W.consent) (c.channel === 'sms' ? phones : emails).push(c.contact);
  for (const d of W.dnc) (d.includes('@') ? emails : phones).push(d);
  for (const p of W.people) { emails.push(...p.emails); phones.push(...p.phones); }
  assert.ok(emails.length > 1000 && phones.length > 1000);
  const reserved = /@([a-z0-9.-]+\.)?example\.(com|net|org)$|\.example$/i;
  const badE = emails.filter((e) => !reserved.test(e));
  assert.deepEqual(badE.slice(0, 5), []);
  const badP = phones.filter((p) => !/^\d{3}555\d{4}$/.test(p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')));
  assert.deepEqual(badP.slice(0, 5), []);
});
