// Tabs 1–3: what each source system can show on its own, before linking.
// Every count is an aggregate over the sample, scaled ×SCALE; per-game ratios are not scaled.
const { SEASONS, GATES, GROUP_TYPES, PREMIUM_AREAS, MEMBER_PLANS } = require('./config');
const { scaled, fmtCount, fmtMoney, fmtPct } = require('./format');

const LAST = SEASONS[SEASONS.length - 1];
const PLAN_ORDER = ['season_pre', 'choice', 'reserved', 'starter', 'ballpark_pass', 'triple_play', 'single'];
// Three buckets for the plan chart. Members sit on the baseline and carry the accent.
const PLAN_BUCKETS = [
  { name: 'Season ticket or membership', plans: ['season_pre', ...MEMBER_PLANS], highlight: true },
  { name: 'Pass or bundle', plans: ['ballpark_pass', 'triple_play'] },
  { name: 'Single game', plans: ['single'] },
];
const seasonLabels = SEASONS.map(String);
const sum = (a) => a.reduce((x, y) => x + y, 0);

function gamesBySeason(world) {
  const out = {};
  for (const yr of SEASONS) out[yr] = world.games.filter((g) => g.season === yr);
  return out;
}

function ticketingView(world) {
  const perGame = new Map();
  const gate = {};
  for (const yr of SEASONS) gate[yr] = Object.fromEntries(GATES.map((g) => [g.id, 0]));
  let ticketed = 0;
  for (const s of world.scans) {
    perGame.set(s.gameId, (perGame.get(s.gameId) || 0) + 1);
    gate[s.season][s.gate]++;
    if (s.tktId && s.season === LAST) ticketed++;
  }
  const bySeason = gamesBySeason(world);
  const maxGames = Math.max(...SEASONS.map((yr) => bySeason[yr].length));
  const attendance = SEASONS.map((yr) => ({
    name: String(yr),
    data: Array.from({ length: maxGames }, (_, i) => (bySeason[yr][i] ? scaled(perGame.get(bySeason[yr][i].gameId) || 0) : null)),
  }));

  const planCount = {};
  const transfers = {};
  let noShows = 0;
  for (const yr of SEASONS) { planCount[yr] = Object.fromEntries(PLAN_ORDER.map((p) => [p, 0])); transfers[yr] = 0; }
  for (const t of world.ticketing) {
    for (const yr of SEASONS) {
      const s = t.seasons[yr];
      if (s.plan !== 'none') planCount[yr][s.plan]++;
      transfers[yr] += s.transfersSent;
      if (yr === LAST) noShows += s.noShows;
    }
  }
  const planSeries = PLAN_BUCKETS.map((b) => ({
    name: b.name, highlight: b.highlight,
    data: SEASONS.map((yr) => scaled(sum(b.plans.map((p) => planCount[yr][p])))),
  }));

  const totalScans = world.scans.length;
  const lastScans = sum(Object.values(gate[LAST]));
  const gatesSorted = GATES.map((g) => ({ label: g.label, v: scaled(gate[LAST][g.id]) })).sort((a, b) => b.v - a.v);
  const transferData = SEASONS.map((yr) => scaled(transfers[yr]));
  const transfersRose = transferData[transferData.length - 1] > transferData[transferData.length - 2];
  const noShowRate = noShows / (ticketed + noShows);

  return {
    intro: 'Every scan and plan sold through the ticketing platform and team app, three seasons. It shows how many tickets were used and where fans walked in.',
    kpis: [
      { id: 'scans', label: `Scans, ${SEASONS[0]}–${LAST}`, value: fmtCount(scaled(totalScans)) },
      { id: 'avgAttendance', label: `Average scans per game, ${LAST}`, value: fmtCount(scaled(lastScans) / bySeason[LAST].length) },
      { id: 'noShowRate', label: `No-show rate on ticketed seats, ${LAST}`, value: fmtPct(noShowRate) },
      { id: 'transfers', label: `Tickets transferred, ${LAST}`, value: fmtCount(scaled(transfers[LAST])) },
    ],
    charts: [
      { id: 'attendanceByGame', type: 'line', unit: 'count', title: 'Scans by home game, 2024–2026', seasonSeries: true,
        labels: Array.from({ length: maxGames }, (_, i) => `Game ${i + 1}`), series: attendance },
      { id: 'planMix', type: 'bar', unit: 'count', stacked: true, title: 'Ticket accounts by season: members vs. everyone else', labels: seasonLabels, series: planSeries },
      { id: 'scansByGate', type: 'bar', unit: 'count', title: `Scans by gate, ${LAST}, busiest first`, labels: gatesSorted.map((g) => g.label),
        series: [{ name: 'Scans', data: gatesSorted.map((g) => g.v) }] },
      { id: 'transfers', type: 'bar', unit: 'count', title: transfersRose ? `Ticket transfers rose in ${LAST}` : 'Tickets transferred by season', labels: seasonLabels,
        series: [{ name: 'Transfers sent', data: transferData }], highlightIndex: transfersRose ? SEASONS.length - 1 : undefined },
    ],
    cantTell: 'Who is actually in the seat when a ticket is transferred, or what they spend once inside.',
  };
}

function fnbView(world) {
  const bySeason = gamesBySeason(world);
  const revByGame = new Map();
  const cat = {};
  const venue = {};
  const txns = { identified: world.fnbIdentified.length, anonymous: 0 };
  for (const yr of SEASONS) {
    cat[yr] = { food: 0, beverage: 0, merch: 0 };
    venue[yr] = { concessions: 0, mobile: 0, team_store: 0 };
  }
  for (const a of world.fnbAnonymous) {
    revByGame.set(a.gameId, (revByGame.get(a.gameId) || 0) + a.revenue);
    txns.anonymous += a.txns;
    for (const c of ['food', 'beverage', 'merch']) cat[a.season][c] += a.byCategory[c];
    // Anonymous swipes: food and beverage at the stands, merchandise at the Team Store.
    venue[a.season].concessions += a.byCategory.food + a.byCategory.beverage;
    venue[a.season].team_store += a.byCategory.merch;
  }
  for (const t of world.fnbIdentified) {
    if (t.gameId) revByGame.set(t.gameId, (revByGame.get(t.gameId) || 0) + t.amount);
    cat[t.season][t.category] += t.amount;
    venue[t.season][t.venue] += t.amount;
  }
  const scansByGame = new Map();
  for (const s of world.scans) if (s.season === LAST) scansByGame.set(s.gameId, (scansByGame.get(s.gameId) || 0) + 1);
  const lastGames = bySeason[LAST];
  const revenue = lastGames.map((g) => Math.round(scaled(revByGame.get(g.gameId) || 0)));
  const inParkLast = sum(lastGames.map((g) => revByGame.get(g.gameId) || 0));
  const scansLast = sum([...scansByGame.values()]);
  const totalLast = cat[LAST].food + cat[LAST].beverage + cat[LAST].merch;
  const identifiedShare = txns.identified / (txns.identified + txns.anonymous);
  const money = (v) => Math.round(scaled(v));

  return {
    intro: 'Concession stands, mobile orders and the Team Store. Plenty of revenue detail, very little about who is buying.',
    kpis: [
      { id: 'revenue', label: `F&B and retail revenue, ${LAST}`, value: fmtMoney(scaled(totalLast)) },
      { id: 'perCap', label: `In-park spend per scan, ${LAST}`, value: fmtMoney(inParkLast / scansLast) },
      { id: 'identifiedShare', label: 'Transactions tied to a person', value: fmtPct(identifiedShare, 1) },
    ],
    charts: [
      { id: 'revenueByGame', type: 'line', unit: 'money', title: `F&B and retail revenue by game, ${LAST}`,
        labels: lastGames.map((_, i) => `Game ${i + 1}`),
        series: [{ name: 'Revenue', data: revenue }] },
      { id: 'categoryMix', type: 'bar', unit: 'money', title: 'Revenue by category, 2024–2026', seasonSeries: true,
        labels: ['Food', 'Beverage', 'Merchandise'],
        series: SEASONS.map((yr) => ({ name: String(yr), data: ['food', 'beverage', 'merch'].map((k) => money(cat[yr][k])) })) },
      { id: 'venueMix', type: 'bar', unit: 'money', title: 'Revenue by point of sale, 2024–2026', seasonSeries: true,
        labels: ['Concessions', 'Mobile orders', 'Team Store'],
        series: SEASONS.map((yr) => ({ name: String(yr), data: ['concessions', 'mobile', 'team_store'].map((k) => money(venue[yr][k])) })) },
      { id: 'identifiedShare', type: 'doughnut', unit: 'count', title: 'Transactions tied to a person, 2024–2026',
        labels: ['Tied to a person', 'Anonymous card swipe'],
        series: [{ name: 'Transactions', data: [scaled(txns.identified), scaled(txns.anonymous)] }], highlightIndex: 0 },
    ],
    cantTell: 'Who most of these buyers are, or whether the fan at the Team Store is the same fan who holds a ticket plan.',
  };
}

function medianInt(values) {
  const v = values.slice().sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

function groupsView(world) {
  const PREMIUM = new Set(PREMIUM_AREAS);
  const byType = {};
  const people = {};
  const exp = {};
  for (const yr of SEASONS) {
    byType[yr] = Object.fromEntries(GROUP_TYPES.map((t) => [t, 0]));
    people[yr] = { organizers: 0, known: 0, headcount: 0 };
    exp[yr] = { tour: 0, suite: 0, rooftop_deck: 0, premiumGroups: 0 };
  }
  for (const g of world.groups) {
    byType[g.season][g.type]++;
    const p = people[g.season];
    p.organizers++;
    p.known += g.knownAttendees.length;
    p.headcount += Math.max(0, g.size - 1 - g.knownAttendees.length);
    if (PREMIUM.has(g.seatArea)) exp[g.season].premiumGroups++;
  }
  for (const e of world.experiences) exp[e.season][e.kind]++;
  const lastBookings = world.groups.filter((g) => g.season === LAST);
  const lastAttendees = sum(lastBookings.map((g) => g.size));
  const lastNamed = people[LAST].organizers + people[LAST].known;
  const others = medianInt(world.groups.map((g) => g.size)) - 1;
  const mostlyHeadcount = SEASONS.every((yr) => people[yr].headcount > people[yr].organizers + people[yr].known);

  return {
    intro: 'Group outings, ballpark tours, suites and the Rooftop Deck. The organizer is known; most of the people they bring are a headcount.',
    kpis: [
      { id: 'bookings', label: `Group bookings, ${LAST}`, value: fmtCount(scaled(lastBookings.length)) },
      { id: 'attendees', label: `Group attendees, ${LAST}`, value: fmtCount(scaled(lastAttendees)) },
      { id: 'namedShare', label: 'Group attendees with a name on file', value: fmtPct(lastNamed / lastAttendees) },
    ],
    charts: [
      { id: 'bookingsByType', type: 'bar', unit: 'count', title: 'Group bookings by type, 2024–2026', labels: GROUP_TYPES, seasonSeries: true,
        series: SEASONS.map((yr) => ({ name: String(yr), data: GROUP_TYPES.map((t) => scaled(byType[yr][t])) })) },
      { id: 'knownVsHeadcount', type: 'bar', unit: 'count', stacked: true,
        title: mostlyHeadcount ? 'Most group attendees are a headcount, not a name' : 'Group attendees: named vs. headcount', labels: seasonLabels,
        series: [
          { name: 'Name on file (organizer or booking link)', data: SEASONS.map((yr) => scaled(people[yr].organizers + people[yr].known)), highlight: true },
          { name: 'Headcount only', data: SEASONS.map((yr) => scaled(people[yr].headcount)) },
        ] },
      { id: 'toursPremium', type: 'bar', unit: 'count', title: 'Tours and premium bookings, 2024–2026', seasonSeries: true,
        labels: ['Ballpark tours', 'Suites', 'Rooftop Deck', 'Groups in premium areas'],
        series: SEASONS.map((yr) => ({ name: String(yr), data: ['tour', 'suite', 'rooftop_deck', 'premiumGroups'].map((k) => scaled(exp[yr][k])) })) },
    ],
    cantTell: `Whether the ${others} other people in a group ever come back on their own.`,
    medianOthers: others,
  };
}

module.exports = { ticketingView, fnbView, groupsView };
