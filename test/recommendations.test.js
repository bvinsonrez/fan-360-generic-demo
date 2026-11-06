const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { computeRecommendations, RULES, RANKING_NOTE } = require('../src/recommendations');
const { applyFilters, consentWaterfall, createSegmentState, applyRecommendation } = require('../src/segments');

const M = buildModel();
const cards = computeRecommendations(M.fans);

test('six cards ranked by value', () => {
  assert.equal(cards.length, 6);
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].projectedValue >= cards[i].projectedValue);
  assert.equal(cards[0].expanded, true);
  assert.ok(cards.slice(1).every((c) => !c.expanded));
});

test('non-trivial segments', () => {
  for (const c of cards) assert.ok(c.matched >= 40, `${c.id}: ${c.matched}`);
});

test('card count equals tab 6 count for same filters', () => {
  for (const c of cards) {
    const s = applyRecommendation(createSegmentState(), c);
    assert.equal(applyFilters(M.fans, s.filters).length, c.matched);
    assert.equal(consentWaterfall(applyFilters(M.fans, s.filters), 'email').eligible, c.eligible);
  }
});

test('heroes match their rules', () => {
  const withHero = cards.filter((c) => c.heroId);
  assert.deepEqual(withHero.map((c) => c.id).sort(), ['group_only', 'kids_families', 'pass_power', 'slipping_members']);
  for (const c of withHero) assert.ok(applyFilters(M.fans, c.filters).some((f) => f.heroId === c.heroId));
});

test('sponsor line only on premium_curious', () => {
  assert.ok(cards.find((c) => c.id === 'premium_curious').sponsorAudience);
  assert.ok(cards.filter((c) => c.id !== 'premium_curious').every((c) => c.sponsorAudience === null));
});

test('value, evidence and copy', () => {
  assert.match(RANKING_NOTE, /^Ranked by projected incremental 2027 ticket and F&B revenue/);
  assert.equal(RULES.length, 6);
  for (const r of RULES) {
    const c = cards.find((x) => x.id === r.id);
    assert.equal(c.projectedValue, c.eligible * 25 * r.conversionRate * r.valuePerConversion);
    assert.ok(Number.isFinite(c.projectedValue) && c.projectedValue > 0);
    assert.ok(c.valueAssumption && c.whyNow && c.ruleText);
    assert.equal(c.evidence.chart.labels.length, 2);
    assert.equal(c.evidence.chart.series.length, 1);
    assert.equal(c.evidence.chart.series[0].length, 2);
    assert.ok(c.evidence.chart.series[0].every(Number.isFinite));
    assert.ok(c.evidence.segmentValue && c.evidence.baselineValue && c.evidence.label);
  }
  assert.ok(M.recommendations.length === 6 && M.recommendations[0].id === cards[0].id);
});

test('calendar hooks in whyNow', () => {
  const w = (id) => cards.find((c) => c.id === id).whyNow;
  assert.match(w('pass_power'), /February/);
  assert.match(w('slipping_members'), /member benefit credits/);
  assert.match(w('group_only'), /Fan Fest/);
});

test('card copy never uses the AI label', () => {
  const s = JSON.stringify(cards);
  assert.equal(s.match(/\bAI\b/), null);
});

test('chart baseline label matches its comparison', () => {
  for (const c of cards) {
    assert.equal(c.evidence.chart.labels[0], 'This segment');
    assert.ok(c.evidence.baselineLabel);
    assert.equal(c.evidence.chart.labels[1], c.evidence.baselineLabel);
  }
  assert.equal(cards.filter((c) => c.evidence.chart.labels[1] === 'Everyone').length, 0);
  assert.equal(cards.find((c) => c.id === 'kids_families').evidence.baselineLabel, 'All 2026 single-game and Triple Play buyers');
});

test('evidence is a real contrast, not implied by the filters', () => {
  const l = cards.find((c) => c.id === 'lapsed_single_merch').evidence;
  assert.notEqual(l.segmentValue, '100%');
  assert.notEqual(l.segmentValue, l.baselineValue);
  assert.match(cards.find((c) => c.id === 'premium_curious').evidence.segmentValue, /^\d+(st|nd|rd|th) percentile$/);
});
