// Tab 6: segment filters, consent waterfall, channel projections and builder state.
const { CHANNELS, SCALE } = require('./config');
const { roundParts, scaled, fmtCount, fmtMoney, fmtPct } = require('./format');

const DEFAULT_FILTERS = {
  plan2026: [], seasonsActiveMin: 0, games2026Min: null, games2026Max: null,
  attendanceChangeMaxPct: null, fnbPercentile2026Min: null, keptTransferring2026: false,
  retailOrApp2026: false, groupOutingsMin: 0, neverOwnTicket: false, singleGameBefore2026: false,
  premiumViaTransferOrGroup: false, excludePremiumOwn: false, surveySatMax: null,
  kidsClubHousehold: false, regions: [],
};

const has = (v) => v !== null && v !== undefined;

function applyFilters(fans, filters) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  return fans.filter((x) => {
    if (f.plan2026.length && !f.plan2026.includes(x.plans[2026])) return false;
    if (f.seasonsActiveMin > 0 && x.seasonsActive < f.seasonsActiveMin) return false;
    if (has(f.games2026Min) && x.games[2026] < f.games2026Min) return false;
    if (has(f.games2026Max) && x.games[2026] > f.games2026Max) return false;
    if (has(f.attendanceChangeMaxPct) && !(x.attendanceChangePct !== null && x.attendanceChangePct <= f.attendanceChangeMaxPct)) return false;
    if (has(f.fnbPercentile2026Min) && !(x.fnbPercentile2026 !== null && x.fnbPercentile2026 >= f.fnbPercentile2026Min)) return false;
    if (f.keptTransferring2026 && !(x.transfersSent[2026] > 0)) return false;
    if (f.retailOrApp2026 && !x.retailOrApp[2026]) return false;
    if (f.groupOutingsMin > 0 && x.groupOutings < f.groupOutingsMin) return false;
    if (f.neverOwnTicket && x.ownTicketEver) return false;
    if (f.singleGameBefore2026 && !x.singleGameBefore2026) return false;
    if (f.premiumViaTransferOrGroup && !(x.premium.viaTransfer + x.premium.viaGroup > 0)) return false;
    if (f.excludePremiumOwn && x.premium.own !== 0) return false;
    if (has(f.surveySatMax) && !(x.surveySat !== null && x.surveySat <= f.surveySatMax)) return false;
    if (f.kidsClubHousehold && !(x.kidsClubChildren.length > 0)) return false;
    if (f.regions.length && !f.regions.includes(x.region)) return false;
    return true;
  });
}

const STEP_LABELS = {
  no_opt_in: 'No opt-in on record',
  opted_out: 'Opted out',
  dnc: 'Do-not-contact',
  minor: 'Minors (Kids Club children are never included)',
  duplicate: 'Duplicate contacts removed',
};

const channelById = (id) => {
  const c = CHANNELS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown channel ${id}`);
  return c;
};

// Contacts that identify a fan on a channel; push has no shared contact, so it never dedupes.
function channelContacts(fan, channelId) {
  if (channelId === 'sms') return fan.phones;
  if (channelId === 'push') return [];
  return fan.emails;
}

function consentWaterfall(fans, channelId) {
  const key = channelById(channelId).consentKey;
  const removed = { no_opt_in: 0, opted_out: 0, dnc: 0, minor: 0, duplicate: 0 };
  let remaining = [];
  for (const f of fans) {
    const c = f.consent[key];
    if (c === 'opt_out') removed.opted_out++;
    else if (c !== 'opt_in') removed.no_opt_in++;
    else remaining.push(f);
  }
  // Steps run in brief order on what remains: opt-in checks, then do-not-contact, minors, duplicates.
  const afterDnc = [];
  for (const f of remaining) { if (f.dnc) removed.dnc++; else afterDnc.push(f); }
  const afterMinor = [];
  for (const f of afterDnc) { if (f.isMinor) removed.minor++; else afterMinor.push(f); }
  const kept = new Set();
  let eligible = 0;
  for (const f of afterMinor.slice().sort((a, b) => (a.fanId < b.fanId ? -1 : a.fanId > b.fanId ? 1 : 0))) {
    const cs = channelContacts(f, channelId);
    if (cs.some((c) => kept.has(c))) { removed.duplicate++; continue; }
    for (const c of cs) kept.add(c);
    eligible++;
  }
  const steps = ['no_opt_in', 'opted_out', 'dnc', 'minor', 'duplicate']
    .map((id) => ({ id, label: STEP_LABELS[id], removed: removed[id] }));
  const display = roundParts([eligible, ...steps.map((s) => s.removed)].map((v) => v * SCALE));
  return { start: fans.length, eligible, steps, display };
}

const FUNNEL = {
  email: ['delivered', 'opened', 'clicked', 'purchased'],
  sms: ['delivered', 'opened', 'clicked', 'purchased'],
  push: ['delivered', 'opened', 'clicked', 'purchased'],
  social: ['matched', 'clicked', 'purchased'],
};

function projectResults(eligible, channelIds) {
  const perChannel = channelIds.map((id) => {
    const ch = channelById(id);
    const metrics = {};
    for (const step of FUNNEL[id]) metrics[step] = Math.round(eligible * ch.rates[step]);
    return { channelId: id, label: ch.label, metrics, revenue: metrics.purchased * ch.aov, rates: { ...ch.rates }, aov: ch.aov };
  });
  return {
    perChannel,
    combined: {
      purchases: perChannel.reduce((a, c) => a + c.metrics.purchased, 0),
      revenue: perChannel.reduce((a, c) => a + c.revenue, 0),
    },
  };
}

const STEP_ROW_LABELS = { delivered: 'Delivered', opened: 'Opened', clicked: 'Clicked', matched: 'Matched', purchased: 'Purchases' };

// Display strings for projectResults output; tab 6 renders exactly these.
function projectionDisplay(results) {
  const perChannel = results.perChannel.map((c) => ({
    channelId: c.channelId,
    label: c.label,
    rows: [
      ...Object.keys(c.metrics).map((k) => ({ label: STEP_ROW_LABELS[k], value: fmtCount(scaled(c.metrics[k])) })),
      { label: 'Projected revenue', value: fmtMoney(scaled(c.revenue)) },
    ],
  }));
  const combined = [
    { label: 'Combined purchases', value: fmtCount(scaled(results.combined.purchases)) },
    { label: 'Combined revenue', value: fmtMoney(scaled(results.combined.revenue)) },
  ];
  return { perChannel, combined };
}

// Stated assumptions for a channel, as shown under its projections on tab 6.
function assumptionText(ch) {
  const pct = (r) => fmtPct(r, Math.abs(r * 100 - Math.round(r * 100)) > 1e-9 ? 1 : 0);
  const rates = Object.keys(ch.rates).map((k) => `${STEP_ROW_LABELS[k]} ${pct(ch.rates[k])}`).join(', ');
  return `Assumptions, share of eligible fans: ${rates}, average order ${fmtMoney(ch.aov)}.`;
}

// Combined purchases and revenue across single-channel projectResults outputs, as display rows.
function combineProjections(results) {
  const per = results.map((r) => r.perChannel[0]);
  return projectionDisplay({
    perChannel: per,
    combined: {
      purchases: per.reduce((a, c) => a + c.metrics.purchased, 0),
      revenue: per.reduce((a, c) => a + c.revenue, 0),
    },
  }).combined;
}

function createSegmentState() {
  return { filters: { ...DEFAULT_FILTERS, plan2026: [], regions: [] }, channelIds: ['email'], fromRecommendation: null };
}

function applyRecommendation(state, rec) {
  return {
    ...state,
    filters: { ...DEFAULT_FILTERS, plan2026: [], regions: [], ...rec.filters },
    channelIds: ['email'],
    fromRecommendation: { id: rec.id, name: rec.name },
  };
}

function setFilter(state, key, value) {
  return { ...state, filters: { ...state.filters, [key]: value }, fromRecommendation: null };
}

module.exports = {
  DEFAULT_FILTERS, applyFilters, consentWaterfall, projectResults, projectionDisplay,
  createSegmentState, applyRecommendation, setFilter, STEP_ROW_LABELS,
  assumptionText, combineProjections,
};
