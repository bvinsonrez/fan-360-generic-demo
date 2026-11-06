// Display formatters. All person-level counts shown in the UI pass through here.
const { SCALE } = require('./config');

function scaled(raw) {
  return raw * SCALE;
}

// Round half up to `d` decimals, avoiding binary drift on exact ties.
function roundTo(v, d) {
  const f = Math.pow(10, d);
  return Math.round(Math.round(v * f * 1e6) / 1e6) / f;
}

// 3 significant figures for a value already divided into its unit (1 <= v < 1000).
// Decimals are recomputed after rounding so 9.995 -> "10.0" and 99.95 -> "100".
function sig3(v) {
  const r = roundTo(v, v < 10 ? 2 : v < 100 ? 1 : 0);
  const d = r >= 100 ? 0 : r >= 10 ? 1 : 2;
  return { r, text: r.toFixed(d) };
}

function compact(n) {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (Math.round(a) < 1000) {
    const r = Math.round(a);
    return r === 0 ? '0' : sign + r;
  }
  if (a < 1e6) {
    const k = sig3(a / 1000);
    if (k.r < 1000) return sign + k.text + 'K';
  }
  if (a < 1e9) {
    const m = sig3(a / 1e6);
    if (m.r < 1000) return sign + m.text + 'M';
  }
  return sign + sig3(a / 1e9).text + 'B';
}

function fmtCount(n) {
  return compact(n);
}

function fmtMoney(dollars) {
  const s = compact(dollars);
  return s[0] === '-' ? '-$' + s.slice(1) : '$' + s;
}

function fmtPct(fraction, digits = 0) {
  const s = roundTo(fraction * 100, digits).toFixed(digits);
  return (Number(s) === 0 ? (0).toFixed(digits) : s) + '%';
}

function fmtMultiple(x) {
  return roundTo(x, 1).toFixed(1) + 'x';
}

// One formatter for every chart axis tick, tooltip and data label.
function fmtChartValue(value, unit) {
  if (unit === 'count') return fmtCount(value);
  if (unit === 'money') return fmtMoney(value);
  if (unit === 'pct') return fmtPct(value, Math.abs(value) > 0 && Math.abs(value) < 0.1 ? 1 : 0);
  if (unit === 'number') {
    const r = roundTo(value, 1);
    return r === 0 ? '0' : Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  throw new Error(`Unknown chart unit ${unit}`);
}

function unitFor(top) {
  const exp = top > 0 ? Math.floor(Math.log10(top)) : 0;
  return Math.max(1, Math.pow(10, exp - 2));
}

function roundParts(parts) {
  const sum = parts.reduce((a, b) => a + b, 0);
  let unit = unitFor(Math.max(0, ...parts, sum));
  let rounded = parts.map((p) => Math.round(p / unit) * unit);
  let total = rounded.reduce((a, b) => a + b, 0);
  // Rounding can push the total into the next magnitude; re-derive the unit so
  // the total never shows more than 3 significant figures.
  const finer = unitFor(total);
  if (finer > unit) {
    unit = finer;
    rounded = parts.map((p) => Math.round(p / unit) * unit);
    total = rounded.reduce((a, b) => a + b, 0);
  }
  // One display scale and one decimal count for every label and the total.
  const scale = total >= 1e9 ? 1e9 : total >= 1e6 ? 1e6 : total >= 1000 ? 1000 : 1;
  const suffix = { 1: '', 1000: 'K', 1e6: 'M', 1e9: 'B' }[scale];
  let decimals = Math.max(0, Math.round(Math.log10(scale / unit)));
  // Drop trailing decimal columns that are zero for every value.
  while (decimals > 0) {
    const step = scale / Math.pow(10, decimals - 1);
    if ([...rounded, total].every((v) => v % step === 0)) decimals -= 1;
    else break;
  }
  const label = (v) => (v === 0 ? '0' : (v / scale).toFixed(decimals) + suffix);
  return { unit, parts: rounded, total, labels: rounded.map(label), totalLabel: label(total) };
}

module.exports = { scaled, fmtCount, fmtMoney, fmtPct, fmtMultiple, fmtChartValue, roundParts };
