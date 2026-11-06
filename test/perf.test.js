const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { buildModel } = require('../src/model');

test('buildModel under 800 ms', () => {
  const t0 = performance.now();
  buildModel();
  const ms = performance.now() - t0;
  assert.ok(ms < 800, `buildModel took ${ms.toFixed(0)} ms`);
});
