// Tab 7: ranked pattern-detection cards. Each card opens its rule in the Segment Builder.
const { COPY } = require('../config');
const { scaled, fmtCount, fmtMoney } = require('../format');
const { RANKING_NOTE } = require('../recommendations');
const { applyRecommendation } = require('../segments');

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Two bars, segment against baseline. Text comes from the card's own evidence strings.
function renderEvidence(parent, ev) {
  const [s, b] = ev.chart.series[0].map((v) => Math.abs(v));
  const max = Math.max(s, b) || 1;
  const rows = [
    { name: ev.chart.labels[0], value: ev.segmentValue, mag: s, cls: 'ev-seg' },
    { name: ev.chart.labels[1], value: ev.baselineValue, mag: b, cls: 'ev-base' },
  ];
  const chart = node('div', 'ev-chart');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `${ev.label}: ${ev.segmentValue} against ${ev.baselineValue}`);
  for (const r of rows) {
    const row = node('div', 'ev-row');
    row.appendChild(node('span', 'ev-name', r.name));
    const track = node('div', 'ev-track');
    const bar = node('div', `ev-bar ${r.cls}`);
    bar.style.width = `${Math.max(2, Math.round((r.mag / max) * 100))}%`;
    bar.setAttribute('title', `${r.name}: ${r.value}`);
    track.appendChild(bar);
    row.appendChild(track);
    row.appendChild(node('span', 'ev-value', r.value));
    chart.appendChild(row);
  }
  parent.appendChild(node('div', 'ev-title', ev.label));
  parent.appendChild(chart);
}

function renderRecs(container, ctx) {
  const { model, state, goTo } = ctx;
  if (!state.recsOpen) {
    state.recsOpen = {};
    for (const c of model.recommendations) state.recsOpen[c.id] = !!c.expanded;
  }

  container.textContent = '';
  container.appendChild(node('h2', 'recs-title', COPY.recsLabel));
  container.appendChild(node('p', 'recs-note', COPY.recsProdNote));
  container.appendChild(node('p', 'recs-note recs-rank', RANKING_NOTE));
  const list = node('div', 'recs-list');
  container.appendChild(list);

  function onOpenBuilder(card) {
    state.segment = applyRecommendation(state.segment, card);
    goTo('segments');
  }
  function onExampleFan(fan) { goTo('profile', { fanId: fan.fanId }); }
  function onToggle(card) { state.recsOpen[card.id] = !state.recsOpen[card.id]; paint(); }

  function paint() {
    list.textContent = '';
    model.recommendations.forEach((card, i) => {
      const open = !!state.recsOpen[card.id];
      const el = node('article', `rec-card${open ? ' rec-open' : ''}`);
      const head = node('div', 'rec-head');
      head.appendChild(node('span', 'rec-rank', String(i + 1)));
      head.appendChild(node('h3', 'rec-name', card.name));
      const toggle = node('button', 'btn btn-quiet rec-toggle', open ? 'Hide details' : 'Show details');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.addEventListener('click', () => onToggle(card));
      head.appendChild(toggle);
      el.appendChild(head);

      const stats = node('div', 'rec-stats');
      const stat = (label, value, cls) => {
        const s = node('div', 'rec-stat');
        s.appendChild(node('div', `rec-stat-value ${cls}`, value));
        s.appendChild(node('div', 'rec-stat-label', label));
        stats.appendChild(s);
      };
      stat('fans in the segment', fmtCount(scaled(card.matched)), 'rec-size');
      stat('eligible after consent (email)', fmtCount(scaled(card.eligible)), 'rec-eligible');
      stat('projected value', fmtMoney(card.projectedValue), 'rec-value');
      el.appendChild(stats);

      if (open) {
        const body = node('div', 'rec-body');
        body.appendChild(node('p', 'rec-rule', card.ruleText));
        body.appendChild(node('p', 'rec-assume', card.valueAssumption));
        const ev = node('div', 'rec-evidence');
        renderEvidence(ev, card.evidence);
        body.appendChild(ev);
        const why = node('p', 'rec-why');
        why.appendChild(node('strong', 'rec-why-label', 'Why now: '));
        why.appendChild(node('span', 'rec-why-text', card.whyNow));
        body.appendChild(why);
        if (card.sponsorAudience) body.appendChild(node('p', 'rec-sponsor', card.sponsorAudienceSize));
        el.appendChild(body);
      }

      const actions = node('div', 'rec-actions');
      const go = node('button', 'btn rec-open-btn', 'Open in Segment Builder');
      go.type = 'button';
      go.setAttribute('data-rec', card.id);
      go.addEventListener('click', () => onOpenBuilder(card));
      actions.appendChild(go);
      const hero = card.heroId ? model.fans.find((f) => f.heroId === card.heroId) : null;
      if (hero) {
        const ex = node('button', 'btn btn-quiet rec-example', 'Example fan');
        ex.type = 'button';
        ex.addEventListener('click', () => onExampleFan(hero));
        actions.appendChild(ex);
      }
      el.appendChild(actions);
      list.appendChild(el);
    });
  }
  paint();
}

module.exports = { renderRecs };
