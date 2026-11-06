// Tab 7: pattern-detection rules expressed as tab 6 filter specs, scored into ranked cards.
const { applyFilters, consentWaterfall } = require('./segments');
const { scaled, fmtCount, fmtPct } = require('./format');

const RANKING_NOTE = 'Ranked by projected incremental 2027 ticket and F&B revenue from the eligible audience.';

const RULES = [
  {
    id: 'pass_power', name: 'Ballpark Pass power users',
    ruleText: 'Ballpark Pass holders in 2026 who attended 20 or more games and sit in the top half of F&B spend.',
    filters: { plan2026: ['ballpark_pass'], games2026Min: 20, fnbPercentile2026Min: 50 },
    conversionRate: 0.08, valuePerConversion: 640,
    valueAssumption: 'Assumes 8% take the 2027 Member Starter offer, worth about $640 each in added ticket and F&B revenue over a Ballpark Pass.',
    whyNow: 'Offer a 2027 Member Starter upgrade before Ballpark Pass goes on sale in February.',
    heroId: 'H1',
  },
  {
    id: 'slipping_members', name: 'Slipping Members',
    ruleText: 'Members (Choice, Reserved, Starter) whose 2026 attendance fell 40% or more and who kept transferring tickets.',
    filters: { plan2026: ['choice', 'reserved', 'starter'], attendanceChangeMaxPct: -40, keptTransferring2026: true },
    conversionRate: 0.18, valuePerConversion: 1450,
    valueAssumption: 'Assumes 18% renew in the 2027 window after a save offer, worth about $1,450 each in ticket and F&B revenue that would otherwise lapse.',
    whyNow: 'The 2027 membership renewal window is open and member benefit credits can anchor the save offer.',
    heroId: 'H2',
  },
  {
    id: 'group_only', name: 'Group-only buyers',
    ruleText: 'Fans with two or more group outings who have never owned a ticket of their own.',
    filters: { groupOutingsMin: 2, neverOwnTicket: true },
    conversionRate: 0.07, valuePerConversion: 380,
    valueAssumption: 'Assumes 7% buy a first Triple Play Bundle, worth about $380 each in ticket and F&B revenue.',
    whyNow: 'Fan Fest in January is the first in-person moment to offer the Triple Play Bundle.',
    heroId: 'H3',
  },
  {
    id: 'lapsed_single_merch', name: 'Lapsed single-game buyers who still shop',
    ruleText: 'Bought single games before 2026, hold no plan in 2026, and bought from the Team Store or team app in 2026.',
    filters: { singleGameBefore2026: true, plan2026: ['none'], retailOrApp2026: true },
    conversionRate: 0.06, valuePerConversion: 210,
    valueAssumption: 'Assumes 6% return for a single game in 2027, worth about $210 each including F&B.',
    whyNow: 'November offseason: Team Store and app engagement is the only live signal, so a win-back note lands before holiday gifting.',
    heroId: null,
  },
  {
    id: 'kids_families', name: 'Kids Club families without a plan',
    ruleText: 'Households with a Kids Club child that bought only single games or a Triple Play Bundle in 2026. Parents only.',
    filters: { kidsClubHousehold: true, plan2026: ['single', 'triple_play'] },
    conversionRate: 0.08, valuePerConversion: 520,
    valueAssumption: 'Assumes 8% of parents take a family plan for 2027, worth about $520 each in ticket and F&B revenue. Children are never contacted.',
    whyNow: 'Fan Fest in January brings Kids Club families in person, and Ballpark Pass goes on sale in February.',
    heroId: 'H4',
  },
  {
    id: 'premium_curious', name: 'Premium-curious fans',
    ruleText: 'Fans who have never owned premium seats but reached premium areas by transfer or group, and rank in the top quarter of F&B spend.',
    filters: { excludePremiumOwn: true, premiumViaTransferOrGroup: true, fnbPercentile2026Min: 75 },
    conversionRate: 0.04, valuePerConversion: 1180,
    valueAssumption: 'Assumes 4% buy a Home Plate Club or Dugout Club seat for 2027, worth about $1,180 each in ticket and F&B revenue.',
    whyNow: 'The 2027 membership renewal window is the moment to show a premium seat alongside the renewal.',
    heroId: null,
    sponsor: { label: 'Sponsor-ready audience (aggregate only, no fan data shared)' },
  },
];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const share = (xs, p) => (xs.length ? xs.filter(p).length / xs.length : 0);
const ordinal = (n) => {
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return n + suffix;
};
const round1 = (v) => Math.round(v * 10) / 10;

// Each evidence compares the segment with everyone in the relevant baseline; per-person values are not scaled.
const EVIDENCE = {
  pass_power(seg, all) {
    const base = all.filter((f) => f.plans[2026] === 'ballpark_pass');
    const s = avg(seg.map((f) => f.games[2026])), b = avg(base.map((f) => f.games[2026]));
    return { label: 'Average 2026 games attended (vs all Ballpark Pass holders)', baselineLabel: 'All Ballpark Pass holders', unit: 'number', s, b, fmt: (v) => `${round1(v).toFixed(1)} games` };
  },
  slipping_members(seg, all) {
    const base = all.filter((f) => ['choice', 'reserved', 'starter'].includes(f.plans[2026]) && f.attendanceChangePct !== null);
    const s = avg(seg.map((f) => f.attendanceChangePct)), b = avg(base.map((f) => f.attendanceChangePct));
    return { label: 'Average change in attendance, 2025 to 2026 (vs all Members)', baselineLabel: 'All Members', unit: 'pct', scale: 0.01, s, b, fmt: (v) => fmtPct(v / 100) };
  },
  group_only(seg, all) {
    const s = avg(seg.map((f) => f.groupOutings)), b = avg(all.filter((f) => f.groupOutings > 0).map((f) => f.groupOutings));
    return { label: 'Average group outings (vs all fans with a group outing)', baselineLabel: 'All fans with a group outing', unit: 'number', s, b, fmt: (v) => round1(v).toFixed(1) };
  },
  lapsed_single_merch(seg, all) {
    const base = all.filter((f) => f.singleGameBefore2026);
    const past = (f) => f.games[2024] + f.games[2025];
    const s = avg(seg.map(past)), b = avg(base.map(past));
    return { label: 'Average games attended in 2024 and 2025 (vs all 2024-25 single-game buyers)', baselineLabel: 'All 2024-25 single-game buyers', unit: 'number', s, b, fmt: (v) => `${round1(v).toFixed(1)} games` };
  },
  kids_families(seg, all) {
    const tp = (f) => f.plans[2026] === 'triple_play';
    const buyers = all.filter((f) => f.plans[2026] === 'single' || f.plans[2026] === 'triple_play');
    const s = share(seg, tp), b = share(buyers, tp);
    return { label: 'Share who bought a Triple Play Bundle in 2026 (vs all 2026 single-game and Triple Play buyers)', baselineLabel: 'All 2026 single-game and Triple Play buyers', unit: 'pct', s, b, fmt: (v) => fmtPct(v) };
  },
  premium_curious(seg, all) {
    const spenders = all.filter((f) => f.fnbPercentile2026 !== null);
    const s = avg(seg.map((f) => f.fnbPercentile2026)), b = avg(spenders.map((f) => f.fnbPercentile2026));
    return { label: 'Average F&B spend percentile, 2026 (vs all F&B buyers)', baselineLabel: 'All F&B buyers', unit: 'number', s, b, fmt: (v) => ordinal(Math.round(v)) + ' percentile' };
  },
};

function computeRecommendations(fans) {
  const cards = RULES.map((r) => {
    const seg = applyFilters(fans, r.filters);
    const eligible = consentWaterfall(seg, 'email').eligible;
    const e = EVIDENCE[r.id](seg, fans);
    return {
      id: r.id, name: r.name, ruleText: r.ruleText, filters: { ...r.filters },
      matched: seg.length, eligible,
      projectedValue: scaled(eligible) * r.conversionRate * r.valuePerConversion,
      valueAssumption: r.valueAssumption,
      evidence: {
        label: e.label, baselineLabel: e.baselineLabel, segmentValue: e.fmt(e.s), baselineValue: e.fmt(e.b),
        chart: { labels: ['This segment', e.baselineLabel], series: [[Math.round(e.s * (e.scale || 1) * 1e4) / 1e4, Math.round(e.b * (e.scale || 1) * 1e4) / 1e4]], unit: e.unit },
      },
      whyNow: r.whyNow, heroId: r.heroId,
      sponsorAudience: r.sponsor ? r.sponsor.label : null,
      sponsorAudienceSize: r.sponsor ? `${r.sponsor.label}: ${fmtCount(scaled(seg.length))} fans` : null,
      expanded: false,
    };
  });
  cards.sort((a, b) => b.projectedValue - a.projectedValue);
  cards[0].expanded = true;
  return cards;
}

module.exports = { RULES, RANKING_NOTE, computeRecommendations };
