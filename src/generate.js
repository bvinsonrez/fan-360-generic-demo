// Synthetic team world: hidden people (truth), per-system source records with
// realistic contact mess, overlays (surveys, Kids Club, consent) and four hero fans.
// `pid` on source records is hidden truth for tests; linkage must never read it.
const {
  SEED, SAMPLE_SIZE, SEASONS, HOME_GAMES, GATES, MEMBER_PLANS, PREMIUM_AREAS, REGIONS, GROUP_TYPES,
} = require('./config');
const { mulberry32, pick, intBetween } = require('./rng');

const STANDING = 'Standing room / no assigned seat';
const GENERAL_AREAS = ['Lower Level', 'Main Level', 'Upper Level', 'Outfield Bleachers'];
const OWNED_PREMIUM = PREMIUM_AREAS.filter((a) => a !== 'Suites');
const GROUP_PREMIUM = ['Rooftop Deck', 'Champions Club', 'Suites'];
const AREA_CUM = [3, 6, 9, 10];

// Tuning knobs. Change these, not the logic, when targets drift.
const TUNE = {
  archetypes: {
    member: 0.06, pass: 0.035, single: 0.2, triple_play: 0.045, group_only: 0.045,
    retail_only: 0.085, family: 0.05, lapsed_single: 0.017, premium_curious: 0.035, casual: 0.428,
  },
  trend: { 2024: 1.1, 2025: 0.97, 2026: 0.85 },
  memberGames: { 2024: 1.36, 2025: 1.2, 2026: 1.06 },
  teenRate: 0.08,
  appUser: {
    member: 0.07, pass: 0.75, single: 0.06, triple_play: 0.12, group_only: 0.3, retail_only: 0,
    family: 0.25, lapsed_single: 0.15, premium_curious: 0.85, casual: 0.05,
  },
  identRate: 0.4, // share of an app user's in-park transactions that carry identity
  secondEmail: { ticketing: 0.2, ticketing_dup: 0.85, fnb: 0.55, groups: 0.6, groups_attendee: 0.15, experiences: 0.2, kidsClub: 0.1 },
  dupAccount: 0.38, // per active season, non-plan buyers checking out on a new account
  nameMess: 0.055, oldPhone: 0.05, missingPhone: 0.1,
  groupBookings: { 2024: 290, 2025: 280, 2026: 268 },
  experiences: { 2024: 110, 2025: 115, 2026: 120 },
  // Experience buyer mix by archetype (order: member, premium_curious, family, single, triple_play, pass).
  expBuyers: [0.15, 0.2, 0.25, 0.25, 0.1, 0.05],
  // Chance a group organizer comes from ticket buyers rather than group-only fans.
  organizerFromBuyers: { corporate: 0.5, other: 0.15 },
  surveyRate: 0.06,
};

// ---------- name and place pools ----------
const MALE = ['James', 'Robert', 'Michael', 'William', 'Thomas', 'David', 'John', 'Mark', 'Steven', 'Brian',
  'Eric', 'Daniel', 'Matthew', 'Andrew', 'Ryan', 'Kevin', 'Scott', 'Jason', 'Paul', 'Gregory', 'Peter',
  'Nathan', 'Derek', 'Craig', 'Troy', 'Luke', 'Gary', 'Dennis', 'Wayne', 'Lars', 'Nils', 'Kyle', 'Adam',
  'Joel', 'Tyler', 'Cody', 'Aaron', 'Henry', 'Samuel', 'Owen', 'Tou', 'Fue', 'Abdi', 'Mohamed', 'Carlos',
  'Luis', 'Marcus', 'Darnell', 'Victor', 'Gordon'];
const FEMALE = ['Jennifer', 'Katherine', 'Elizabeth', 'Mary', 'Susan', 'Karen', 'Lisa', 'Michelle', 'Amy',
  'Angela', 'Rachel', 'Laura', 'Sarah', 'Heather', 'Megan', 'Emily', 'Hannah', 'Abigail', 'Anna', 'Julie',
  'Kristin', 'Ingrid', 'Greta', 'Sonja', 'Brenda', 'Diane', 'Denise', 'Holly', 'Paige', 'Tara', 'Nicole',
  'Molly', 'Erin', 'Bethany', 'Claire', 'Mai', 'Pa', 'Hodan', 'Amina', 'Maria', 'Sofia', 'Yesenia',
  'Tanisha', 'Renee', 'Vicki', 'Joan', 'Ruth', 'Carol', 'Lynn', 'Wendy'];
const KIDS = ['Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Ella', 'Jack', 'Leo', 'Nora', 'Finn', 'Maya',
  'Theo', 'Isla', 'Gus', 'Hazel', 'Milo', 'Ruby', 'Axel', 'Ivy', 'Otto'];
const LAST = ['Anderson', 'Johnson', 'Nelson', 'Olson', 'Peterson', 'Larson', 'Swanson', 'Hanson',
  'Carlson', 'Erickson', 'Lindquist', 'Schmidt', 'Mueller', 'Nguyen', 'Vang', 'Xiong', 'Her', 'Lee', 'Ali',
  'Hassan', 'Garcia', 'Martinez', 'Miller', 'Smith', 'Brown', 'Jones', 'Wilson', 'Thompson', 'Moore',
  'Taylor', 'Jackson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright',
  'Hill', 'Scott', 'Green', 'Baker', 'Adams', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell',
  'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan',
  'Bell', 'Kelly', 'Howard', 'Ward', 'Cox', 'Richardson', 'Wood', 'Watson', 'Brooks', 'Bennett', 'Gray',
  'James', 'Reyes', 'Cruz', 'Hughes', 'Price', 'Myers', 'Long', 'Foster', 'Sanders', 'Ross', 'Morales',
  'Powell', 'Sullivan', 'Russell', 'Ortiz', 'Jenkins', 'Gutierrez', 'Perry', 'Butler', 'Barnes', 'Fisher',
  'Henderson', 'Coleman', 'Simmons', 'Patterson', 'Jordan', 'Reynolds', 'Hamilton', 'Graham', 'Kim',
  'Wallace', 'Becker', 'Schultz', 'Hoffman', 'Kowalski', 'Novak', 'Dahl', 'Berg', 'Lund', 'Strand',
  'Moen', 'Haugen', 'Bakken', 'Thorson', 'Wagner', 'Krueger', 'Klein', 'Weber', 'Koch', 'Schroeder',
  'Fitzgerald', 'Gustafson', 'Sandberg', 'Engstrom', 'Rasmussen', 'Christensen', 'Jensen', 'Madsen'];
const NICK = {
  Robert: 'Bob', William: 'Bill', Katherine: 'Kate', James: 'Jim', Michael: 'Mike', Elizabeth: 'Liz',
  Thomas: 'Tom', Jennifer: 'Jen',
};
const PERSONAL_DOMAINS = ['example.com', 'example.net', 'example.org', 'mail.example.com', 'mail.example.net',
  'inbox.example.org', 'home.example.com', 'web.example.net', 'post.example.org'];
const PERSONAL_CUM = [38, 50, 60, 68, 76, 85, 89, 93, 96];
const WORK_DOMAINS = ['northstarmfg.example', 'lakeshorehealth.example', 'prairiebankmn.example', 'gophermedical.example',
  'riverbendlaw.example', 'tenthousandlakes.example', 'minnehahasupply.example', 'cedarcreekschools.example',
  'loonlogistics.example', 'arrowheadins.example', 'bluffcountry.example', 'mississippimill.example'];

const ZIP_RANGES = {
  'Home state': [[55101, 55130, 3], [55301, 55350, 2], [55369, 55379, 2], [55401, 55447, 3], [55001, 55025, 1],
    [55033, 55044, 1], [55068, 55077, 2], [55110, 55128, 2], [55901, 55906, 1], [56001, 56003, 1],
    [55801, 55812, 1], [56301, 56304, 1]],
  'Neighbor state (east)': [[54001, 54025, 1], [54701, 54703, 1], [53703, 53719, 1], [54601, 54603, 1]],
  'Neighbor state (south)': [[50309, 50325, 1], [52001, 52003, 1], [52401, 52411, 1], [51101, 51111, 1]],
  'Neighbor states (west)': [[58102, 58104, 1], [57103, 57110, 1], [58501, 58504, 1]],
  Other: [[60601, 60614, 1], [80202, 80211, 1], [85004, 85016, 1], [75201, 75206, 1]],
};
const REGION_W = { 'Home state': 0.72, 'Neighbor state (east)': 0.1, 'Neighbor state (south)': 0.07, 'Neighbor states (west)': 0.06, Other: 0.05 };
const AREA_CODES = {
  'Home state': ['612', '651', '763', '952', '507', '218', '320'], 'Neighbor state (east)': ['715', '608', '920'],
  'Neighbor state (south)': ['515', '319', '563'], 'Neighbor states (west)': ['701', '605'], Other: ['312', '303', '480', '214'],
};

const HEROES = {
  H1: { first: 'Erik', last: 'Lindgren', zip: '55420', archetype: 'pass', gender: 'm',
    emails: ['erik.lindgren@example.com', 'elindgren.home@example.net'], phones: ['952-555-0148'] },
  H2: { first: 'Katherine', last: 'Halvorsen', zip: '55125', archetype: 'member', gender: 'f',
    emails: ['khalvorsen@example.org', 'katherine.halvorsen@arrowheadins.example'], phones: ['651-555-0183', '651-555-0129'] },
  H3: { first: 'Dale', last: 'Brekke', zip: '56001', archetype: 'group_only', gender: 'm',
    emails: ['dalebrekke@example.com', 'dbrekke@valleylutheranmankato.example'], phones: ['507-555-0162', '507-555-0110'] },
  H4: { first: 'Jennifer', last: 'Solberg', zip: '55304', archetype: 'family', gender: 'f',
    emails: ['jen.solberg@mail.example.com'], phones: ['763-555-0137'] },
};
const HERO_SLOTS = { H1: 2311, H2: 6107, H3: 11893, H4: 16457 };

const DAY = 86400000;
const OPENER = { 2024: [3, 4], 2025: [2, 31], 2026: [3, 2] }; // [monthIndex, day]

function pad(n, w) { return String(n).padStart(w, '0'); }
function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function cumulative(w) { let c = 0; return w.map((x) => (c += x)); }
// Weighted pick over precomputed cumulative weights (hot paths).
function cumPick(rand, items, cum) {
  const x = rand() * cum[cum.length - 1];
  for (let i = 0; i < cum.length; i++) if (x < cum[i]) return items[i];
  return items[items.length - 1];
}
function round2(x) { return Math.round(x * 100) / 100; }
function shuffle(rand, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- games ----------
function makeGames(rand) {
  const games = [];
  const bySeason = {};
  for (const yr of SEASONS) {
    const list = [];
    // Homestand sizes first, then road trips sized so the last home game lands in late September.
    const stands = [];
    for (let left = HOME_GAMES[yr]; left > 0; left -= stands[stands.length - 1]) {
      stands.push(Math.min(left, pick(rand, [3, 4, 6, 7], [2, 3, 3, 2])));
    }
    const start = Date.UTC(yr, OPENER[yr][0], OPENER[yr][1]);
    const span = Math.round((Date.UTC(yr, 8, 27) - start) / DAY) + 1;
    const away = span - HOME_GAMES[yr];
    let d = start;
    stands.forEach((stand, si) => {
      for (let i = 0; i < stand; i++) {
        const dt = new Date(d);
        const dow = dt.getUTCDay();
        let dayType = 'weeknight';
        if (dow === 0 || dow === 6) dayType = 'weekend';
        else if (i === stand - 1 || rand() < 0.15) dayType = 'day';
        const month = dt.getUTCMonth();
        const monthW = [1, 1, 1, 0.82, 0.95, 1.1, 1.15, 1.05, 0.9, 0.85][month] || 1;
        const typeW = dayType === 'weekend' ? 1.35 : dayType === 'day' ? 0.85 : 0.92;
        list.push({
          gameId: `${yr}-${pad(list.length + 1, 3)}`, season: yr, date: isoDate(d), dayType,
          w: typeW * monthW * (list.length === 0 ? 1.6 : 1),
        });
        d += DAY;
      }
      const gaps = stands.length - 1;
      if (si < gaps) d += DAY * (Math.floor(away * (si + 1) / gaps) - Math.floor(away * si / gaps));
    });
    let c = 0;
    const cum = list.map((g) => (c += g.w));
    bySeason[yr] = { list, cum, total: c };
    games.push(...list);
  }
  return { games, bySeason };
}

// k distinct games from a season, weighted by game popularity.
function sampleGames(rand, S, k) {
  const n = S.list.length;
  if (k >= n) return S.list.slice();
  const mark = new Uint8Array(n);
  let got = 0;
  while (got < k) {
    const x = rand() * S.total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (S.cum[mid] > x) hi = mid; else lo = mid + 1;
    }
    if (!mark[lo]) { mark[lo] = 1; got++; }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (mark[i]) out.push(S.list[i]);
  return out;
}

// ---------- people ----------
function makePeople(rand, size) {
  const people = [];
  const st = [];
  const usedEmails = new Set();
  const usedPhones = new Set();
  const usedNameZip = new Set();
  const archs = Object.keys(TUNE.archetypes);
  const archW = archs.map((a) => TUNE.archetypes[a]);
  const lastCum = cumulative(LAST.map((_, i) => 1 / Math.sqrt(i + 3)));
  const zipPools = {};
  for (const r of REGIONS) {
    const zips = [];
    const w = [];
    for (const [a, b, wt] of ZIP_RANGES[r]) for (let z = a; z <= b; z++) { zips.push(pad(z, 5)); w.push(wt); }
    zipPools[r] = { zips, cum: cumulative(w) };
  }
  for (const h of Object.values(HEROES)) {
    h.emails.forEach((e) => usedEmails.add(e));
    h.phones.forEach((p) => usedPhones.add(p));
  }

  function makePhone(region) {
    for (;;) {
      const area = AREA_CODES[region][Math.floor(rand() * AREA_CODES[region].length)];
      intBetween(rand, 201, 989); // keeps the random stream aligned with earlier output
      const p = `${area}-555-${pad(intBetween(rand, 0, 9999), 4)}`;
      if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
    }
  }
  function makeEmail(first, last, work) {
    const f = first.toLowerCase();
    const l = last.toLowerCase();
    const dom = work ? WORK_DOMAINS[Math.floor(rand() * WORK_DOMAINS.length)] : cumPick(rand, PERSONAL_DOMAINS, PERSONAL_CUM);
    const styles = work ? [`${f}.${l}`, `${f[0]}${l}`, `${f}${l[0]}`]
      : [`${f}.${l}`, `${f}${l}`, `${f[0]}${l}`, `${f}.${l}${intBetween(rand, 1, 99)}`, `${l}${f[0]}${intBetween(rand, 60, 99)}`, `${f}_${l}`];
    let base = styles[Math.floor(rand() * styles.length)];
    for (let n = 2; ; n++) {
      const e = `${base}@${dom}`;
      if (!usedEmails.has(e)) { usedEmails.add(e); return e; }
      base = `${styles[0]}${n}`;
    }
  }

  let hh = 0;
  while (people.length < size) {
    hh++;
    const region = pick(rand, REGIONS, REGIONS.map((r) => REGION_W[r]));
    const zp = zipPools[region];
    const zip = cumPick(rand, zp.zips, zp.cum);
    const last = cumPick(rand, LAST, lastCum);
    const hsize = Math.min(size - people.length, pick(rand, [1, 2, 3, 4], [0.5, 0.32, 0.12, 0.06]));
    const initials = new Set();
    const headIdx = people.length;
    for (let i = 0; i < hsize; i++) {
      const teen = i >= 2 && rand() < TUNE.teenRate;
      const gender = i === 0 ? (rand() < 0.5 ? 'm' : 'f') : i === 1 ? (people[headIdx].gender === 'm' ? 'f' : 'm') : (rand() < 0.5 ? 'm' : 'f');
      const pool = gender === 'm' ? MALE : FEMALE;
      let first;
      for (let t = 0; t < 50; t++) {
        first = pool[Math.floor(rand() * pool.length)];
        if (!initials.has(first[0]) && !usedNameZip.has(`${first}|${last}|${zip}`)) break;
      }
      initials.add(first[0]);
      usedNameZip.add(`${first}|${last}|${zip}`);
      let archetype;
      let role = null;
      if (teen) { archetype = 'casual'; role = 'minor'; }
      else if (i > 0 && people[headIdx].archetype === 'member' && rand() < 0.55) { archetype = 'casual'; role = 'recipient'; }
      else archetype = pick(rand, archs, archW);
      if (archetype === 'casual' && !role) role = rand() < 0.45 ? 'recipient' : 'one_game';
      const emails = [makeEmail(first, last, false)];
      if (!teen && rand() < 0.45) emails.push(makeEmail(first, last, rand() < 0.7));
      const phones = [];
      if (!teen || rand() < 0.5) phones.push(makePhone(region));
      if (!teen && rand() < 0.25) phones.push(makePhone(region));
      const pid = `P${pad(people.length + 1, 5)}`;
      people.push({
        pid, first, last, zip, region, emails, phones, householdId: `HH${pad(hh, 5)}`,
        isMinor: teen, archetype, heroId: null, gender,
      });
      st.push({ role, head: headIdx });
    }
    // A teen in the house means the head buys tickets and sends some to them.
    for (let i = headIdx + 2; i < people.length; i++) {
      if (people[i].isMinor && !['member', 'single', 'triple_play', 'family'].includes(people[headIdx].archetype)) {
        people[headIdx].archetype = pick(rand, ['member', 'single', 'triple_play'], [0.4, 0.3, 0.3]);
      }
    }
  }

  // Heroes replace single-person households at fixed slots so they flow through the same emitters.
  const hhSize = new Map();
  for (const p of people) hhSize.set(p.householdId, (hhSize.get(p.householdId) || 0) + 1);
  for (const [hid, spec] of Object.entries(HEROES)) {
    let i = Math.min(HERO_SLOTS[hid], people.length - 1);
    while (i < people.length && hhSize.get(people[i].householdId) > 1) i++;
    if (i >= people.length) i = Math.min(HERO_SLOTS[hid], people.length - 1);
    const p = people[i];
    Object.assign(p, {
      first: spec.first, last: spec.last, zip: spec.zip, region: 'Home state', emails: spec.emails.slice(),
      phones: spec.phones.slice(), archetype: spec.archetype, heroId: hid, gender: spec.gender, isMinor: false,
    });
    st[i].role = null;
  }
  return { people, st, makeEmail };
}

// ---------- contact variants (messy copies per source) ----------
function makeVariantFactory(rand, people, makeEmail) {
  const cache = new Map(); // key -> per-person array
  const PHONE_FMT = {
    ticketing: (d) => `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
    fnb: (d) => d,
    groups: (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
    experiences: (d) => `+1 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`,
    kidsClub: (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`,
  };
  function typo(s) {
    const vowels = 'aeiou';
    const idx = [];
    for (let i = 1; i < s.length; i++) if (vowels.includes(s[i])) idx.push(i);
    if (idx.length === 0) return s + s[s.length - 1];
    const i = idx[Math.floor(rand() * idx.length)];
    const others = vowels.replace(s[i], '');
    return s.slice(0, i) + others[Math.floor(rand() * others.length)] + s.slice(i + 1);
  }
  function messName(p) {
    if (rand() >= TUNE.nameMess) return `${p.first} ${p.last}`;
    if (NICK[p.first] && rand() < 0.7) return `${NICK[p.first]} ${p.last}`;
    return rand() < 0.5 ? `${typo(p.first)} ${p.last}` : `${p.first} ${typo(p.last)}`;
  }
  // source: ticketing|fnb|groups|experiences|kidsClub; key distinguishes extra accounts.
  return function variant(i, source, key = source) {
    let byPerson = cache.get(key);
    if (!byPerson) { byPerson = new Array(people.length); cache.set(key, byPerson); }
    if (byPerson[i]) return byPerson[i];
    const p = people[i];
    const name = messName(p);
    let email = p.emails[0];
    const pSecond = TUNE.secondEmail[key] ?? TUNE.secondEmail[source] ?? 0.2;
    if (rand() < pSecond) {
      if (p.emails.length < 2 && key.startsWith('ticketing_dup')) p.emails.push(makeEmail(p.first, p.last, false));
      if (p.emails.length > 1) email = p.emails[1 + Math.floor(rand() * (p.emails.length - 1))];
    }
    if (rand() < 0.04) email = email[0].toUpperCase() + email.slice(1);
    let phone = p.phones[0] || null;
    const r = rand();
    if (r < TUNE.missingPhone) phone = null;
    else if (r < TUNE.missingPhone + TUNE.oldPhone && p.phones[1]) phone = p.phones[1];
    const fmt = PHONE_FMT[source] || PHONE_FMT.ticketing;
    const v = { name, email, phone: phone ? fmt(phone.replace(/\D/g, '')) : null, zip: p.zip };
    byPerson[i] = v;
    return v;
  };
}

// ---------- season plans ----------
function memberSpend(rand, plan, tier, premium) {
  const m = premium ? 1.8 : 1;
  if (plan === 'season_pre') return Math.round(intBetween(rand, 1800, 5600) * m);
  if (plan === 'choice') return Math.round(intBetween(rand, 6, 75) * 100 * (premium ? 1.3 : 1));
  if (plan === 'reserved') {
    const base = tier === 'full' ? intBetween(rand, 3600, 6800) : tier === 'half' ? intBetween(rand, 1900, 3400) : intBetween(rand, 750, 1400);
    return Math.round(base * m);
  }
  return Math.round(intBetween(rand, 450, 900) * m); // starter
}
const PASS_PRICE = { 2024: 179, 2025: 199, 2026: 229 };

function planPerson(rand, p, s) {
  const out = {};
  const a = p.archetype;
  const tr = TUNE.trend;
  const singleSeason = (yr, prob) => {
    if (rand() < prob * tr[yr]) {
      const g = pick(rand, [1, 2, 3, 4], [0.55, 0.27, 0.12, 0.06]);
      return { plan: 'single', own: g, spend: g * intBetween(rand, 28, 85) };
    }
    return null;
  };
  const triple = (yr) => {
    const bundles = rand() < 0.15 ? 2 : 1;
    const own = Math.max(1, bundles * 3 - (rand() < 0.3 ? 1 : 0));
    return { plan: 'triple_play', own, spend: bundles * intBetween(rand, 95, 150) };
  };
  if (a === 'member') {
    s.premiumOwn = rand() < 0.2;
    s.seat = s.premiumOwn ? pick(rand, OWNED_PREMIUM, [3, 2, 2, 1]) : pick(rand, GENERAL_AREAS, [3, 3, 2, 1]);
    const tierPlan = pick(rand, MEMBER_PLANS, [0.35, 0.45, 0.2]);
    const resTier = pick(rand, ['full', 'half', 'twenty'], [0.35, 0.35, 0.3]);
    const base = tierPlan === 'reserved' ? (resTier === 'full' ? intBetween(rand, 36, 58) : resTier === 'half' ? intBetween(rand, 20, 34) : intBetween(rand, 12, 18))
      : tierPlan === 'choice' ? intBetween(rand, 14, 32) : intBetween(rand, 8, 16);
    const churn = rand() < 0.08; // left after 2025
    const leftEarly = !churn && rand() < 0.12; // held a 2024 season ticket, never joined the membership program
    s.slipping = !churn && !leftEarly && rand() < 0.27;
    const mg = TUNE.memberGames;
    for (const yr of SEASONS) {
      if (yr === 2024) {
        if (rand() < 0.93) out[yr] = { plan: 'season_pre', own: Math.round(base * mg[yr] * (0.85 + rand() * 0.3)), spend: memberSpend(rand, 'season_pre', null, s.premiumOwn) };
        else out[yr] = singleSeason(yr, 1);
      } else if (leftEarly || (yr === 2026 && churn)) {
        out[yr] = singleSeason(yr, 0.5);
      } else {
        let own = Math.round(base * mg[yr] * (0.85 + rand() * 0.3));
        if (yr === 2026 && s.slipping) own = Math.max(1, Math.round(own * (0.15 + rand() * 0.4)));
        out[yr] = { plan: tierPlan, own, spend: memberSpend(rand, tierPlan, resTier, s.premiumOwn) };
      }
      const o = out[yr];
      if (o && o.plan !== 'single') {
        o.xfer = yr === 2026 && s.slipping ? intBetween(rand, 6, 16) : intBetween(rand, 1, 8);
        o.seat = s.seat;
      }
    }
  } else if (a === 'pass') {
    s.power = rand() < 0.42;
    out[2026] = { plan: 'ballpark_pass', own: s.power ? intBetween(rand, 20, 38) : intBetween(rand, 3, 15), spend: PASS_PRICE[2026] };
    out[2025] = pick(rand, ['pass', 'single', 'none'], [0.6, 0.25, 0.15]);
    out[2024] = pick(rand, ['pass', 'single', 'triple', 'none'], [0.5, 0.3, 0.1, 0.1]);
    for (const yr of [2024, 2025]) {
      const k = out[yr];
      out[yr] = k === 'pass' ? { plan: 'ballpark_pass', own: intBetween(rand, 8, yr === 2024 ? 34 : 28), spend: PASS_PRICE[yr] }
        : k === 'single' ? singleSeason(yr, 1) : k === 'triple' ? triple(yr) : null;
    }
  } else if (a === 'triple_play') {
    for (const yr of SEASONS) out[yr] = rand() < 0.78 * tr[yr] ? triple(yr) : singleSeason(yr, 0.5);
  } else if (a === 'single') {
    for (const yr of SEASONS) out[yr] = singleSeason(yr, 0.62);
    if (!SEASONS.some((yr) => out[yr])) out[2024] = singleSeason(2024, 2);
  } else if (a === 'lapsed_single') {
    out[2024] = singleSeason(2024, 0.75);
    out[2025] = singleSeason(2025, out[2024] ? 0.5 : 2);
    out[2026] = null;
  } else if (a === 'family') {
    for (const yr of SEASONS) out[yr] = rand() < 0.4 ? triple(yr) : singleSeason(yr, 0.7);
    if (!out[2026] || rand() < 0.15) out[2026] = rand() < 0.5 ? triple(2026) : singleSeason(2026, 2);
  } else if (a === 'premium_curious') {
    for (const yr of SEASONS) out[yr] = rand() < 0.4 ? triple(yr) : singleSeason(yr, yr === 2026 ? 0.9 : 0.6);
  } else if (a === 'casual' && s.role === 'one_game') {
    const yr = pick(rand, SEASONS, [1.4, 1, 0.75]);
    out[yr] = { plan: 'single', own: 1, spend: intBetween(rand, 25, 70) };
  }
  return out;
}

const HERO_PLANS = {
  H1: { 2024: { plan: 'triple_play', own: 3, spend: 129 }, 2025: { plan: 'ballpark_pass', own: 31, spend: 199 },
    2026: { plan: 'ballpark_pass', own: 38, spend: 229 } },
  H2: { 2024: { plan: 'season_pre', own: 41, spend: 4200, xfer: 6, seat: 'Main Level' },
    2025: { plan: 'reserved', own: 44, spend: 5150, xfer: 5, seat: 'Main Level' },
    2026: { plan: 'reserved', own: 12, spend: 5150, xfer: 26, seat: 'Main Level' } },
  H3: { 2024: null, 2025: null, 2026: null },
  H4: { 2024: { plan: 'single', own: 1, spend: 64 }, 2025: { plan: 'single', own: 2, spend: 118 },
    2026: { plan: 'triple_play', own: 3, spend: 126 } },
};

// ---------- main ----------
function generateWorld({ seed = SEED, size = SAMPLE_SIZE } = {}) {
  const rand = mulberry32(seed);
  const { games, bySeason } = makeGames(rand);
  const { people, st, makeEmail } = makePeople(rand, size);
  const variant = makeVariantFactory(rand, people, makeEmail);
  const heroes = {};
  people.forEach((p) => { if (p.heroId) heroes[p.heroId] = p.pid; });
  const gateIds = GATES.map((g) => g.id);
  const gateW = { G3: 0.13, G6: 0.16, G14: 0.14, G29: 0.24, G34: 0.33 };

  // Hero contact mess, fixed so match evidence is visible on tab 5.
  const heroIdx = {};
  people.forEach((p, i) => { if (p.heroId) heroIdx[p.heroId] = i; });
  const forced = new Map([
    [`${heroIdx.H1}|ticketing`, { name: 'Erik Lindgren', email: 'erik.lindgren@example.com', phone: '952-555-0148', zip: '55420' }],
    [`${heroIdx.H1}|fnb`, { name: 'Erik Lindgren', email: 'elindgren.home@example.net', phone: '9525550148', zip: '55420' }],
    [`${heroIdx.H2}|ticketing`, { name: 'Katherine Halvorsen', email: 'khalvorsen@example.org', phone: '651-555-0183', zip: '55125' }],
    [`${heroIdx.H2}|fnb`, { name: 'Kate Halvorsen', email: 'khalvorsen@example.org', phone: '6515550129', zip: '55125' }],
    [`${heroIdx.H3}|groups`, { name: 'Dale Brekke', email: 'dbrekke@valleylutheranmankato.example', phone: '(507) 555-0162', zip: '56001' }],
    [`${heroIdx.H3}|groups_attendee`, { name: 'Dale Brekke', email: 'dalebrekke@example.com', phone: null, zip: '56001' }],
    [`${heroIdx.H3}|fnb`, { name: 'Dale Brekke', email: 'dalebrekke@example.com', phone: '5075550162', zip: '56001' }],
    [`${heroIdx.H4}|ticketing`, { name: 'Jennifer Solberg', email: 'jen.solberg@mail.example.com', phone: '763-555-0137', zip: '55304' }],
    [`${heroIdx.H4}|kidsClub`, { name: 'Jen Solberg', email: 'jen.solberg@mail.example.com', phone: null, zip: '55304' }],
    [`${heroIdx.H4}|fnb`, { name: 'Jennifer Solburg', email: 'jen.solberg@mail.example.com', phone: '7635550137', zip: '55304' }],
  ]);
  const contact = (i, source, key = source) => (people[i].heroId && forced.get(`${i}|${key}`)) || variant(i, source, key);
  const flags = (i) => ({ isMinor: people[i].isMinor, heroId: people[i].heroId });

  // ---- behavior state per person ----
  const attended = people.map(() => ({ 2024: 0, 2025: 0, 2026: 0 }));
  const app = people.map((p) => {
    if (p.heroId) return 1;
    const r = TUNE.appUser[p.archetype] || 0;
    if (rand() >= r) return 0;
    return p.archetype === 'premium_curious' ? 0.85 : TUNE.identRate;
  });
  const fnbMult = people.map((p, i) => {
    let m = 0.6 + rand() * 0.9;
    if (p.archetype === 'premium_curious') m *= 3;
    if (st[i].power) m *= 1.3;
    if (p.heroId === 'H1') m = 2.2;
    return m;
  });
  const plans = people.map((p, i) => (p.heroId ? HERO_PLANS[p.heroId] : planPerson(rand, p, st[i])));
  if (people[heroIdx.H1]) st[heroIdx.H1].power = true;
  if (people[heroIdx.H2]) st[heroIdx.H2].slipping = true;

  // ---- ticketing accounts ----
  const ticketing = [];
  const primaryAcct = new Array(people.length).fill(null);
  let tktN = 0;
  function newAccount(i, key) {
    const c = contact(i, 'ticketing', key);
    const acct = {
      tktId: `T${pad(++tktN, 6)}`, pid: people[i].pid, name: c.name, email: c.email, phone: c.phone, zip: c.zip,
      seasons: {}, ...flags(i),
    };
    for (const yr of SEASONS) acct.seasons[yr] = { plan: 'none', ticketSpend: 0, transfersSent: 0, transfersReceived: 0, noShows: 0 };
    ticketing.push(acct);
    return acct;
  }
  const needsAccount = (i) => SEASONS.some((yr) => plans[i][yr]) || st[i].role === 'recipient' || st[i].role === 'minor'
    || people[i].archetype === 'premium_curious';
  for (let i = 0; i < people.length; i++) if (needsAccount(i)) primaryAcct[i] = newAccount(i, 'ticketing');

  // Transfer circles: members send to household first, then to recipients and premium-curious fans.
  const recipPool = shuffle(rand, people.map((p, i) => i).filter((i) => st[i].role === 'recipient' && people[st[i].head].archetype !== 'member'));
  const curiousPool = shuffle(rand, people.map((p, i) => i).filter((i) => people[i].archetype === 'premium_curious' && !people[i].heroId));
  const curiousViaTransfer = curiousPool.slice(0, Math.round(curiousPool.length * 0.65));
  const curiousViaGroup = curiousPool.slice(curiousViaTransfer.length);
  const circles = new Map();
  let rp = 0;
  let cp = 0;
  people.forEach((p, i) => {
    const plan = plans[i];
    const sends = SEASONS.some((yr) => plan[yr] && plan[yr].xfer);
    const hh = [];
    for (let j = st[i].head; j < people.length && people[j].householdId === p.householdId; j++) {
      if (j !== i && primaryAcct[j] && (st[j].role === 'recipient' || st[j].role === 'minor')) hh.push(j);
    }
    if (hh.some((j) => people[j].isMinor)) {
      // Non-members with a teen send 1–2 tickets a season to them.
      for (const yr of SEASONS) if (plan[yr] && !plan[yr].xfer) plan[yr].teenXfer = intBetween(rand, 1, 2);
    }
    if (!sends && !hh.length) return;
    const c = hh.slice();
    if (sends) {
      const extra = intBetween(rand, 1, 3);
      for (let k = 0; k < extra && rp < recipPool.length; k++) c.push(recipPool[rp++]);
      if (st[i].premiumOwn) for (let k = 0; k < 3 && cp < curiousViaTransfer.length; k++) c.push(curiousViaTransfer[cp++]);
      if (people[i].heroId === 'H2' && rp < recipPool.length) c.push(recipPool[rp++]);
    }
    circles.set(i, c);
  });
  // Leftover recipients attach to members round-robin so every recipient account sees a transfer.
  const senders = [...circles.keys()].filter((i) => SEASONS.some((yr) => plans[i][yr] && plans[i][yr].xfer));
  for (let k = 0; rp < recipPool.length && senders.length; k++) circles.get(senders[k % senders.length]).push(recipPool[rp++]);
  for (let k = 0; cp < curiousViaTransfer.length; k++) {
    const prem = senders.filter((i) => st[i].premiumOwn);
    if (!prem.length) break;
    circles.get(prem[k % prem.length]).push(curiousViaTransfer[cp++]);
  }

  // ---- scans and F&B ----
  const scans = [];
  const fnbIdentified = [];
  const anonByGame = new Map();
  for (const g of games) anonByGame.set(g.gameId, { gameId: g.gameId, season: g.season, txns: 0, revenue: 0, byCategory: { food: 0, beverage: 0, merch: 0 } });
  let scanN = 0;
  let txnN = 0;
  const gateCum = cumulative(gateIds.map((g) => gateW[g]));
  const prefGate = people.map(() => cumPick(rand, gateIds, gateCum));
  function gateFor(i) {
    if (i !== null && rand() < 0.7) return prefGate[i];
    return cumPick(rand, gateIds, gateCum);
  }
  function fnbTxn(i, gameId, season, category, venue, amount) {
    const c = contact(i, 'fnb');
    fnbIdentified.push({
      txnId: `F${pad(++txnN, 7)}`, gameId, season, venue, category, amount: round2(amount),
      name: c.name, email: c.email, phone: c.phone, zip: c.zip, pid: people[i].pid, ...flags(i),
    });
  }
  function inParkSpend(i, game) {
    const r = rand();
    let n = r < 0.25 ? 0 : r < 0.65 ? 1 : r < 0.9 ? 2 : 3; // mean 1.2 per scan
    if (i !== null && people[i].heroId) n = Math.max(1, n);
    const mult = i === null ? 0.6 + rand() * 0.9 : fnbMult[i];
    for (let k = 0; k < n; k++) {
      const rc = rand();
      const category = rc < 0.5 ? 'food' : rc < 0.88 ? 'beverage' : 'merch';
      const amount = (category === 'food' ? 8 + rand() * 14 : category === 'beverage' ? 7 + rand() * 9 : 25 + rand() * 65) * mult;
      if (i !== null && app[i] && rand() < app[i]) {
        const venue = category === 'merch' ? 'team_store' : rand() < 0.7 ? 'mobile' : 'concessions';
        fnbTxn(i, game.gameId, game.season, category, venue, amount);
      } else {
        const a = anonByGame.get(game.gameId);
        a.txns++;
        a.revenue += amount;
        a.byCategory[category] += amount;
      }
    }
  }
  function scan(i, game, seatArea, tktId, viaTransfer, bookingId) {
    scans.push({
      scanId: `S${pad(++scanN, 7)}`, gameId: game.gameId, season: game.season, gate: gateFor(i), seatArea,
      tktId, viaTransfer, bookingId, pid: i === null ? null : people[i].pid,
    });
    if (i !== null) attended[i][game.season]++;
    inParkSpend(i, game);
  }

  const dupAcct = new Map();
  for (let i = 0; i < people.length; i++) {
    const plan = plans[i];
    for (const yr of SEASONS) {
      const o = plan[yr];
      if (!o) continue;
      let acct = primaryAcct[i];
      const isPlanHolder = o.plan === 'ballpark_pass' || MEMBER_PLANS.includes(o.plan) || o.plan === 'season_pre';
      if (!people[i].heroId && !isPlanHolder && rand() < TUNE.dupAccount) {
        if (!dupAcct.has(i)) dupAcct.set(i, newAccount(i, 'ticketing_dup'));
        acct = dupAcct.get(i);
      }
      const own = o.own;
      const xfer = o.xfer || 0;
      const picked = sampleGames(rand, bySeason[yr], Math.min(bySeason[yr].list.length, own + xfer));
      shuffle(rand, picked);
      const ownGames = picked.slice(0, own);
      const xferGames = picked.slice(own);
      const seat = o.plan === 'ballpark_pass' ? STANDING : (o.seat || null);
      for (const g of ownGames) scan(i, g, seat || cumPick(rand, GENERAL_AREAS, AREA_CUM), acct.tktId, false, null);
      const circle = circles.get(i) || [];
      let sent = 0;
      if (circle.length) {
        for (const g of xferGames) {
          const r = circle[Math.floor(rand() * circle.length)];
          primaryAcct[r].seasons[yr].transfersReceived++;
          scan(r, g, seat || cumPick(rand, GENERAL_AREAS, AREA_CUM), primaryAcct[r].tktId, true, null);
          sent++;
        }
        const teens = circle.filter((j) => people[j].isMinor);
        for (let k = 0; k < (o.teenXfer || 0) && teens.length && ownGames.length; k++) {
          const r = teens[Math.floor(rand() * teens.length)];
          const g = ownGames[Math.floor(rand() * ownGames.length)];
          primaryAcct[r].seasons[yr].transfersReceived++;
          scan(r, g, cumPick(rand, GENERAL_AREAS, AREA_CUM), primaryAcct[r].tktId, true, null);
          sent++;
        }
      }
      const planGames = MEMBER_PLANS.includes(o.plan) || o.plan === 'season_pre' ? own + xfer + intBetween(rand, 1, 6) : own;
      const s = acct.seasons[yr];
      s.plan = o.plan;
      s.ticketSpend += o.spend;
      s.transfersSent += sent;
      s.noShows += o.plan === 'ballpark_pass' ? 0 : Math.max(0, planGames - own - xfer) + (rand() < 0.08 ? 1 : 0);
    }
  }

  // ---- groups ----
  const groups = [];
  const organizers = new Set();
  let bkN = 0;
  const groupOnly = people.map((p, i) => i).filter((i) => people[i].archetype === 'group_only' && !people[i].heroId);
  const slots = [];
  for (const i of groupOnly) {
    const n = pick(rand, [1, 2, 3, 4], [0.35, 0.38, 0.18, 0.09]);
    for (let k = 0; k < n; k++) slots.push(i);
  }
  shuffle(rand, slots);
  const organizerPool = people.map((p, i) => i).filter((i) => ['member', 'single', 'triple_play', 'family'].includes(people[i].archetype) && !people[i].isMinor && !people[i].heroId);
  let sp = 0;
  let gp = 0;
  function groupGame(yr) {
    const S = bySeason[yr];
    const weekendish = S.list.filter((g) => g.dayType !== 'weeknight');
    return rand() < 0.65 ? weekendish[Math.floor(rand() * weekendish.length)] : S.list[Math.floor(rand() * S.list.length)];
  }
  function addBooking(yr, type, organizerIdx, orgKey, knownIdx, opts = {}) {
    const g = opts.game || groupGame(yr);
    const size = opts.size || 20 + Math.floor(rand() * rand() * 110);
    const premium = opts.premium ?? (type === 'Corporate' && rand() < 0.35);
    const seat = premium ? pick(rand, GROUP_PREMIUM, [2, 2, 1]) : pick(rand, ['Outfield Bleachers', 'Upper Level', 'Main Level'], [3, 2, 1]);
    const price = premium ? 95 + rand() * 60 : 26 + rand() * 24;
    const bookingId = `G${pad(++bkN, 5)}`;
    const oc = contact(organizerIdx, 'groups', orgKey);
    organizers.add(organizerIdx);
    const known = [];
    const seen = new Set([organizerIdx]);
    for (const k of knownIdx) {
      if (seen.has(k)) continue;
      seen.add(k);
      const c = contact(k, 'groups', 'groups_attendee');
      known.push({ name: c.name, email: c.email, zip: c.zip, pid: people[k].pid, ...flags(k) });
    }
    groups.push({
      bookingId, season: yr, gameId: g.gameId, type, size, amount: Math.round(size * price),
      organizer: { name: oc.name, email: oc.email, phone: oc.phone, zip: oc.zip, pid: people[organizerIdx].pid, ...flags(organizerIdx) },
      knownAttendees: known, seatArea: seat,
    });
    const showing = Math.round(size * (0.88 + rand() * 0.1));
    const named = [organizerIdx, ...[...seen].filter((k) => k !== organizerIdx)];
    for (let k = 0; k < showing; k++) scan(k < named.length ? named[k] : null, g, seat, null, false, bookingId);
  }
  // Hero H3: church outings in 2025 and 2026 as organizer, a youth sports outing in 2024 as a known attendee.
  if (heroIdx.H3 !== undefined) {
    const h = heroIdx.H3;
    const other = organizerPool[Math.floor(rand() * organizerPool.length)];
    addBooking(2024, 'Youth sports', other, 'groups', [h], { size: 34 });
    addBooking(2025, 'Church', h, 'groups', [], { size: 48, premium: false });
    addBooking(2026, 'Church', h, 'groups', [], { size: 52, premium: false });
  }
  for (const yr of SEASONS) {
    for (let b = 0; b < TUNE.groupBookings[yr]; b++) {
      const type = pick(rand, GROUP_TYPES, [0.25, 0.22, 0.15, 0.12, 0.1, 0.16]);
      let org;
      if (sp >= slots.length || rand() < (type === 'Corporate' ? TUNE.organizerFromBuyers.corporate : TUNE.organizerFromBuyers.other)) org = organizerPool[Math.floor(rand() * organizerPool.length)];
      else org = slots[sp++];
      const nKnown = pick(rand, [0, 1, 2, 3, 4, 5], [0.2, 0.25, 0.22, 0.15, 0.1, 0.08]);
      const known = [];
      for (let k = 0; k < nKnown && sp < slots.length; k++) known.push(slots[sp++]);
      const premium = type === 'Corporate' && (gp < curiousViaGroup.length ? rand() < 0.6 : rand() < 0.35);
      if (premium && gp < curiousViaGroup.length) known.push(curiousViaGroup[gp++]);
      addBooking(yr, type, org, 'groups', known, { premium });
    }
  }
  // Remaining slots: extra small social outings so every group-only fan appears.
  while (sp < slots.length) {
    const yr = pick(rand, SEASONS, [1, 1, 1]);
    const org = slots[sp++];
    const known = [];
    while (known.length < 2 && sp < slots.length) known.push(slots[sp++]);
    addBooking(yr, 'Social', org, 'groups', known);
  }
  while (gp < curiousViaGroup.length) {
    const yr = pick(rand, SEASONS, [1, 1, 1]);
    addBooking(yr, 'Corporate', organizerPool[Math.floor(rand() * organizerPool.length)], 'groups', [curiousViaGroup[gp++]], { premium: true });
  }

  // ---- non-game retail: Team Store and app merch ----
  for (let i = 0; i < people.length; i++) {
    const a = people[i].archetype;
    for (const yr of SEASONS) {
      let n = 0;
      if (a === 'retail_only') n = rand() < 0.62 * TUNE.trend[yr] ? pick(rand, [1, 2, 3], [0.6, 0.3, 0.1]) : 0;
      else if (a === 'lapsed_single' && yr === 2026) n = rand() < 0.65 ? pick(rand, [1, 2], [0.7, 0.3]) : 0;
      else if (a === 'member' && rand() < 0.02) n = 1;
      if (people[i].heroId === 'H4' && yr === 2026) n = 2;
      for (let k = 0; k < n; k++) {
        const venue = rand() < 0.65 ? 'team_store' : 'mobile';
        fnbTxn(i, null, yr, 'merch', venue, 22 + rand() * 90);
      }
    }
  }

  // ---- experiences ----
  const experiences = [];
  let expN = 0;
  const expBuyerArch = ['member', 'premium_curious', 'family', 'single', 'triple_play', 'pass'];
  const byArch = {};
  for (const a of expBuyerArch) byArch[a] = people.map((p, i) => i).filter((i) => people[i].archetype === a && !people[i].heroId && !people[i].isMinor);
  for (const yr of SEASONS) {
    for (let e = 0; e < TUNE.experiences[yr]; e++) {
      const kind = pick(rand, ['tour', 'suite', 'rooftop_deck'], [0.55, 0.25, 0.2]);
      const a = pick(rand, expBuyerArch, TUNE.expBuyers);
      if (!byArch[a].length) continue;
      const i = byArch[a][Math.floor(rand() * byArch[a].length)];
      const amount = kind === 'tour' ? intBetween(rand, 2, 6) * (rand() < 0.15 ? 95 : intBetween(rand, 22, 30))
        : kind === 'suite' ? intBetween(rand, 25, 90) * 100 : intBetween(rand, 6, 24) * 100;
      const c = contact(i, 'experiences');
      experiences.push({
        expId: `E${pad(++expN, 5)}`, season: yr, kind, amount,
        buyer: { name: c.name, email: c.email, phone: c.phone, zip: c.zip, pid: people[i].pid, ...flags(i) },
      });
    }
  }

  // ---- Kids Club ----
  const kidsClub = [];
  let kcN = 0;
  for (let i = 0; i < people.length; i++) {
    if (people[i].archetype !== 'family') continue;
    const nKids = people[i].heroId === 'H4' ? 2 : pick(rand, [1, 2, 3], [0.55, 0.35, 0.1]);
    const c = contact(i, 'kidsClub');
    const used = new Set();
    for (let k = 0; k < nKids; k++) {
      let child;
      do child = KIDS[Math.floor(rand() * KIDS.length)]; while (used.has(child));
      used.add(child);
      const joinYr = pick(rand, SEASONS, [1, 1, 1.2]);
      kidsClub.push({
        kcId: `K${pad(++kcN, 5)}`, childFirst: child, birthYear: intBetween(rand, 2013, 2021),
        joinDate: isoDate(Date.UTC(joinYr, intBetween(rand, 0, 5), intBetween(rand, 1, 28))),
        parent: { name: c.name, email: c.email, phone: c.phone, zip: c.zip, pid: people[i].pid, ...flags(i) },
      });
    }
  }

  // ---- surveys ----
  const surveys = [];
  let respN = 0;
  // Respondents without an account use the group contact they actually gave (organizer or attendee).
  const acctEmail = (i) => (primaryAcct[i] ? primaryAcct[i].email
    : contact(i, 'groups', organizers.has(i) ? 'groups' : 'groups_attendee').email);
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    if (p.isMinor) continue;
    for (const yr of SEASONS) {
      if (!attended[i][yr]) continue;
      const planNow = plans[i][yr] && plans[i][yr].plan;
      const isMember = MEMBER_PLANS.includes(planNow) || planNow === 'season_pre';
      let prob = isMember ? 0.22 : TUNE.surveyRate;
      if (st[i].slipping && yr === 2026) prob = 0.7;
      let force = false;
      if (p.heroId === 'H2' && yr >= 2025) force = true;
      if (p.heroId === 'H4' && yr === 2026) force = true;
      if (!force && rand() >= prob) continue;
      let sat = st[i].slipping && yr === 2026 ? intBetween(rand, 2, 5) : pick(rand, [4, 5, 6, 7, 8, 9, 10], [0.04, 0.06, 0.1, 0.18, 0.26, 0.21, 0.15]);
      if (p.heroId === 'H2') sat = yr === 2026 ? 3 : 8;
      if (p.heroId === 'H4') sat = 9;
      const renewalIntent = sat >= 8 ? 'likely' : sat >= 5 ? (rand() < 0.75 ? 'unsure' : 'likely') : (rand() < 0.8 ? 'unlikely' : 'unsure');
      surveys.push({ respId: `R${pad(++respN, 5)}`, season: yr, email: acctEmail(i), satisfaction: sat, renewalIntent, pid: p.pid, ...flags(i) });
    }
  }

  // ---- consent and do-not-contact ----
  const consent = [];
  const dnc = [];
  const emailSource = new Map();
  const phoneSource = new Map();
  const appEmail = new Set();
  const minorContact = new Set();
  const note = (map, k, src) => { if (k && !map.has(k)) map.set(k, src); };
  for (const t of ticketing) { note(emailSource, t.email, 'Ticketing account'); note(phoneSource, t.phone, 'Ticketing account'); if (t.isMinor) minorContact.add(t.email); }
  for (const f of fnbIdentified) { note(emailSource, f.email, f.venue === 'mobile' ? 'Mobile order' : 'Team Store checkout'); note(phoneSource, f.phone, 'Mobile order'); appEmail.add(f.email); }
  for (const g of groups) { note(emailSource, g.organizer.email, 'Group booking form'); note(phoneSource, g.organizer.phone, 'Group booking form'); for (const k of g.knownAttendees) note(emailSource, k.email, 'Group booking link'); }
  for (const e of experiences) { note(emailSource, e.buyer.email, 'Experience purchase'); note(phoneSource, e.buyer.phone, 'Experience purchase'); }
  for (const k of kidsClub) { note(emailSource, k.parent.email, 'Kids Club enrollment'); note(phoneSource, k.parent.phone, 'Kids Club enrollment'); }
  for (let i = 0; i < people.length; i++) if (app[i] && primaryAcct[i]) appEmail.add(primaryAcct[i].email);
  const dateStrings = Array.from({ length: 1400 }, (_, k) => isoDate(Date.UTC(2023, 0, 1) + k * DAY));
  const consentDate = () => dateStrings[Math.floor(rand() * dateStrings.length)];
  for (const [email, source] of emailSource) {
    const minor = minorContact.has(email);
    const status = pick(rand, ['opt_in', 'opt_out', 'none'], minor ? [0.6, 0.05, 0.35] : [0.5, 0.1, 0.4]);
    consent.push({ contact: email, channel: 'email', status, source, date: status === 'none' ? null : consentDate() });
    if (appEmail.has(email)) {
      const ps = pick(rand, ['opt_in', 'opt_out', 'none'], [0.55, 0.15, 0.3]);
      consent.push({ contact: email, channel: 'push', status: ps, source: 'Team app', date: ps === 'none' ? null : consentDate() });
    }
    if (rand() < 0.015) dnc.push(email);
  }
  for (const [phone, source] of phoneSource) {
    const status = pick(rand, ['opt_in', 'opt_out', 'none'], [0.22, 0.08, 0.7]);
    consent.push({ contact: phone, channel: 'sms', status, source, date: status === 'none' ? null : consentDate() });
    if (rand() < 0.01) dnc.push(phone);
  }

  const fnbAnonymous = [...anonByGame.values()].map((a) => ({
    gameId: a.gameId, season: a.season, txns: a.txns, revenue: round2(a.revenue),
    byCategory: { food: round2(a.byCategory.food), beverage: round2(a.byCategory.beverage), merch: round2(a.byCategory.merch) },
  }));

  return {
    games: games.map(({ gameId, season, date, dayType }) => ({ gameId, season, date, dayType })),
    people: people.map(({ gender, ...p }) => p),
    ticketing, scans, fnbIdentified, fnbAnonymous, groups, experiences, surveys, kidsClub, consent, dnc, heroes,
  };
}

module.exports = { generateWorld, TUNE, STANDING };
