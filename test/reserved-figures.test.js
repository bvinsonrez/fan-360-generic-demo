const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildModel } = require('../src/model');
const { collectDisplayedStrings, channelSubsets } = require('../src/display-metrics');
const { applyFilters, consentWaterfall, projectResults, combineProjections } = require('../src/segments');

const model = buildModel();
const file = process.env.RESERVED_FIGURES_FILE;

test('displayed strings are plentiful and well formed', () => {
  const shown = collectDisplayedStrings(model);
  assert.ok(shown.length > 100, `only ${shown.length} strings`);
  for (const s of shown) {
    assert.equal(typeof s, 'string', `non-string item: ${s}`);
    assert.ok(!/NaN|undefined|Infinity|-0(?![.\d])/.test(s), `bad string: ${s}`);
  }
});

test('scan covers combined totals for every multi-channel subset', () => {
  assert.equal(channelSubsets().length, 11);
  const shown = new Set(collectDisplayedStrings(model));
  const card = model.recommendations[0];
  const aud = applyFilters(model.fans, card.filters);
  const res = (ids) => ids.map((id) => projectResults(consentWaterfall(aud, id).eligible, [id]));
  for (const ids of [['email', 'push'], ['sms', 'push', 'social'], ['email', 'sms']]) {
    for (const r of combineProjections(res(ids))) assert.ok(shown.has(r.value), `${ids}: ${r.value}`);
  }
});

test('every chart in the model has a valid unit', () => {
  const units = ['count', 'money', 'pct', 'number'];
  const charts = [...['ticketing', 'fnb', 'groups'].flatMap((v) => model.views[v].charts),
    model.views.fan360.overlap, model.views.fan360.valueBySystems,
    ...model.recommendations.map((c) => c.evidence.chart)];
  assert.ok(charts.length >= 15);
  for (const c of charts) assert.ok(units.includes(c.unit), String(c.id || c.labels));
});

test('no reserved figure is displayed', { skip: !file && 'RESERVED_FIGURES_FILE not set' }, () => {
  const reserved = fs.readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const shown = collectDisplayedStrings(model);
  // token match with numeric boundaries, so "19%" does not hit "9%"
  const esc = (r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = shown.filter((s) => reserved.some((r) => new RegExp('(^|[^0-9.,$])' + esc(r) + '($|[^0-9])').test(s)));
  assert.deepEqual(hits, []);
});
