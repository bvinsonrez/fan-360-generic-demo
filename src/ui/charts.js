// Chart.js wrappers. Every tick, tooltip and data label goes through fmtChartValue.
const { PALETTE } = require('../config');
const { fmtChartValue } = require('../format');

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const LABEL_PX = 12;
// Color rules, in order:
// 1. Seasons are ordinal: a light-to-dark blue ramp, newest season darkest.
// 2. The accent marks the one thing the chart title asks you to notice; everything else
//    in that chart drops to grey so the accent is the only saturated mark.
// 3. Otherwise categories cycle from the primary blue through its tints and neutrals.
const SEASON_RAMP = ['#BFD3EA', '#5E93CF', PALETTE.primary];
const CONTEXT = [PALETTE.greyLight, PALETTE.grey, PALETTE.slate];
const CYCLE = [PALETTE.primary, PALETTE.grey, '#5E93CF', PALETTE.greyLight, '#BFD3EA', PALETTE.slate];
const EMPTY_TEXT = 'No fans match these filters';

const live = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function destroyChart(container) {
  const c = live.get(container);
  if (c) { c.destroy(); live.delete(container); }
}

function destroyAllCharts() {
  for (const c of live.values()) c.destroy();
  live.clear();
}

function isAllZero(spec) {
  return spec.series.every((s) => s.data.every((v) => v === null || v === undefined || v === 0));
}

function seriesColors(spec) {
  if (spec.seasonSeries) {
    const off = SEASON_RAMP.length - spec.series.length;
    return spec.series.map((_, i) => SEASON_RAMP[Math.max(0, i + off)]);
  }
  let n = 0;
  if (spec.series.some((s) => s.highlight)) return spec.series.map((s) => (s.highlight ? PALETTE.accent : CONTEXT[n++ % CONTEXT.length]));
  return spec.series.map(() => CYCLE[n++ % CYCLE.length]);
}

// Text color for a label drawn on a filled shape: white only where it reads at 4.5:1.
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function labelOn(bg) { return 1.05 / (lum(bg) + 0.05) >= 4.5 ? PALETTE.white : PALETTE.ink; }

function isDonut(spec) { return spec.type === 'doughnut' || spec.type === 'donut'; }
function isHorizontal(spec) { return spec.type === 'hbar' || spec.indexAxis === 'y'; }

function buildDatasets(spec) {
  const colors = seriesColors(spec);
  const hi = spec.highlightIndex;
  if (isDonut(spec)) {
    const s = spec.series[0];
    const bg = s.data.map((_, i) => (i === hi ? PALETTE.accent : i === 0 && hi === undefined ? PALETTE.primary : PALETTE.grey));
    return [{ label: s.name, data: s.data, backgroundColor: bg, borderColor: PALETTE.white, borderWidth: 2 }];
  }
  return spec.series.map((s, si) => {
    const base = { label: s.name, data: s.data };
    if (spec.type === 'line') {
      const strong = s.highlight || (spec.seasonSeries && si === spec.series.length - 1) || spec.series.length === 1;
      return { ...base, borderColor: colors[si], backgroundColor: colors[si], borderWidth: strong ? 2.5 : 1.5,
        pointRadius: 0, pointHoverRadius: 4, tension: 0.2, spanGaps: false, yAxisID: s.axis || 'y' };
    }
    const bg = spec.series.length === 1 && hi !== undefined
      ? s.data.map((_, i) => (i === hi ? PALETTE.accent : PALETTE.grey))
      : colors[si];
    return { ...base, backgroundColor: bg, borderColor: PALETTE.white, borderWidth: spec.stacked ? 1 : 0, maxBarThickness: 56 };
  });
}

function axisTitleFont() { return { family: FONT, size: LABEL_PX }; }

function buildScales(spec) {
  if (isDonut(spec)) return {};
  const horizontal = isHorizontal(spec);
  const unit = spec.unit;
  const valueAxis = (extra) => ({
    beginAtZero: true,
    stacked: !!spec.stacked,
    grid: { color: PALETTE.greyLight },
    border: { display: false },
    ticks: { font: axisTitleFont(), color: PALETTE.slate, maxTicksLimit: 5, callback: (v) => fmtChartValue(v, unit) },
    ...extra,
  });
  const categoryAxis = {
    stacked: !!spec.stacked,
    grid: { display: false },
    ticks: { font: axisTitleFont(), color: PALETTE.slate, autoSkip: spec.type === 'line', maxTicksLimit: spec.type === 'line' ? 9 : 12, maxRotation: 0 },
  };
  const scales = horizontal ? { x: valueAxis({ position: 'bottom' }), y: categoryAxis } : { x: categoryAxis, y: valueAxis({ position: 'left' }) };
  if (spec.series.some((s) => s.axis === 'y2')) {
    scales.y2 = valueAxis({ position: 'right', grid: { drawOnChartArea: false } });
  }
  return scales;
}

// Draws value labels on small bar charts and donut slices, formatted by fmtChartValue.
function valueLabelPlugin(spec) {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const donut = isDonut(spec);
      // Label single-series bars and donuts only; multi-series charts read from the axis.
      if (spec.type === 'line' || spec.stacked || (!donut && spec.series.length > 1)) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = `600 ${LABEL_PX}px ${FONT}`;
      const horizontal = isHorizontal(spec);
      chart.data.datasets.forEach((ds, di) => {
        chart.getDatasetMeta(di).data.forEach((arc, i) => {
          const v = ds.data[i];
          if (v === null || v === undefined || v === 0) return;
          const text = fmtChartValue(v, spec.unit);
          if (donut) {
            ctx.fillStyle = labelOn(ds.backgroundColor[i]);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const p = arc.tooltipPosition();
            ctx.fillText(text, p.x, p.y);
          } else if (horizontal) {
            ctx.fillStyle = PALETTE.ink;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, arc.x + 4, arc.y);
          } else {
            ctx.fillStyle = PALETTE.ink;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(text, arc.x, arc.y - 2);
          }
        });
      });
      ctx.restore();
    },
  };
}

function renderChart(container, spec) {
  destroyChart(container);
  container.textContent = '';
  if (isAllZero(spec)) {
    container.appendChild(el('div', 'chart-empty', EMPTY_TEXT));
    return null;
  }
  if (typeof Chart === 'undefined') {
    container.appendChild(el('div', 'chart-empty', 'Chart library unavailable'));
    return null;
  }
  const canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', spec.title);
  container.appendChild(canvas);
  const donut = isDonut(spec);
  const horizontal = isHorizontal(spec);
  const showLegend = donut || spec.series.length > 1;
  const chart = new Chart(canvas, {
    type: donut ? 'doughnut' : spec.type === 'hbar' ? 'bar' : spec.type,
    data: { labels: spec.labels, datasets: buildDatasets(spec) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis: horizontal ? 'y' : 'x',
      layout: { padding: { top: 14, right: horizontal ? 36 : 4 } },
      interaction: spec.type === 'line' ? { mode: 'index', intersect: false } : undefined,
      scales: buildScales(spec),
      plugins: {
        legend: {
          display: showLegend,
          position: donut ? 'right' : 'bottom',
          labels: { font: { family: FONT, size: LABEL_PX }, color: PALETTE.ink, boxWidth: 12, boxHeight: 12 },
        },
        tooltip: {
          titleFont: { family: FONT, size: LABEL_PX },
          bodyFont: { family: FONT, size: LABEL_PX },
          callbacks: {
            label: (c) => `${donut ? c.label : c.dataset.label}: ${fmtChartValue(c.raw, spec.unit)}`,
          },
        },
      },
    },
    plugins: [valueLabelPlugin(spec)],
  });
  live.set(container, chart);
  return chart;
}

function renderKpis(container, kpis) {
  container.textContent = '';
  for (const k of kpis) {
    const card = el('div', 'kpi');
    card.appendChild(el('div', 'kpi-value', k.value));
    card.appendChild(el('div', 'kpi-label', k.label));
    container.appendChild(card);
  }
}

module.exports = { renderChart, renderKpis, destroyAllCharts, EMPTY_TEXT };
