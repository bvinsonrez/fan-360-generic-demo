// Tab 4: what linking the three systems shows. All figures arrive pre-formatted from the view model.
const { renderChart, renderKpis } = require('./charts');

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Stacked bar whose labels come from roundParts, so the parts visibly add up to the total.
function renderParts(card, spec, totalCaption) {
  const sum = spec.parts.reduce((a, b) => a + b, 0) || 1;
  const bar = node('div', 'parts-bar');
  spec.parts.forEach((p, i) => {
    const seg = node('div', `parts-seg parts-seg-${i}`);
    seg.style.flexGrow = String(Math.max(p, sum * 0.02));
    seg.setAttribute('title', `${spec.names[i]}: ${spec.labels[i]}`);
    bar.appendChild(seg);
  });
  card.appendChild(bar);
  const list = node('ul', 'parts-list');
  spec.names.forEach((name, i) => {
    const li = node('li', 'parts-item');
    li.appendChild(node('span', `parts-swatch parts-seg-${i}`));
    li.appendChild(node('span', 'parts-name', name));
    li.appendChild(node('span', 'parts-value', spec.labels[i]));
    list.appendChild(li);
  });
  const total = node('li', 'parts-item parts-total');
  total.appendChild(node('span', 'parts-swatch parts-swatch-none'));
  total.appendChild(node('span', 'parts-name', totalCaption));
  total.appendChild(node('span', 'parts-value', spec.totalLabel));
  list.appendChild(total);
  card.appendChild(list);
}

function renderFan360(container, view) {
  container.textContent = '';
  container.appendChild(node('p', 'sys-intro', 'Link the records from all three systems and the same fans show up once, with their full value.'));
  const kpis = node('div', 'kpis kpis-hero');
  container.appendChild(kpis);
  renderKpis(kpis, view.kpis);
  // Mark the large tile after the shared renderer has built the cards.
  view.kpis.forEach((k, i) => {
    if (k.size === 'large' && kpis.children[i]) kpis.children[i].className += ' kpi-large';
    if (k.note && kpis.children[i]) kpis.children[i].appendChild(node('div', 'kpi-note', k.note));
  });

  const grid = node('div', 'charts');
  container.appendChild(grid);
  const card = (title, takeaway) => {
    const c = node('section', 'chart-card');
    c.appendChild(node('h3', 'chart-title', title));
    grid.appendChild(c);
    return { c, takeaway: () => c.appendChild(node('p', 'takeaway', takeaway)) };
  };

  const f = card('Linkage funnel: source records to resolved fans', view.takeaways.funnel);
  renderParts(f.c, view.funnel, 'Source records');
  f.takeaway();

  const m = card('How each link was made', view.takeaways.matchBreakdown);
  renderParts(m.c, view.matchBreakdown, 'Candidate links');
  m.takeaway();

  for (const [spec, key] of [[view.overlap, 'overlap'], [view.valueBySystems, 'valueBySystems']]) {
    const c = card(spec.title, view.takeaways[key]);
    const box = node('div', 'chart-box');
    c.c.appendChild(box);
    renderChart(box, spec);
    c.takeaway();
  }
}

module.exports = { renderFan360 };
