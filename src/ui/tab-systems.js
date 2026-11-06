// Tabs 1–3: one source system on its own. Same layout and callout style on all three.
const { renderChart, renderKpis } = require('./charts');

const MAX_CHARTS = 4;

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderSystemTab(container, view) {
  container.textContent = '';
  container.appendChild(node('p', 'sys-intro', view.intro));
  const kpis = node('div', 'kpis');
  container.appendChild(kpis);
  renderKpis(kpis, view.kpis);
  const grid = node('div', 'charts');
  container.appendChild(grid);
  for (const spec of view.charts.slice(0, MAX_CHARTS)) {
    const card = node('section', 'chart-card');
    card.appendChild(node('h3', 'chart-title', spec.title));
    const box = node('div', 'chart-box');
    card.appendChild(box);
    grid.appendChild(card);
    renderChart(box, spec);
  }
  const callout = node('aside', 'cant-tell');
  callout.appendChild(node('h3', 'cant-tell-title', "What this system can't tell you"));
  callout.appendChild(node('p', 'cant-tell-body', view.cantTell));
  container.appendChild(callout);
}

module.exports = { renderSystemTab };
