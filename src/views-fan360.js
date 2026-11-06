// Tab 4: what linking the three systems shows. Person counts are scaled ×SCALE;
// per-fan values (annual value by number of systems) are not.
const { scaled, fmtCount, fmtMoney, fmtPct, fmtMultiple, roundParts } = require('./format');
const { normEmail } = require('./fans');

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function fan360Metrics(world, linkage, fans) {
  const { stats } = linkage;
  const multi = fans.filter((f) => f.systems >= 2);
  const single = fans.filter((f) => f.systems === 1);
  const anonTxns = world.fnbAnonymous.reduce((a, g) => a + g.txns, 0);

  // Combined marketing list: every email held in ticketing, groups and identified F&B.
  const listEmails = new Set();
  for (const t of world.ticketing) if (t.email) listEmails.add(normEmail(t.email));
  for (const g of world.groups) {
    if (g.organizer.email) listEmails.add(normEmail(g.organizer.email));
    for (const k of g.knownAttendees) if (k.email) listEmails.add(normEmail(k.email));
  }
  for (const t of world.fnbIdentified) if (t.email) listEmails.add(normEmail(t.email));
  const fanByEmail = new Map();
  for (const f of fans) for (const e of f.emails) fanByEmail.set(e, f.fanId);
  const fansWithEmail = new Set();
  for (const e of listEmails) {
    const id = fanByEmail.get(e);
    if (id !== undefined) fansWithEmail.add(id);
  }

  return {
    recordsPerFan: stats.sourceRecords / stats.resolvedFans,
    multiSystemShare: multi.length / fans.length,
    valueMultiple: mean(multi.map((f) => f.annualValue)) / mean(single.map((f) => f.annualValue)),
    fnbIdentifiedShare: world.fnbIdentified.length / (world.fnbIdentified.length + anonTxns),
    dupContactShare: (listEmails.size - fansWithEmail.size) / listEmails.size,
    // supporting counts (raw, unscaled)
    multiCount: multi.length,
    listEmails: listEmails.size,
    duplicateEmails: listEmails.size - fansWithEmail.size,
    meanValue: { single: mean(single.map((f) => f.annualValue)), multi: mean(multi.map((f) => f.annualValue)) },
  };
}

function fan360View(world, linkage, fans) {
  const { stats } = linkage;
  const m = fan360Metrics(world, linkage, fans);

  const funnel = {
    ...roundParts([scaled(stats.resolvedFans), scaled(stats.sourceRecords - stats.resolvedFans)]),
    names: ['Resolved fans', 'Duplicate records merged'],
  };
  const conf = stats.byConfidence;
  const matchBreakdown = {
    ...roundParts([scaled(conf.high), scaled(conf.medium), scaled(conf.low)]),
    names: ['High (email/phone)', 'Medium (name + ZIP)', 'Low (shown, not merged)'],
  };

  // Overlap of the three systems: which combination each fan appears in.
  const combos = [
    ['Ticketing only', 'T'], ['F&B & Retail only', 'F'], ['Groups & Experiences only', 'G'],
    ['Ticketing + F&B', 'TF'], ['Ticketing + Groups', 'TG'], ['F&B + Groups', 'FG'], ['All three', 'TFG'],
  ];
  const sysKey = (f) => {
    const src = new Set(f.nodes.map((n) => n.source));
    return (src.has('ticketing') ? 'T' : '') + (src.has('fnb') ? 'F' : '')
      + (src.has('groups') || src.has('experiences') ? 'G' : '');
  };
  const comboCount = Object.fromEntries(combos.map(([, k]) => [k, 0]));
  for (const f of fans) comboCount[sysKey(f)]++;
  // Same split as the value-multiple KPI: single-system vs. 2+ systems.
  const valueData = [Math.round(m.meanValue.single), Math.round(m.meanValue.multi)];
  // Tab 2 shows the identified share to one decimal; derive the anonymous share from that
  // displayed figure so the two always add to 100.0% on screen.
  const identifiedShown = fmtPct(m.fnbIdentifiedShare, 1);
  const anonShown = `${(100 - parseFloat(identifiedShown)).toFixed(1)}%`;

  const kpis = [
    { id: 'resolvedFans', label: 'Resolved fans', value: fmtCount(scaled(fans.length)) },
    { id: 'multiSystem', label: 'Fans in 2+ systems', value: fmtPct(m.multiSystemShare) },
    { id: 'valueMultiple', label: 'Annual value, multi-system vs. single-system fans', value: fmtMultiple(m.valueMultiple), size: 'large' },
    { id: 'anonFnb', label: 'F&B transactions with no person attached', value: anonShown },
    { id: 'dupContacts', label: 'Duplicate contacts removed from the marketing list', value: fmtCount(scaled(m.duplicateEmails)),
      note: `${fmtPct(m.dupContactShare)} of ${fmtCount(scaled(m.listEmails))} emails` },
  ];

  const overlap = {
    id: 'overlap', type: 'bar', unit: 'count', indexAxis: 'y', title: 'Where each resolved fan appears',
    labels: combos.map(([l]) => l),
    series: [{ name: 'Fans', data: combos.map(([, k]) => scaled(comboCount[k])) }],
  };
  const valueBySystems = {
    id: 'valueBySystems', type: 'bar', unit: 'money', title: 'Average annual known spend per fan: one system vs. two or more',
    labels: ['1 system', '2+ systems'],
    series: [{ name: 'Annual value per fan', data: valueData }],
    highlightIndex: 1,
  };

  const takeaways = {
    funnel: `${funnel.totalLabel} source records resolve to ${funnel.labels[0]} fans once duplicates across systems are merged.`,
    matchBreakdown: `Most links rest on an exact email or phone match; ${matchBreakdown.labels[2]} weaker lookalikes are shown for review, not merged.`,
    overlap: `${fmtPct(m.multiSystemShare)} of fans show up in more than one system, and no single system sees them whole.`,
    valueBySystems: `Fans in 2+ systems are worth ${fmtMultiple(m.valueMultiple)} a single-system fan each year (${fmtMoney(m.meanValue.multi)} vs. ${fmtMoney(m.meanValue.single)}).`,
  };

  return { kpis, funnel, matchBreakdown, overlap, valueBySystems, takeaways, metrics: m };
}

module.exports = { fan360View, fan360Metrics };
