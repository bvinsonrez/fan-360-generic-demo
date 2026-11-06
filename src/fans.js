// Unified Fan records: one per linkage cluster, with the attributes tab 5 shows and
// tab 6 filters on. Records are joined to fans by the node ids documented in linkage.js;
// F&B txns and Kids Club rows that are not nodes join by the same contact key linkage uses.
const { SEASONS, PREMIUM_AREAS } = require('./config');

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => String(p || '').replace(/\D/g, '');
const contactKey = (r) => `${String(r.name).toLowerCase()}|${normEmail(r.email)}|${normPhone(r.phone)}`;

// Higher rank wins when a fan holds several accounts in one season.
const PLAN_RANK = { none: 0, single: 1, triple_play: 2, ballpark_pass: 3, season_pre: 4, starter: 4, reserved: 5, choice: 5 };
const CONSENT_RANK = { none: 0, opt_out: 1, opt_in: 2 };
const PREMIUM = new Set(PREMIUM_AREAS);
const Y0 = SEASONS[0];
const NS = SEASONS.length;

function regionForZip(zip) {
  const z = Number(String(zip || '').slice(0, 3));
  if (z >= 550 && z <= 567) return 'Home state';
  if (z >= 530 && z <= 549) return 'Neighbor state (east)';
  if (z >= 500 && z <= 528) return 'Neighbor state (south)';
  if (z >= 570 && z <= 588) return 'Neighbor states (west)';
  return 'Other';
}

// Season-indexed typed arrays (index = fan * NS + season offset) keep the hot loops cheap;
// they become { 2024, 2025, 2026 } objects once at the end. The object literal is much faster
// than assigning integer keys one by one, so the seasons are spelled out here.
if (NS !== 3 || Y0 !== 2024) throw new Error('fans.js bySeason expects seasons 2024–2026');
const same = (v) => v;
function bySeason(arr, i, map = same) {
  const b = i * NS;
  return { 2024: map(arr[b]), 2025: map(arr[b + 1]), 2026: map(arr[b + 2]) };
}

function buildFans(world, linkage) {
  const clusters = linkage.clusters;
  const nf = clusters.length;
  const plan = new Uint8Array(nf * NS);
  const games = new Uint16Array(nf * NS);
  const ticketGames = new Uint16Array(nf * NS);
  const xfer = new Uint16Array(nf * NS);
  const fnb = new Float64Array(nf * NS);
  const retail = new Uint8Array(nf * NS);
  const spend = new Float64Array(nf * NS);
  const active = new Uint8Array(nf * NS);
  const sysT = new Uint8Array(nf), sysF = new Uint8Array(nf), sysG = new Uint8Array(nf);
  const outings = new Uint16Array(nf);
  const premOwn = new Uint16Array(nf), premXfer = new Uint16Array(nf), premGroup = new Uint16Array(nf);
  const surveySat = new Array(nf).fill(null);
  const surveySeason = new Int16Array(nf).fill(-1);
  const kids = Array.from({ length: nf }, () => []);
  const consentDetail = Array.from({ length: nf }, () => ({}));
  const dnc = new Uint8Array(nf);
  const planNames = Object.keys(PLAN_RANK);
  const planIdx = Object.fromEntries(planNames.map((p, i) => [p, i]));

  const byNode = new Map();
  clusters.forEach((c, i) => { for (const n of c.nodes) byNode.set(`${n.source}:${n.id}`, i); });
  const fanFor = (source, id) => byNode.get(`${source}:${id}`);
  const si = (yr) => yr - Y0;

  // ---- ticketing accounts and scans ----
  const byTkt = new Map();
  for (const t of world.ticketing) {
    const f = fanFor('ticketing', t.tktId);
    byTkt.set(t.tktId, f);
    sysT[f] = 1;
    for (const yr of SEASONS) {
      const s = t.seasons[yr];
      const k = f * NS + si(yr);
      if (PLAN_RANK[s.plan] > PLAN_RANK[planNames[plan[k]]]) plan[k] = planIdx[s.plan];
      xfer[k] += s.transfersSent;
      spend[k] += s.ticketSpend;
      if (s.plan !== 'none') active[k] = 1;
    }
  }
  for (const s of world.scans) {
    if (!s.tktId) continue;
    const f = byTkt.get(s.tktId);
    const k = f * NS + si(s.season);
    ticketGames[k]++;
    games[k]++;
    active[k] = 1;
    if (PREMIUM.has(s.seatArea)) {
      if (s.viaTransfer) premXfer[f]++;
      else premOwn[f]++;
    }
  }

  // ---- groups: organizer and known attendees each count one outing and one game ----
  for (const g of world.groups) {
    const named = [fanFor('groups', `${g.bookingId}:organizer`)];
    for (let a = 0; a < g.knownAttendees.length; a++) named.push(fanFor('groups', `${g.bookingId}:attendee:${a}`));
    spend[named[0] * NS + si(g.season)] += g.amount;
    for (const f of named) {
      const k = f * NS + si(g.season);
      sysG[f] = 1;
      outings[f]++;
      games[k]++;
      active[k] = 1;
      if (PREMIUM.has(g.seatArea)) premGroup[f]++;
    }
  }

  // ---- F&B and retail ----
  const fnbByKey = new Map();
  for (const t of world.fnbIdentified) {
    const key = contactKey(t);
    let f = fnbByKey.get(key);
    if (f === undefined) { f = fanFor('fnb', t.txnId); fnbByKey.set(key, f); }
    const k = f * NS + si(t.season);
    sysF[f] = 1;
    fnb[k] += t.amount;
    spend[k] += t.amount;
    active[k] = 1;
    if (t.venue === 'team_store' || t.venue === 'mobile') retail[k] = 1;
  }

  // ---- experiences (part of the Groups & Experiences system), surveys, Kids Club ----
  for (const e of world.experiences) {
    const f = fanFor('experiences', e.expId);
    const k = f * NS + si(e.season);
    sysG[f] = 1;
    spend[k] += e.amount;
    active[k] = 1;
  }
  for (const s of world.surveys) {
    const f = fanFor('surveys', s.respId);
    if (s.season >= surveySeason[f]) { surveySat[f] = s.satisfaction; surveySeason[f] = s.season; }
  }
  const kcByKey = new Map();
  for (const r of world.kidsClub) {
    const key = contactKey(r.parent);
    let f = kcByKey.get(key);
    if (f === undefined) { f = fanFor('kidsClub', r.kcId); kcByKey.set(key, f); }
    kids[f].push({ kcId: r.kcId, joinDate: r.joinDate });
  }

  // ---- consent and do-not-contact, matched on normalized contacts ----
  const fanByEmail = new Map();
  const fanByPhone = new Map();
  clusters.forEach((c, i) => {
    for (const e of c.emails) fanByEmail.set(e, i);
    for (const p of c.phones) fanByPhone.set(p, i);
  });
  for (const r of world.consent) {
    const f = r.channel === 'sms' ? fanByPhone.get(normPhone(r.contact)) : fanByEmail.get(normEmail(r.contact));
    if (f === undefined) continue;
    const cur = consentDetail[f][r.channel];
    if (!cur || CONSENT_RANK[r.status] > CONSENT_RANK[cur.status]) {
      consentDetail[f][r.channel] = { status: r.status, source: r.source, date: r.date };
    }
  }
  for (const d of world.dnc) {
    const f = fanByEmail.has(normEmail(d)) ? fanByEmail.get(normEmail(d)) : fanByPhone.get(normPhone(d));
    if (f !== undefined) dnc[f] = 1;
  }

  // ---- assemble ----
  const fans = clusters.map((c, i) => {
    const plans = bySeason(plan, i, (v) => planNames[v]);
    const g = bySeason(games, i);
    let activeN = 0, total = 0;
    for (let s = 0; s < NS; s++) if (active[i * NS + s]) { activeN++; total += spend[i * NS + s]; }
    const cd = consentDetail[i];
    return {
      fanId: c.clusterId, name: c.name, zip: c.zip, region: regionForZip(c.zip),
      isMinor: c.nodes.some((n) => n.isMinor), heroId: (c.nodes.find((n) => n.heroId) || {}).heroId || null,
      plans, games: g, ticketGames: bySeason(ticketGames, i),
      attendanceChangePct: g[2025] > 0 ? Math.round(((g[2026] - g[2025]) / g[2025]) * 100) : null,
      transfersSent: bySeason(xfer, i), fnbSpend: bySeason(fnb, i), fnbPercentile2026: null,
      retailOrApp: bySeason(retail, i, (v) => v === 1),
      seasonsActive: activeN, groupOutings: outings[i],
      ownTicketEver: SEASONS.some((yr) => plans[yr] !== 'none'),
      singleGameBefore2026: plans[2024] === 'single' || plans[2025] === 'single',
      premium: { own: premOwn[i], viaTransfer: premXfer[i], viaGroup: premGroup[i] },
      surveySat: surveySat[i], kidsClubChildren: kids[i],
      consent: { email: cd.email ? cd.email.status : 'none', sms: cd.sms ? cd.sms.status : 'none', push: cd.push ? cd.push.status : 'none' },
      consentDetail: cd, dnc: dnc[i] === 1,
      systems: sysT[i] + sysF[i] + sysG[i],
      annualValue: activeN ? total / activeN : 0,
      nodes: c.nodes, evidence: c.evidence, confidence: c.confidence, emails: c.emails, phones: c.phones,
    };
  });

  // Percentile rank among fans with any 2026 F&B: share of other spenders below this fan, 0–100 (ties share a rank).
  const spenders = fans.filter((f) => f.fnbSpend[2026] > 0).sort((a, b) => a.fnbSpend[2026] - b.fnbSpend[2026]);
  const n = spenders.length;
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && spenders[j + 1].fnbSpend[2026] === spenders[i].fnbSpend[2026]) j++;
    const pct = n === 1 ? 100 : Math.round((i / (n - 1)) * 100);
    for (let k = i; k <= j; k++) spenders[k].fnbPercentile2026 = pct;
    i = j + 1;
  }
  return fans;
}

module.exports = { buildFans, regionForZip, normEmail, normPhone, contactKey };
