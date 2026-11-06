// Collects every string the UI shows for metrics, so tests can scan them.
const { CHANNELS, SCALE } = require('./config');
const { scaled, fmtCount, fmtMoney, fmtChartValue } = require('./format');
const { applyFilters, consentWaterfall, projectResults, projectionDisplay, assumptionText, combineProjections } = require('./segments');
const { fanProfileView, ROLES } = require('./views-profile');

const CHANNEL_IDS = CHANNELS.map((c) => c.id);

// Every channel subset of size 2 to 4 (11 for four channels), in stable order.
function channelSubsets() {
  const out = [];
  for (let mask = 1; mask < (1 << CHANNEL_IDS.length); mask++) {
    const ids = CHANNEL_IDS.filter((_, i) => mask & (1 << i));
    if (ids.length >= 2) out.push(ids);
  }
  return out;
}

function addChart(out, c) {
  out.push(c.title, ...c.labels.map(String));
  for (const s of c.series) {
    out.push(s.name);
    for (const v of s.data) if (v !== null) out.push(fmtChartValue(v, c.unit));
  }
}

function addEvidenceChart(out, c, unit) {
  out.push(...c.labels);
  for (const row of c.series) for (const v of row) out.push(fmtChartValue(v, unit));
}

function addWaterfall(out, w) {
  out.push(...w.display.labels, w.display.totalLabel, ...w.steps.map((s) => s.label));
}

// Known-optional fields are skipped when absent; everything else is pushed as-is.
const optional = (out, ...vals) => { for (const v of vals) if (v !== undefined && v !== null) out.push(v); };

function collectDisplayedStrings(model) {
  const out = [];
  const { views, fans, world, recommendations } = model;

  for (const v of [views.ticketing, views.fnb, views.groups]) {
    optional(out, v.intro, v.cantTell);
    for (const k of v.kpis) out.push(k.label, k.value);
    for (const c of v.charts) addChart(out, c);
  }

  const f = views.fan360;
  for (const k of f.kpis) { out.push(k.label, k.value); optional(out, k.note); }
  out.push(...f.funnel.labels, f.funnel.totalLabel, ...f.funnel.names);
  out.push(...f.matchBreakdown.labels, f.matchBreakdown.totalLabel, ...f.matchBreakdown.names);
  addChart(out, f.overlap);
  addChart(out, f.valueBySystems);
  out.push(...Object.values(f.takeaways));

  for (const id of CHANNEL_IDS) addWaterfall(out, consentWaterfall(fans, id));
  for (const ch of CHANNELS) out.push(assumptionText(ch));

  for (const card of recommendations) {
    out.push(
      card.name, card.ruleText, card.valueAssumption, card.whyNow,
      fmtCount(scaled(card.matched)), fmtCount(scaled(card.eligible)), fmtMoney(card.projectedValue),
      card.evidence.label, card.evidence.baselineLabel, card.evidence.segmentValue, card.evidence.baselineValue,
    );
    addEvidenceChart(out, card.evidence.chart, card.evidence.chart.unit);
    if (card.sponsorAudience) out.push(card.sponsorAudience, card.sponsorAudienceSize);
    const audience = applyFilters(fans, card.filters);
    for (const id of CHANNEL_IDS) {
      const w = consentWaterfall(audience, id);
      addWaterfall(out, w);
      const disp = projectionDisplay(projectResults(w.eligible, [id]));
      for (const c of disp.perChannel) { out.push(c.label); for (const r of c.rows) out.push(r.label, r.value); }
      for (const r of disp.combined) out.push(r.label, r.value);
    }
    for (const ids of channelSubsets()) {
      const results = ids.map((id) => projectResults(consentWaterfall(audience, id).eligible, [id]));
      for (const r of combineProjections(results)) out.push(r.label, r.value);
    }
  }

  for (const hero of fans.filter((x) => x.heroId)) {
    for (const role of Object.keys(ROLES)) {
      const p = fanProfileView(hero, role, world);
      out.push(p.header.name, p.header.region, p.header.roleLabel, p.header.confidence);
      for (const fld of p.fields) out.push(fld.label, fld.value);
      for (const h of p.household) out.push(h.label, h.value);
      for (const lane of p.swimlanes) for (const e of lane.events) out.push(e.label);
    }
  }
  return out;
}

module.exports = { collectDisplayedStrings, channelSubsets };
