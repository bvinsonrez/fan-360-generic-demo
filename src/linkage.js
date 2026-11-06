// Identity resolution over the per-system source records.
//
// Node id scheme (cluster.nodes[].source + id), so later code can map back to world records:
//   ticketing    id = tktId                       -> world.ticketing[].tktId
//   fnb          id = txnId of the first identified transaction for a distinct name+email+phone
//                (identical contacts are deduped; other txns with the same contact share that node)
//   groups       id = `${bookingId}:organizer`    -> world.groups[].organizer
//                id = `${bookingId}:attendee:${k}` -> world.groups[].knownAttendees[k]
//   experiences  id = expId                       -> world.experiences[].buyer
//   surveys      id = respId                      -> world.surveys[]
//   kidsClub     id = kcId of the first row for a distinct parent name+email+phone
// Anonymous F&B and Kids Club children are not nodes. Each node also carries isMinor and heroId.
//
// Match stats are all in node-PAIR units. For a group of k nodes sharing an email (or phone) we count
// the k-1 spanning pairs (first node to each other node), not all k(k-1)/2 pairs. A phone pair whose
// two nodes also share an email is attributed to email only.
//   byMethod.email / .phone = spanning pairs by key; byMethod.fuzzy = fuzzy pairs that merged clusters
//   byConfidence.high = email + phone, medium = fuzzy, low = lowCandidates pairs (= lowUnmerged)
//   candidateMatches = high + medium + low
// lowCandidates: same last name + zip, not merged, first names plausibly the same person
// (same first initial or Jaro-Winkler >= 0.80) but failing the merge test.

const NICKNAMES = {
  bob: 'robert', bill: 'william', kate: 'katherine', jim: 'james', mike: 'michael',
  liz: 'elizabeth', tom: 'thomas', jen: 'jennifer',
};

function soundex(str) {
  const s = String(str || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const codes = { B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 };
  let out = s[0];
  let prev = codes[s[0]] || 0;
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i];
    const c = codes[ch] || 0;
    if (c && c !== prev) out += c;
    if (ch !== 'H' && ch !== 'W') prev = c;
  }
  return (out + '000').slice(0, 4);
}

function jaroWinkler(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - win), hi = Math.min(lb - 1, i + win);
    for (let j = lo; j <= hi; j++) {
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let l = 0;
  while (l < 4 && l < la && l < lb && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => String(p || '').replace(/\D/g, '');
function splitName(name) {
  const parts = String(name || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : '' };
}
const canonFirst = (f) => NICKNAMES[f] || f;

function resolveIdentities(world) {
  // ---- build nodes ----
  const nodes = [];
  function addNode(source, id, rec) {
    const { first, last } = splitName(rec.name);
    nodes.push({
      source, id, name: rec.name || '', first, last, zip: rec.zip || '',
      email: normEmail(rec.email), phone: normPhone(rec.phone),
      isMinor: !!rec.isMinor, heroId: rec.heroId || null,
    });
  }
  for (const t of world.ticketing) addNode('ticketing', t.tktId, t);
  const seenFnb = new Set();
  for (const f of world.fnbIdentified) {
    const k = `${String(f.name).toLowerCase()}|${normEmail(f.email)}|${normPhone(f.phone)}`;
    if (seenFnb.has(k)) continue;
    seenFnb.add(k);
    addNode('fnb', f.txnId, f);
  }
  for (const g of world.groups) {
    addNode('groups', `${g.bookingId}:organizer`, g.organizer);
    g.knownAttendees.forEach((a, k) => addNode('groups', `${g.bookingId}:attendee:${k}`, a));
  }
  for (const e of world.experiences) addNode('experiences', e.expId, e.buyer);
  for (const s of world.surveys) addNode('surveys', s.respId, s);
  const seenKc = new Set();
  for (const k of world.kidsClub) {
    const p = k.parent;
    const key = `${String(p.name).toLowerCase()}|${normEmail(p.email)}|${normPhone(p.phone)}`;
    if (seenKc.has(key)) continue;
    seenKc.add(key);
    addNode('kidsClub', k.kcId, p);
  }
  const n = nodes.length;

  // ---- union-find ----
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const byMethod = { email: 0, phone: 0, fuzzy: 0 };
  const mergeEdges = []; // [a, b, method]
  function link(a, b, method) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    parent[rb] = ra;
    mergeEdges.push([a, b, method]);
  }

  // exact keys (star edges to the first node holding the value)
  for (const [field, method] of [['email', 'email'], ['phone', 'phone']]) {
    const first = new Map();
    for (let i = 0; i < n; i++) {
      const v = nodes[i][field];
      if (!v) continue;
      if (first.has(v)) {
        const f = first.get(v);
        const dupOfEmail = method === 'phone' && nodes[f].email && nodes[f].email === nodes[i].email;
        if (!dupOfEmail) byMethod[method]++;
        link(f, i, method);
      }
      else first.set(v, i);
    }
  }

  // fuzzy within blocking key; same last+zip failing the test becomes a low candidate
  const blocks = new Map();
  const lastZip = new Map();
  for (let i = 0; i < n; i++) {
    const x = nodes[i];
    if (!x.zip || !x.last || !x.first) continue;
    const cf = canonFirst(x.first);
    x.cf = cf;
    const bk = `${x.zip}|${soundex(x.last)}|${cf[0]}`;
    if (!blocks.has(bk)) blocks.set(bk, []);
    blocks.get(bk).push(i);
    const lz = `${x.zip}|${x.last}`;
    if (!lastZip.has(lz)) lastZip.set(lz, []);
    lastZip.get(lz).push(i);
  }
  for (const list of blocks.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const x = nodes[list[a]], y = nodes[list[b]];
        if (find(list[a]) === find(list[b])) continue;
        if (x.cf === y.cf || jaroWinkler(x.first, y.first) >= 0.92) { byMethod.fuzzy++; link(list[a], list[b], 'fuzzy'); }
      }
    }
  }
  const lowPairs = [];
  for (const list of lastZip.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (find(list[a]) === find(list[b])) continue;
        const x = nodes[list[a]], y = nodes[list[b]];
        if (x.first[0] === y.first[0] || x.cf[0] === y.cf[0] || jaroWinkler(x.first, y.first) >= 0.8) lowPairs.push([list[a], list[b]]);
      }
    }
  }

  // ---- assemble clusters ----
  const groupsByRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groupsByRoot.has(r)) groupsByRoot.set(r, []);
    groupsByRoot.get(r).push(i);
  }
  const clusterIdx = new Map();
  const clusters = [];
  for (const [root, members] of groupsByRoot) {
    const emails = new Set(), phones = new Set();
    const nameCount = new Map(), zipCount = new Map();
    for (const i of members) {
      const x = nodes[i];
      if (x.email) emails.add(x.email);
      if (x.phone) phones.add(x.phone);
      if (x.name) nameCount.set(x.name, (nameCount.get(x.name) || 0) + 1);
      if (x.zip) zipCount.set(x.zip, (zipCount.get(x.zip) || 0) + 1);
    }
    const top = (m) => { let best = '', bc = 0; for (const [k, c] of m) if (c > bc) { best = k; bc = c; } return best; };
    const c = {
      clusterId: `C${String(clusters.length + 1).padStart(6, '0')}`,
      nodes: members.map((i) => ({ source: nodes[i].source, id: nodes[i].id, isMinor: nodes[i].isMinor, heroId: nodes[i].heroId })),
      emails: [...emails], phones: [...phones],
      name: top(nameCount), zip: top(zipCount),
      confidence: 'high', evidence: [], lowCandidates: [],
    };
    clusterIdx.set(root, c);
    clusters.push(c);
  }
  for (const [a, b, method] of mergeEdges) {
    const c = clusterIdx.get(find(a));
    c.evidence.push({ a: nodes[a].id, b: nodes[b].id, method });
    if (method === 'fuzzy') c.confidence = 'medium';
  }
  for (const [a, b] of lowPairs) {
    const ref = (i) => ({ source: nodes[i].source, id: nodes[i].id });
    clusterIdx.get(find(a)).lowCandidates.push({ nodeA: ref(a), nodeB: ref(b) });
  }

  const byConfidence = { high: byMethod.email + byMethod.phone, medium: byMethod.fuzzy, low: lowPairs.length };
  const candidateMatches = byConfidence.high + byConfidence.medium + byConfidence.low;
  return {
    clusters,
    stats: {
      sourceRecords: n, candidateMatches, resolvedFans: clusters.length,
      byMethod, byConfidence, lowUnmerged: lowPairs.length,
    },
  };
}

module.exports = { resolveIdentities, soundex, jaroWinkler };
