const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateWorld } = require('../src/generate');
const { resolveIdentities, soundex, jaroWinkler } = require('../src/linkage');
const { SEED, SAMPLE_SIZE } = require('../src/config');

const W = generateWorld({ seed: SEED, size: SAMPLE_SIZE });
const L = resolveIdentities(W);

// Map every node id (source:id) back to the hidden truth, using the world records.
function truthByNode(world) {
  const m = new Map();
  for (const t of world.ticketing) m.set(`ticketing:${t.tktId}`, t);
  for (const f of world.fnbIdentified) if (!m.has(`fnb:${f.txnId}`)) m.set(`fnb:${f.txnId}`, f);
  for (const g of world.groups) {
    m.set(`groups:${g.bookingId}:organizer`, g.organizer);
    g.knownAttendees.forEach((a, k) => m.set(`groups:${g.bookingId}:attendee:${k}`, a));
  }
  for (const e of world.experiences) m.set(`experiences:${e.expId}`, e.buyer);
  for (const s of world.surveys) m.set(`surveys:${s.respId}`, s);
  for (const k of world.kidsClub) if (!m.has(`kidsClub:${k.kcId}`)) m.set(`kidsClub:${k.kcId}`, k.parent);
  return m;
}
const T = truthByNode(W);
const key = (n) => `${n.source}:${n.id}`;

function purity(clusters) {
  let pure = 0;
  for (const c of clusters) {
    const ids = new Set(c.nodes.map((n) => T.get(key(n)).pid));
    if (ids.size === 1) pure++;
  }
  return pure / clusters.length;
}
function recall(clusters) {
  const clusterOf = new Map();
  for (const c of clusters) for (const n of c.nodes) clusterOf.set(key(n), c.clusterId);
  const byPid = new Map();
  for (const [k, rec] of T) {
    if (!clusterOf.has(k)) continue;
    if (!byPid.has(rec.pid)) byPid.set(rec.pid, new Set());
    byPid.get(rec.pid).add(clusterOf.get(k));
  }
  let eligible = 0, ok = 0;
  const counts = new Map();
  for (const rec of T.values()) counts.set(rec.pid, (counts.get(rec.pid) || 0) + 1);
  for (const [p, cs] of byPid) {
    if (counts.get(p) < 2) continue;
    eligible++;
    if (cs.size === 1) ok++;
  }
  return ok / eligible;
}

test('accuracy against hidden truth', () => {
  assert.ok(purity(L.clusters) >= 0.97, `purity ${purity(L.clusters)}`);
  assert.ok(recall(L.clusters) >= 0.9, `recall ${recall(L.clusters)}`);
});

test('records per fan 1.6-1.9', () => {
  const r = L.stats.sourceRecords / L.stats.resolvedFans;
  assert.ok(r >= 1.6 && r <= 1.9, String(r));
});

test('low candidates are not merged', () => {
  assert.ok(L.stats.lowUnmerged > 0);
  const clusterOf = new Map();
  for (const c of L.clusters) for (const n of c.nodes) clusterOf.set(key(n), c.clusterId);
  for (const c of L.clusters) for (const lc of c.lowCandidates.slice(0, 200)) {
    assert.notEqual(clusterOf.get(key(lc.nodeA)), clusterOf.get(key(lc.nodeB)));
  }
});

test('does not read pid', () => {
  assert.ok(!/\bpid\b/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'linkage.js'), 'utf8')));
});

test('heroes each resolve to one cluster with evidence', () => {
  const clusterOf = new Map();
  for (const c of L.clusters) for (const n of c.nodes) clusterOf.set(key(n), c);
  for (const h of ['H1', 'H2', 'H3', 'H4']) {
    const pid = W.heroes[h];
    const cs = new Set();
    for (const [k, rec] of T) if (rec.pid === pid && clusterOf.has(k)) cs.add(clusterOf.get(k));
    assert.equal(cs.size, 1, `${h} clusters`);
    const c = [...cs][0];
    assert.ok(c.nodes.length >= 2 && c.evidence.length >= 1, `${h} evidence`);
  }
});

test('stats are consistent and helpers behave', () => {
  const s = L.stats;
  assert.equal(s.resolvedFans, L.clusters.length);
  const ev = { email: 0, phone: 0, fuzzy: 0 };
  let evTotal = 0, lowTotal = 0;
  for (const c of L.clusters) {
    lowTotal += c.lowCandidates.length;
    for (const e of c.evidence) { ev[e.method]++; evTotal++; }
  }
  assert.equal(lowTotal, s.byConfidence.low);
  assert.equal(evTotal, s.sourceRecords - s.resolvedFans);
  assert.equal(ev.email, s.byMethod.email);
  assert.equal(ev.fuzzy, s.byMethod.fuzzy);
  assert.ok(ev.phone <= s.byMethod.phone);
  assert.ok(s.byConfidence.low < s.resolvedFans, String(s.byConfidence.low));
  assert.ok(L.clusters.some((c) => c.confidence === 'medium'));
  assert.ok(s.byMethod.fuzzy > 0 && s.byMethod.email > 0 && s.byMethod.phone > 0);
  assert.equal(soundex('Robert'), soundex('Rupert'));
  assert.equal(soundex('Halvorsen'), soundex('Halvorson'));
  assert.ok(jaroWinkler('Jennifer', 'Jennifer') === 1 && jaroWinkler('Jennifer', 'Jennifur') >= 0.92 && jaroWinkler('Dale', 'Katherine') < 0.7);
});

test('minors never lose flag and clusters have contact fields', () => {
  for (const c of L.clusters.slice(0, 500)) {
    assert.ok(c.emails.every((e) => e === e.toLowerCase().trim()));
    assert.ok(c.phones.every((p) => /^\d+$/.test(p)));
    assert.ok(['high', 'medium'].includes(c.confidence));
  }
});
