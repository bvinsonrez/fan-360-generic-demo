// Single entry point used by the UI and tests: world → linkage → fans → view models.
const config = require('./config');
const { generateWorld } = require('./generate');
const { resolveIdentities } = require('./linkage');
const { buildFans } = require('./fans');
const { ticketingView, fnbView, groupsView } = require('./views-systems');
const { fan360View } = require('./views-fan360');
const { computeRecommendations } = require('./recommendations');

function buildModel(cfg = config) {
  const world = generateWorld({ seed: cfg.SEED, size: cfg.SAMPLE_SIZE });
  const linkage = resolveIdentities(world);
  const fans = buildFans(world, linkage);
  const fanById = new Map(fans.map((f) => [f.fanId, f]));
  const views = {
    ticketing: ticketingView(world),
    fnb: fnbView(world),
    groups: groupsView(world),
    fan360: fan360View(world, linkage, fans),
  };
  return { world, linkage, fans, fanById, views, recommendations: computeRecommendations(fans) };
}

module.exports = { buildModel };
