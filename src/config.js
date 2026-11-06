// All team constants, seed, scale, channels, rates and copy live here.
const SEED = 20261105;
const SAMPLE_SIZE = 20000;
const SCALE = 25;
const SEASONS = [2024, 2025, 2026];
const AS_OF = '2026-11-04';
const HOME_GAMES = { 2024: 81, 2025: 81, 2026: 80 };

// Order is busiest first: G34, then G29.
const GATES = [
  { id: 'G3', label: 'Home Plate Gate' },
  { id: 'G6', label: 'Right Field Gate' },
  { id: 'G14', label: 'Left Field Gate' },
  { id: 'G29', label: 'Center Field Gate' },
  { id: 'G34', label: 'Plaza Gate' },
];

// season_pre is valid only in 2024; choice/reserved/starter only in 2025+.
const PLANS = {
  season_pre: 'Season Ticket (pre-membership)',
  choice: 'Member Choice',
  reserved: 'Member Reserved',
  starter: 'Member Starter',
  ballpark_pass: 'Ballpark Pass',
  triple_play: 'Triple Play Bundle',
  single: 'Single game',
  none: 'No purchase',
};
const MEMBER_PLANS = ['choice', 'reserved', 'starter'];

const PREMIUM_AREAS = [
  'Champions Club',
  'Home Plate Club',
  'Dugout Club',
  'Rooftop Deck',
  'Suites',
];
const REGIONS = ['Home state', 'Neighbor state (east)', 'Neighbor state (south)', 'Neighbor states (west)', 'Other'];
const GROUP_TYPES = ['Corporate', 'Youth sports', 'Church', 'School', 'Nonprofit', 'Social'];

// rates are fractions; aov is average order value in dollars.
const CHANNELS = [
  { id: 'email', label: 'Email', consentKey: 'email',
    rates: { delivered: 0.95, opened: 0.38, clicked: 0.06, purchased: 0.03 }, aov: 84 },
  { id: 'sms', label: 'SMS', consentKey: 'sms',
    rates: { delivered: 0.97, opened: 0.68, clicked: 0.12, purchased: 0.04 }, aov: 72,
    note: 'Requires documented consent, not just a preference flag.' },
  { id: 'push', label: 'Team app push', consentKey: 'push',
    rates: { delivered: 0.88, opened: 0.31, clicked: 0.15, purchased: 0.05 }, aov: 66 },
  { id: 'social', label: 'Paid social audience (hashed match)', consentKey: 'email',
    rates: { matched: 0.62, clicked: 0.013, purchased: 0.006 }, aov: 78 },
];

const PALETTE = {
  primary: '#004987',
  accent: '#D9730D',
  ink: '#1B2733',
  slate: '#5B6B7B',
  grey: '#9AA5B1',
  greyLight: '#D5DBE1',
  surface: '#F4F6F8',
  white: '#FFFFFF',
};

const COPY = {
  footer: 'Demonstration with synthetic data, prepared by Resultant.',
  footnote: 'Modeled from a 20,000-record synthetic sample, scaled ×25.',
  chip: 'Synthetic data',
  recsLabel: 'Pattern detection across linked records',
  recsProdNote: 'In production, these patterns would run as models in Databricks over the same linked records.',
};

module.exports = {
  SEED, SAMPLE_SIZE, SCALE, SEASONS, AS_OF, HOME_GAMES, GATES, PLANS, MEMBER_PLANS,
  PREMIUM_AREAS, REGIONS, GROUP_TYPES, CHANNELS, PALETTE, COPY,
};
