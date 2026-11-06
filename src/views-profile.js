// Tab 5: fan search and the role-masked unified profile. Per-person values are not scaled.
const { SEASONS, PLANS, CHANNELS } = require('./config');
const { fmtMoney } = require('./format');

const ROLES = { sales: 'Ticket Sales Rep', privacy: 'Privacy & Data Governance' };
const HERO_ORDER = ['H1', 'H2', 'H3', 'H4'];
const MAX_RESULTS = 20;
const RESTRICTED = 'Restricted';

// Children are not Fans, so a search over fans can never return one.
function searchFans(fans, query) {
  const q = String(query || '').trim().toLowerCase();
  const heroes = HERO_ORDER.map((id) => fans.find((f) => f.heroId === id)).filter(Boolean);
  if (!q) return heroes;
  const hit = (f) => f.name.toLowerCase().includes(q) || f.emails.some((e) => e.toLowerCase().includes(q));
  const out = heroes.filter(hit);
  for (const f of fans) {
    if (out.length >= MAX_RESULTS) break;
    if (!f.heroId && hit(f)) out.push(f);
  }
  return out.slice(0, MAX_RESULTS);
}

const STATUS_LABEL = { opt_in: 'Opted in', opt_out: 'Opted out', none: 'No record' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// world indexes are built once per world.
const indexes = new WeakMap();
function worldIndex(world) {
  let ix = indexes.get(world);
  if (ix) return ix;
  ix = {
    games: new Map(world.games.map((g) => [g.gameId, g])),
    groups: new Map(world.groups.map((g) => [g.bookingId, g])),
    experiences: new Map(world.experiences.map((e) => [e.expId, e])),
  };
  indexes.set(world, ix);
  return ix;
}

function nodeConfidence(fan) {
  const best = new Map();
  for (const e of fan.evidence) {
    const rank = e.method === 'fuzzy' ? 'medium' : 'high';
    for (const id of [e.a, e.b]) if (best.get(id) !== 'high') best.set(id, rank);
  }
  return (node) => best.get(node.id) || 'high';
}

function swimlanes(fan, world) {
  const ix = worldIndex(world);
  const ticketing = [], fnb = [], groups = [];
  const lastDate = (yr) => `${yr}-09-30`;
  for (const yr of SEASONS) {
    const parts = [];
    if (fan.ticketGames[yr] > 0) parts.push(`${fan.ticketGames[yr]} games`);
    if (fan.plans[yr] !== 'none') parts.push(PLANS[fan.plans[yr]]);
    if (parts.length) ticketing.push({ season: yr, date: lastDate(yr), kind: 'attendance', label: parts.join(', ') });
    if (fan.transfersSent[yr] > 0) ticketing.push({ season: yr, date: lastDate(yr), kind: 'transfer', label: `${fan.transfersSent[yr]} tickets transferred` });
    if (fan.fnbSpend[yr] > 0) {
      const retail = fan.retailOrApp[yr] ? ' (includes Team Store or app)' : '';
      fnb.push({ season: yr, date: lastDate(yr), kind: 'spend', label: `${fmtMoney(Math.round(fan.fnbSpend[yr]))} F&B${retail}` });
    }
  }
  for (const n of fan.nodes) {
    if (n.source === 'groups') {
      const g = ix.groups.get(n.id.split(':')[0]);
      if (!g) continue;
      const game = ix.games.get(g.gameId);
      const role = n.id.endsWith(':organizer') ? '' : ' (attendee)';
      groups.push({ season: g.season, date: game ? game.date : lastDate(g.season), kind: 'group', label: `Group outing: ${g.type}${role}` });
    } else if (n.source === 'experiences') {
      const e = ix.experiences.get(n.id);
      if (e) groups.push({ season: e.season, date: lastDate(e.season), kind: 'experience', label: `Experience: ${e.kind}` });
    }
  }
  groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return [
    { system: 'Ticketing & Entry', events: ticketing },
    { system: 'F&B & Retail', events: fnb },
    { system: 'Groups & Experiences', events: groups },
  ];
}

function fanProfileView(fan, role, world) {
  const privacy = role === 'privacy';
  const field = (group, label, value, restrictedForSales = false) => (
    restrictedForSales && !privacy
      ? { group, label, value: RESTRICTED, restricted: true }
      : { group, label, value: String(value), restricted: false });

  const fields = [
    field('Contact', 'Email', fan.emails.join(', ') || 'None on file', true),
    field('Contact', 'Phone', fan.phones.join(', ') || 'None on file', true),
    field('Contact', 'ZIP', fan.zip, true),
    field('Contact', 'Region', fan.region),
  ];
  for (const yr of SEASONS) {
    fields.push(field('Ticketing', `${yr} plan`, PLANS[fan.plans[yr]]));
  }
  fields.push(
    field('Ticketing', '2026 games attended (incl. group outings)', fan.games[2026]),
    field('Ticketing', '2026 tickets transferred', fan.transfersSent[2026]),
    field('F&B', '2026 F&B spend', fmtMoney(Math.round(fan.fnbSpend[2026]))),
    field('Engagement', 'Group outings', fan.groupOutings),
    field('Engagement', 'Survey satisfaction', fan.surveySat === null ? 'No response' : `${fan.surveySat} of 10`),
  );
  for (const ch of CHANNELS.filter((c) => c.id !== 'social')) {
    const d = fan.consentDetail[ch.id];
    fields.push(field('Consent', `${ch.label} status`, STATUS_LABEL[fan.consent[ch.id]]));
    fields.push(field('Consent', `${ch.label} source and date`, d ? `${d.source}, ${d.date}` : 'No record', true));
  }
  fields.push(field('Consent', 'Do-not-contact', fan.dnc ? 'Yes' : 'No'));
  fields.push(
    field('Linkage', 'Match confidence', fan.confidence),
    field('Linkage', 'Match evidence', fan.evidence.length
      ? fan.evidence.map((e) => `${e.a} to ${e.b} by ${e.method}`).join('; ')
      : 'Single source record', true),
  );

  const conf = nodeConfidence(fan);
  const sources = fan.nodes.map((n) => ({ source: n.source, id: n.id, confidence: conf(n) }));

  const kids = fan.kidsClubChildren;
  let household = [];
  if (kids.length) {
    household = privacy
      ? kids.map((k, i) => ({ label: 'Kids Club', value: `Member ${i + 1}: active, joined ${k.joinDate}`, restricted: false }))
      : [{ label: 'Kids Club', value: `${plural(kids.length, 'Kids Club member', 'Kids Club members')} (restricted)`, restricted: true }];
  }

  return {
    header: {
      fanId: fan.fanId, name: fan.name, heroId: fan.heroId, region: fan.region,
      role, roleLabel: ROLES[role], confidence: fan.confidence, systems: fan.systems,
    },
    fields,
    swimlanes: swimlanes(fan, world),
    sources,
    household,
  };
}

module.exports = { searchFans, fanProfileView, ROLES };
