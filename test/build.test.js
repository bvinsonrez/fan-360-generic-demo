const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { COPY } = require('../src/config');

const root = path.join(__dirname, '..');
execSync('node build.js', { cwd: root });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('no external URLs', () => {
  assert.equal((html.match(/(src|href)=["']https?:/g) || []).length, 0);
});
test('noindex', () => {
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});
test('vendor + footer present', () => {
  assert.match(html, /src="vendor\/chart\.umd\.min\.js"/);
  assert.ok(html.includes(COPY.footer));
});
test('footnote and chip present, wordmark relative', () => {
  assert.ok(html.includes(COPY.footnote));
  assert.ok(html.includes(COPY.chip));
  assert.match(html, /src="assets\/wordmark\.png"/);
});
test('all template slots filled', () => {
  assert.ok(!html.includes('{{'));
});
