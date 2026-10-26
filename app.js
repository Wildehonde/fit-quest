/* =====================================================================
   Fit Quest v2 – gamified fitness tracker (plain JS, no build step)
   Data: localStorage (STORE_KEY) + IndexedDB for progress photos.
   Sections: 1) config 2) state+migration 3) scoring 4) game rules
             5) goals 6) habits 7) photos 8) charts 9) share cards
             10) views 11) actions 12) boot + demo
   ===================================================================== */

/* ---------- 1) CONFIG ---------- */
const STORE_KEY = 'fitquest-v2';
const V1_KEY = 'fitquest-v1';

const PERSONAS = {
  beginner: { rank: 1, name: 'Beginner', icon: '🌱', xpMult: 1.0, missPenalty: 0, streakBreaks: false, targetMult: 0.6,
    desc: 'Gentle targets. A missed day pauses your streak instead of breaking it.' },
  athlete:  { rank: 2, name: 'Athlete', icon: '⚡', xpMult: 1.25, missPenalty: 0, streakBreaks: true, targetMult: 1,
    desc: 'Stretch goals. Miss a day and your streak resets.' },
  goggins:  { rank: 3, name: 'Goggins', icon: '💀', xpMult: 1.6, missPenalty: 50, streakBreaks: true, targetMult: 1.3,
    desc: 'Stay hard. Miss a day: streak gone, −50 XP. Weekly photo is mandatory.' },
};
const DEPTHS = {
  high: { name: 'High level', icon: '✔️', desc: 'Daily yes/no habits only. Quick, 20 seconds a day.' },
  detailed: { name: 'Detailed', icon: '📊', desc: 'Habits plus workout metrics: sets, reps, watts, PBs and charts.' },
};

const DEFAULT_METRICS = {
  ftp:      { label: 'FTP (W)',           base: 240,   target: 300,   current: 240,   weight: 2 },
  weight:   { label: 'Weight (kg)',       base: 102.8, target: 90,    current: 102.8, weight: 2 },
  hours:    { label: 'Training h / week', base: 5,     target: 10,    current: 5,     weight: 1.5 },
  strength: { label: 'Strength / week',   base: 1,     target: 3,     current: 1,     weight: 1 },
  sleep:    { label: 'Sleep (h/night)',   base: 6,     target: 8,     current: 6,     weight: 1 },
  steps:    { label: 'Steps / day',       base: 6000,  target: 10000, current: 6000,  weight: 0.5 },
};

// Iron 75 tiers (from DESIGN.md draft)
const IRON = {
  beginner: { days: 30, onMiss: 'pause', items: ['1 workout, 30+ min', 'Drink 2L water', 'No alcohol (weekdays)'] },
  athlete:  { days: 60, onMiss: 'reset', items: ['1 workout, 45+ min', 'Drink 3L water', 'Hit protein target', 'No alcohol', 'Read 10 pages'] },
  goggins:  { days: 75, onMiss: 'strict', items: ['Workout #1, 45 min', 'Workout #2, 45 min (indoor or outdoor)', 'Drink 4L water',
              'Strict diet, zero cheats', 'No alcohol', 'Read 10 pages', 'Weekly progress photo done'] },
};

const XP = { checkin: 20, workout: 30, weighin: 10, pb: 75, challengeDay: 40, habitDay: 15, session: 30, photo: 25, slot: 100 };

// Goal kinds. lower = smaller is better (times). Field spec: [name, label, step, optional, type]
const KINDS = {
  time:    { fields: [['time', 'time', 5, false, 'time']], lower: true, unit: '', keyLabel: 'Best time' },
  build:   { fields: [['time', 'finish time', 60, false, 'time']], lower: true, unit: '', keyLabel: 'Finish PB' },
  far:     { fields: [['km', 'km', 0.1]], unit: 'km', keyLabel: 'Furthest' },
  watts:   { fields: [['watts', 'avg W', 5]], unit: 'W', keyLabel: 'Best' },
  rm:      { fields: [['reps', 'reps', 1], ['kg', 'kg', 2.5]], unit: 'kg', keyLabel: 'Est.' },
  reps:    { fields: [['reps', 'reps', 1]], unit: 'reps', keyLabel: 'Best set' },
  hold:    { fields: [['sec', 'sec', 5]], unit: 's', keyLabel: 'Longest hold' },
  race:    { fields: [], lower: true, unit: '', keyLabel: 'Race time' },
  session: { fields: [['min', 'min', 5], ['km', 'km', 0.5, true]], unit: 'min', keyLabel: 'Duration' },
};
const SPORTS = { run: ['🏃', 'Running'], cycle: ['🚴', 'Cycling'], swim: ['🏊', 'Swimming'], row: ['🚣', 'Rowing'], hyrox: ['🟨', 'Hyrox'], strength: ['🏋️', 'Strength'], bodyweight: ['🤸', 'Bodyweight'] };
const sportName = k => SPORTS[k] ? `${SPORTS[k][0]} ${SPORTS[k][1]}` : '💪 Training';
const DEFAULT_SPORTS = ['run', 'cycle', 'swim', 'strength', 'bodyweight'];

// Goal catalog. 'test' goals need a real attempt within 14 days of picking them; 'build' goals (long distances)
// accept any session in that sport as a stepping-stone baseline; the real PB is set when you finish the distance.
// base/target are seeds for Matt (times in seconds); targets are scaled by intensity and editable.
const Tm = (m, s = 0) => m * 60 + s;
const G = (sport, id, name, kind, base, target, extra = {}) => ({ sport, id, name, kind, base, target, type: kind === 'build' ? 'build' : 'test', ...extra });
const GOALS = [
  G('run', 'run_400', '400 m', 'time', 105, 85, { dist: 0.4 }), G('run', 'run_1k', '1 km', 'time', Tm(5), Tm(4), { dist: 1 }),
  G('run', 'run_mile', '1 mile', 'time', Tm(8, 20), Tm(6, 40), { dist: 1.609 }), G('run', 'run_3k', '3 km', 'time', Tm(16), Tm(13), { dist: 3 }),
  G('run', 'run_5k', '5 km', 'time', Tm(28), Tm(23), { dist: 5 }), G('run', 'run_parkrun', 'parkrun 5 km', 'time', Tm(29), Tm(24), { dist: 5 }),
  G('run', 'run_10k', '10 km', 'time', Tm(60), Tm(49), { dist: 10 }), G('run', 'run_15k', '15 km', 'build', Tm(95), Tm(78), { dist: 15 }),
  G('run', 'run_21', 'Half marathon 21.1 km', 'build', Tm(130), Tm(110), { dist: 21.1 }), G('run', 'run_42', 'Marathon 42.2 km', 'build', Tm(290), Tm(240), { dist: 42.2 }),
  G('run', 'run_far30', 'Furthest in 30 min', 'far', 5, 6.5), G('run', 'run_far60', 'Furthest in 60 min', 'far', 9.5, 12),
  G('cycle', 'cyc_ftp', 'FTP (20-min test)', 'watts', 240, 300, { factor: 0.95, note: 'Enter your 20-min average power. FTP = 95% of it.' }),
  G('cycle', 'cyc_5s', '5s peak power', 'watts', 900, 1100), G('cycle', 'cyc_1min', '1-min power', 'watts', 450, 560),
  G('cycle', 'cyc_5min', '5-min power', 'watts', 300, 360), G('cycle', 'cyc_20min', '20-min power', 'watts', 250, 315),
  G('cycle', 'cyc_tt10', '10 km TT', 'time', Tm(17), Tm(15), { dist: 10 }), G('cycle', 'cyc_tt20', '20 km TT', 'time', Tm(36), Tm(31), { dist: 20 }),
  G('cycle', 'cyc_tt40', '40 km TT', 'time', Tm(75), Tm(64), { dist: 40 }), G('cycle', 'cyc_100', '100 km ride', 'build', Tm(210), Tm(180), { dist: 100 }),
  G('swim', 'swim_50', '50 m', 'time', 50, 40, { dist: 0.05 }), G('swim', 'swim_100', '100 m', 'time', 115, 95, { dist: 0.1 }),
  G('swim', 'swim_200', '200 m', 'time', 250, 205, { dist: 0.2 }), G('swim', 'swim_400', '400 m', 'time', Tm(9), Tm(7, 30), { dist: 0.4 }),
  G('swim', 'swim_750', '750 m (sprint tri)', 'time', Tm(18), Tm(15), { dist: 0.75 }), G('swim', 'swim_1500', '1.5 km (Olympic tri)', 'build', Tm(36), Tm(30), { dist: 1.5 }),
  G('swim', 'swim_1900', '1.9 km (70.3)', 'build', Tm(46), Tm(38), { dist: 1.9 }), G('swim', 'swim_3800', '3.8 km (Ironman)', 'build', Tm(95), Tm(78), { dist: 3.8 }),
  G('swim', 'swim_css', 'CSS pace / 100 m', 'time', 125, 105, { note: 'Critical Swim Speed from a 400 m + 200 m test: (T400 − T200) ÷ 2.' }),
  G('row', 'row_500', '500 m erg', 'time', Tm(2), Tm(1, 45), { dist: 0.5 }), G('row', 'row_2k', '2 km erg', 'time', Tm(8, 30), Tm(7, 30), { dist: 2 }),
  G('row', 'row_5k', '5 km erg', 'time', Tm(22), Tm(19, 30), { dist: 5 }), G('row', 'row_10k', '10 km erg', 'build', Tm(46), Tm(41), { dist: 10 }),
  G('bodyweight', 'bw_pushup', 'Max push-ups', 'reps', 25, 50), G('bodyweight', 'bw_pullup', 'Max pull-ups', 'reps', 4, 12),
  G('bodyweight', 'bw_chinup', 'Max chin-ups', 'reps', 5, 12), G('bodyweight', 'bw_dips', 'Max dips', 'reps', 8, 20),
  G('bodyweight', 'bw_plank', 'Plank hold', 'hold', 60, 180), G('bodyweight', 'bw_side', 'Side plank hold', 'hold', 30, 90),
  G('bodyweight', 'bw_wallsit', 'Wall sit hold', 'hold', 60, 150),
];
for (const [k, n, b] of [['squat', 'Back squat', 90], ['deadlift', 'Deadlift', 130], ['trapdl', 'Trap-bar deadlift', 140], ['bench', 'Bench press', 80],
  ['ohp', 'Overhead press', 50], ['row', 'Barbell row', 70], ['legpress', 'Leg press', 160], ['rdl', 'Romanian deadlift', 100], ['hip', 'Hip thrust', 120]])
  for (const r of [1, 5]) { const f = r === 1 ? 1 : 0.86; GOALS.push(G('strength', `str_${k}_${r}`, `${n} ${r}RM`, 'rm', Math.round(b * f / 2.5) * 2.5, Math.round(b * 1.3 * f / 2.5) * 2.5, { n: r })); }
// ---- HYROX ----
// 8 x (1 km run + station). Station goals are timed; weights depend on the division (S.hyrox).
const HX_STATIONS = [['ski', '1 km SkiErg', Tm(4, 45), Tm(4, 0)], ['push', '50 m sled push', Tm(4, 0), Tm(2, 45)], ['pull', '50 m sled pull', Tm(5, 0), Tm(3, 30)], ['bbj', '80 m burpee broad jumps', Tm(5, 30), Tm(4, 0)],
  ['row', '1 km row', Tm(4, 50), Tm(4, 10)], ['farmers', '200 m farmers carry', Tm(2, 10), Tm(1, 40)], ['lunges', '100 m sandbag lunges', Tm(5, 0), Tm(3, 45)], ['wb', '100 wall balls', Tm(7, 0), Tm(5, 0)]];
HX_STATIONS.forEach(([k, n, b, t], i) => GOALS.push(G('hyrox', 'hx_' + k, n, 'time', b, t, { hx: true, station: k, order: i + 1 })));
GOALS.push(G('hyrox', 'hx_run', '1 km compromised run (avg split)', 'time', Tm(5, 45), Tm(4, 45), { hx: true }),
  G('hyrox', 'hx_rox', 'Roxzone total (transitions)', 'time', Tm(8), Tm(5), { hx: true }),
  G('hyrox', 'hx_half', 'Half-sim time', 'time', Tm(50), Tm(42), { hx: true, note: '4 × (1 km run + station), stations 1–4 or 5–8.' }),
  G('hyrox', 'hx_full', 'Hyrox full race', 'build', Tm(105), Tm(85), { hx: true, dist: 16, note: 'Build-up goal: half-sims and station practice count as the baseline. The chart counts race "units" (8 runs + 8 stations = 16). Your PB is set by a full race.' }));
const HX_DIV = { open: 'Open', pro: 'Pro', adaptive: 'Adaptive' };
const HX_CAT = { men: 'Men', women: 'Women', dmen: 'Doubles Men', dwomen: 'Doubles Women', dmixed: 'Doubles Mixed', relay: 'Relay' };
const HX_ADAPT = { llminor: 'Lower Limb Minor', llmajor: 'Lower Limb Major' };
// Official weights (25/26 rulebooks). [push, pull, farmers, lunges, wall balls]. Sleds include the sled.
const HX_W = {
  'open-m': ['152 kg', '103 kg', '2 × 24 kg', '20 kg', '6 kg · 3.0 m'], 'open-w': ['102 kg', '78 kg', '2 × 16 kg', '10 kg', '4 kg · 2.7 m'],
  'pro-m': ['202 kg', '153 kg', '2 × 32 kg', '30 kg', '9 kg · 3.0 m'], 'pro-w': ['152 kg', '103 kg', '2 × 24 kg', '20 kg', '6 kg · 2.7 m'],
  'adaptive-llminor-m': ['152 kg · 4 × 12.5 m', '103 kg · 2 × 12.5 m', 'see adaptive rulebook', 'see adaptive rulebook', '6 kg · 3.0 m'],
  'adaptive-llminor-w': ['102 kg · 4 × 12.5 m', '78 kg · 2 × 12.5 m', 'see adaptive rulebook', 'see adaptive rulebook', '4 kg · 2.7 m'],
  'adaptive-llmajor-m': ['152 kg · 2 × 12.5 m', '78 kg · 2 × 12.5 m', 'see adaptive rulebook', 'see adaptive rulebook', '4 kg · 3.0 m'],
  'adaptive-llmajor-w': ['102 kg · 2 × 12.5 m', '53 kg · 2 × 12.5 m', 'see adaptive rulebook', 'see adaptive rulebook', '2 kg · 2.7 m'],
};
const hxCfg = () => (S.hyrox = { div: 'open', cat: 'men', adapt: 'llminor', ...(S.hyrox || {}) });
function hxWeight(station) {
  const h = hxCfg(), idx = { push: 0, pull: 1, farmers: 2, lunges: 3, wb: 4 }[station]; if (idx == null) return '';
  if (h.cat === 'dmixed') return h.div === 'pro' ? 'Pro Mixed: check event rulebook' : 'Mixed: check event rulebook';
  const g = ['women', 'dwomen'].includes(h.cat) ? 'w' : 'm', key = h.div === 'adaptive' ? `adaptive-${h.adapt}-${g}` : `${h.div}-${g}`;
  return (HX_W[key] || HX_W['open-' + g])[idx];
}
const hxDivLabel = () => { const h = hxCfg(); return h.div === 'adaptive' ? `Adaptive · ${HX_ADAPT[h.adapt]} · ${['women', 'dwomen'].includes(h.cat) ? 'Women' : 'Men'}` : `${HX_DIV[h.div]} · ${HX_CAT[h.cat]}`; };
const DEFAULT_GOALS = ['run_5k', 'run_10k', 'run_21', 'cyc_ftp', 'cyc_5min', 'cyc_100', 'swim_400', 'swim_css', 'swim_1900', 'str_trapdl_1', 'str_bench_5', 'bw_pullup', 'bw_plank'];
const BASELINE_DAYS = 14;

// Habits: core 3 to start (Goggins starts with 5), the rest unlock one slot per strong week.
const HABITS = [
  { id: 'trained', label: 'Trained today', icon: '💪', core: 1 },
  { id: 'sleep7', label: '7h+ sleep', icon: '😴', core: 1 },
  { id: 'noalc', label: 'No alcohol', icon: '🚫', core: 1 },
  { id: 'clean', label: 'Ate clean', icon: '🥗' },
  { id: 'steps', label: '10k steps', icon: '👟' },
  { id: 'water', label: '3L water', icon: '💧' },
  { id: 'protein', label: 'Protein target', icon: '🍗' },
  { id: 'skin', label: 'Stump and liner care', icon: '🦿' },
  { id: 'mobility', label: '10 min mobility', icon: '🧘' },
  { id: 'read', label: 'Read 10 pages', icon: '📖' },
];
const START_SLOTS = { beginner: 3, athlete: 3, goggins: 5 };

// Goal cap: 3 active goals per sport, +1 slot earned when every active goal in the sport has a baseline and 2 weeks have passed.
const GOAL_CAP = 3, SLOT_DAYS = 14;
const capFor = sp => GOAL_CAP + ((S.goalSlots || {})[sp] || 0);
const activeIn = (sp, st = S) => st.goals.filter(g => g.status === 'active' && goalDef(g.id).sport === sp);
const BADGES = {
  first_checkin: ['👣', 'First Step', s => s.log.length >= 1 || Object.keys(s.habits.days).length >= 1],
  streak7:   ['🔥', '7-Day Streak', s => s.bestStreak >= 7],
  streak30:  ['🌋', '30-Day Streak', s => s.bestStreak >= 30],
  kg4:       ['⚖️', 'First 4kg Lost', s => s.metrics.weight.base - s.metrics.weight.current >= 4],
  kg10:      ['🪶', '10kg Down', s => s.metrics.weight.base - s.metrics.weight.current >= 10],
  ftp260:    ['🚴', 'FTP 260W', s => s.metrics.ftp.current >= 260],
  ftp300:    ['🚀', 'FTP 300W', s => s.metrics.ftp.current >= 300],
  wkg3:      ['⚡', '3.0 W/kg', s => wkg(s) >= 3],
  level5:    ['⭐', 'Level 5', s => levelInfo(s.xp).level >= 5],
  level10:   ['🌟', 'Level 10', s => levelInfo(s.xp).level >= 10],
  upgrade:   ['📈', 'Moved Up a Mode', s => s.upgraded],
  baselines: ['🎯', 'Baselines Locked In', s => !s.everParked && s.goals.length >= 3 && s.goals.every(g => g.baselineDate)],
  hx_first:  ['🟨', 'First Hyrox', s => s.sessions.some(x => x.exId === 'hx_race')],
  hx_half:   ['🌓', 'Half-Sim Done', s => s.sessions.some(x => x.exId === 'hx_half')],
  hx_sub90:  ['⏱️', 'Hyrox Sub-90', s => s.sessions.some(x => x.exId === 'hx_race' && x.key < 5400)],
  hx_sub75:  ['🚀', 'Hyrox Sub-75', s => s.sessions.some(x => x.exId === 'hx_race' && x.key < 4500)],
  hx_sweep:  ['🧹', 'Station Sweep (8 PBs in one race)', s => s.sessions.some(x => x.exId === 'hx_race' && x.stationPBs === 8)],
  ...Object.fromEntries(Object.entries(SPORTS).map(([k, [ic, n]]) => ['earned_' + k, ['🔓', `Earned It: ${n}`, s => !(s.goalOverride || {})[k] && ((s.goalSlots || {})[k] || 0) >= 1]])),
  finisher:  ['🏅', 'Distance Finisher', s => s.sessions.some(x => goalDef(x.exId).type === 'build')],
  firstpb:   ['🏆', 'First PB', s => s.pbCount >= 1],
  pb10:      ['🥊', '10 PBs', s => s.pbCount >= 10],
  sessions25:['🗓️', '25 Sessions', s => s.sessions.length >= 25],
  earned:    ['🔓', 'Earned It', s => s.habits.earnedSlots >= 1 && !s.habits.override],
  allhabits: ['🧱', 'Habit Stack (all earned)', s => s.habits.slots >= HABITS.length && !s.habits.override],
  photo1:    ['📸', 'First Photo Day', s => s.photoCount >= 1],
  photo8:    ['🎞️', '8 Photo Weeks', s => s.photoWeeks >= 8],
  iron7:     ['🛡️', 'Iron: Week 1', s => s.challenge.day >= 7],
  ironDone:  ['👑', 'Iron Finisher', s => s.challenge.completed > 0],
  gold:      ['🥇', 'Gold Card', s => overall(s) >= 75],
};

/* ---------- 2) STATE + MIGRATION ---------- */
const dkey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
let todayOverride = null; // used by the demo seeder to replay past weeks
const today = () => todayOverride || dkey(Date.now());
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dkey(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const weekStart = k => { const d = new Date(k + 'T12:00:00'); return addDays(k, -((d.getDay() + 6) % 7)); }; // Monday
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = k => new Date(k + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

const roundFor = (L, v) => L.kind === 'time' || L.kind === 'build' ? Math.round(v) : L.kind === 'rm' ? Math.round(v / 2.5) * 2.5 : +(+v).toFixed(1);
function newGoal(id, persona) {
  const L = goalDef(id), m = PERSONAS[persona || 'athlete'].targetMult;
  return { id, base: L.base, target: roundFor(L, L.base + (L.target - L.base) * m), targetEdited: false, status: 'active', since: today(), baselineDate: null };
}
const seedGoals = persona => DEFAULT_GOALS.map(id => newGoal(id, persona));
function freshState() {
  return { version: 3, onboarded: false, onboardStep: 0, persona: null, depth: 'detailed', name: 'Matt', xp: 0,
    metrics: structuredClone(DEFAULT_METRICS), log: [], streak: 0, bestStreak: 0, lastCheckin: null, badges: [],
    upgraded: false, modeHistory: [],
    challenge: { day: 0, lastDate: null, todays: {}, todaysDate: null, completed: 0, startDate: null },
    sports: [...DEFAULT_SPORTS], goals: seedGoals(), everParked: false, sessions: [], pbCount: 0,
    habits: { active: HABITS.filter(h => h.core).map(h => h.id), slots: 3, earnedSlots: 0, wishlist: [], paused: [],
      days: {}, start: today(), evaluatedTo: null, weakWeeks: 0, override: false, weekLog: [] },
    photoCount: 0, photoWeeks: 0, share: { weight: false, photo: false }, prosthetic: 'left', goalSlots: {}, goalSlotAt: {}, goalWish: {}, goalOverride: {}, capChecked: true }; // Matt: LEFT below-knee prosthetic
}
// Fill any missing fields from a fresh state (v1 data, v2 exercise data, older v3 saves).
function migrate(old) {
  const s = freshState();
  if (!old) return s;
  const out = { ...s, ...old, version: 3 };
  out.metrics = { ...s.metrics, ...(old.metrics || {}) };
  out.challenge = { ...s.challenge, ...(old.challenge || {}) };
  out.habits = { ...s.habits, ...(old.habits || {}) };
  out.share = { ...s.share, ...(old.share || {}) };
  if (!old.version) { // v1 -> v3
    out.onboarded = !!old.persona; out.depth = 'detailed'; out.sessions = [];
    if (old.persona) { out.goals = seedGoals(old.persona); out.habits.slots = START_SLOTS[old.persona]; out.habits.active = HABITS.slice(0, out.habits.slots).map(h => h.id); }
    if (old.persona) out.challenge.day = Math.min(out.challenge.day, IRON[old.persona].days);
  }
  if (old.exercises && !old.goals) migrateExercises(out, old); // v2 exercises -> v3 goals
  delete out.exercises;
  if (!old.capChecked) { // saves from before the cap keep their goals, marked as overridden
    out.capChecked = true; const by = {};
    for (const g of out.goals) { if (g.status !== 'active') continue; const sp = goalDef(g.id).sport; by[sp] = (by[sp] || 0) + 1; if (by[sp] > GOAL_CAP) { g.overridden = true; out.goalOverride = { ...out.goalOverride, [sp]: true }; } }
  }
  return out;
}
// v2 exercise ids -> closest v3 goal (same measure), or a general training session.
const V2_MAP = { bench: 'str_bench_1', trapdl: 'str_trapdl_1', legpress: 'str_legpress_1', ohp: 'str_ohp_1', row_c: 'str_row_1', rdl: 'str_rdl_1', hipthrust: 'str_hip_1',
  pullup: 'bw_pullup', pushup: 'bw_pushup', dips: 'bw_dips', plank: 'bw_plank', sideplank: 'bw_side' };
const V2_SPORT = { ride: 'cycle', z2ride: 'cycle', sweetspot: 'cycle', vo2: 'cycle', ftptest: 'cycle', run: 'run', swim: 'swim', row: 'row', ski: 'row', latpd: 'strength', glutebr: 'bodyweight' };
function migrateExercises(out, old) {
  const sessions = [], firstDate = {};
  for (const x of (old.sessions || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t)) {
    let gid = V2_MAP[x.exId], sets = x.sets;
    const sport = V2_SPORT[x.exId] || (gid ? goalDef(gid).sport : 'strength');
    if (['ftptest', 'sweetspot', 'vo2'].includes(x.exId)) {
      const min = +(x.sets[0] || {}).min || 20;
      gid = x.exId === 'ftptest' || Math.abs(min - 20) <= 2 ? 'cyc_ftp' : Math.abs(min - 5) <= 1 ? 'cyc_5min' : null;
      if (gid) sets = x.sets.map(s => ({ watts: +s.watts }));
    }
    if (!gid && ['run', 'swim', 'row', 'ski'].includes(x.exId)) { // distance + time -> nearest timed goal within 10%
      const s0 = x.sets.reduce((a, b) => (+b.km > +a.km ? b : a), x.sets[0] || {});
      const c = GOALS.filter(g => g.sport === sport && g.dist && g.kind === 'time' && Math.abs(g.dist - s0.km) / g.dist <= 0.1).sort((a, b) => Math.abs(a.dist - s0.km) - Math.abs(b.dist - s0.km))[0];
      if (c && s0.min) { gid = c.id; sets = [{ time: Math.round(s0.min * 60 * c.dist / s0.km) }]; }
    }
    if (gid) { firstDate[gid] ??= x.date; sessions.push(mkSession(gid, x.date, sets, x.t)); }
    else {
      const min = x.sets.reduce((a, s) => a + (+s.min || 0), 0) || 45, km = x.sets.reduce((a, s) => a + (+s.km || 0), 0);
      sessions.push({ id: x.id || uid(), t: x.t || 0, exId: 'session', sport, date: x.date, sets: [km ? { min, km } : { min }], key: null, vol: null, from: x.exId });
    }
  }
  out.sessions = sessions; markPBs(out.sessions);
  const goals = Object.keys(firstDate).map(id => {
    const g = newGoal(id, old.persona), oe = (old.exercises || []).find(e => V2_MAP[e.id] === id);
    const first = sessions.find(x => x.exId === id);
    Object.assign(g, { base: first.key, since: firstDate[id], baselineDate: firstDate[id] });
    if (oe && oe.targetEdited) { g.target = oe.target; g.targetEdited = true; }
    if ((goalDef(id).kind === 'time' ? g.target >= g.base : g.target <= g.base)) g.target = roundFor(goalDef(id), g.base + (goalDef(id).target - goalDef(id).base) * 0.5);
    return g;
  });
  out.goals = goals.length ? goals : seedGoals(old.persona);
  out.sports = [...new Set([...out.goals.map(g => goalDef(g.id).sport), ...sessions.map(x => x.sport)])].filter(k => SPORTS[k]);
  if (!out.sports.length) out.sports = [...DEFAULT_SPORTS];
  const ftpS = sessions.filter(x => x.exId === 'cyc_ftp').map(x => x.key); if (ftpS.length) out.metrics.ftp.current = Math.max(out.metrics.ftp.current, Math.round(Math.max(...ftpS)));
  out._migratedGoals = true;
}
function load() {
  const v2 = localStorage.getItem(STORE_KEY);
  if (v2) return migrate(JSON.parse(v2));
  const v1 = localStorage.getItem(V1_KEY);
  const s = migrate(v1 ? JSON.parse(v1) : null);
  if (v1) s._migratedFromV1 = true; // v1 key is left untouched as a backup
  return s;
}
let S = load();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));

/* ---------- 3) SCORING ---------- */
const clamp01 = x => Math.max(0, Math.min(1, x || 0));
function progress(m) { if (m.target === m.base) return 1; return clamp01((m.current - m.base) / (m.target - m.base)); }
const wkg = s => s.metrics.ftp.current / s.metrics.weight.current;
function wkgProgress(s) {
  const m = s.metrics;
  return progress({ base: m.ftp.base / m.weight.base, target: m.ftp.target / m.weight.target, current: wkg(s) });
}
const activeGoals = s => s.goals.filter(g => g.status === 'active');
function goalProgress(g) {
  const L = goalDef(g.id), b = bestKey(g.id);
  if (L.type === 'build') { // stepping stones: longest distance gets you to 80%, the finish time does the rest
    const far = clamp01(longestIn(L.sport) / L.dist);
    return b == null ? far * 0.8 : 0.8 + 0.2 * progress({ base: g.base, target: g.target, current: b });
  }
  return progress({ base: g.base, target: g.target, current: b ?? g.base });
}
const exProgress = goalProgress;
function groupProgress(s, sports) {
  const list = activeGoals(s).filter(g => sports.includes(goalDef(g.id).sport));
  return list.length ? list.reduce((a, g) => a + goalProgress(g), 0) / list.length : null;
}
function stats(s) {
  const p = k => progress(s.metrics[k]), d = s.depth === 'detailed', g = sp => d ? groupProgress(s, sp) : null;
  const cyc = g(['cycle']), end = g(['run', 'swim', 'row']), str = g(['strength', 'bodyweight']), pwr = (p('ftp') + wkgProgress(s)) / 2;
  return { PWR: cyc == null ? pwr : (pwr + cyc) / 2, END: end ?? cyc ?? clamp01(s.streak / 30), STR: str ?? 0, BOD: p('weight'), CON: clamp01(s.streak / 30) };
}
// Overall = weight, W/kg, consistency and the average progress of your ACTIVE goals (parked goals are left out).
function overall(s) {
  let sum = progress(s.metrics.weight) * 2 + wkgProgress(s) * 2 + clamp01(s.streak / 30), w = 5;
  const ag = s.depth === 'detailed' ? activeGoals(s) : [];
  if (ag.length) { sum += ag.reduce((a, g) => a + goalProgress(g), 0) / ag.length * 5; w += 5; }
  else { sum += progress(s.metrics.ftp) * 2; w += 2; }
  return Math.round(40 + 59 * (sum / w));
}
const statRating = v => Math.round(40 + 59 * v);
const tier = r => r >= 88 ? 'elite' : r >= 75 ? 'gold' : r >= 60 ? 'silver' : 'bronze';
function levelInfo(xp) {
  let L = 0; while (50 * (L + 1) * (L + 2) <= xp) L++;
  const lo = 50 * L * (L + 1), hi = 50 * (L + 1) * (L + 2);
  return { level: L + 1, pct: Math.round((xp - lo) / (hi - lo) * 100), toNext: hi - xp };
}

/* ---------- 4) GAME RULES ---------- */
function addXP(base, why, quiet) {
  const gained = Math.round(base * PERSONAS[S.persona || 'athlete'].xpMult);
  const before = levelInfo(S.xp).level;
  S.xp += gained;
  const after = levelInfo(S.xp).level;
  if (after > before) celebrate();
  if (!quiet) toast(after > before ? `LEVEL UP! Level ${after} 🎉` : `+${gained} XP · ${why}`);
  return gained;
}
function applyMissedDays() {
  if (!S.persona) return;
  const P = PERSONAS[S.persona];
  if (S.lastCheckin) {
    const missed = daysBetween(S.lastCheckin, today()) - 1;
    if (missed > 0 && !S._penalised?.[today()]) {
      if (P.streakBreaks && S.streak > 0) S.slumpDate = today();
      if (P.streakBreaks) S.streak = 0;
      if (P.missPenalty) S.xp = Math.max(0, S.xp - P.missPenalty * missed);
      S._penalised = { [today()]: true };
      if (P.streakBreaks) toast(`Missed ${missed} day(s), streak reset${P.missPenalty ? `, −${P.missPenalty * missed} XP` : ''}`);
    }
  }
  const c = S.challenge, rule = IRON[S.persona].onMiss;
  if (c.lastDate && c.day > 0 && daysBetween(c.lastDate, today()) > 1 && rule !== 'pause') {
    c.day = 0; c.startDate = null; toast('Iron 75 reset: a day was missed. Back to Day 1.');
  }
  if (c.todaysDate !== today()) { c.todays = {}; c.todaysDate = today(); }
  evaluateHabitWeeks();
  save();
}
// Shared "showed up today" streak, used by both check-in and habit ticks.
function markActiveDay() {
  if (S.lastCheckin === today()) return false;
  S.streak = (S.lastCheckin && daysBetween(S.lastCheckin, today()) === 1) || !PERSONAS[S.persona].streakBreaks ? S.streak + 1 : 1;
  S.bestStreak = Math.max(S.bestStreak, S.streak); S.lastCheckin = today();
  return true;
}
function checkBadges() {
  for (const [id, [icon, title, test]] of Object.entries(BADGES)) {
    if (!S.badges.includes(id) && test(S)) { S.badges.push(id); S.lastUnlock = `${icon} ${title}`; if (R.tab !== 'log') setTimeout(() => toast(`${icon} Badge unlocked: ${title}`), 1400); }
  }
  const kit = syncKit(); if (kit.length) { S.newKit = [...(S.newKit || []), ...kit]; if (R.tab !== 'log') setTimeout(() => toast(kit.length > 2 ? `🎁 ${kit.length} avatar kit items unlocked · Settings → Avatar` : `🎁 Avatar kit unlocked: ${kit.join(', ')}`), 2200); }
}
function setPersona(p) {
  const prev = S.persona;
  if (prev && PERSONAS[p].rank > PERSONAS[prev].rank) S.upgraded = true;
  S.persona = p; S.modeHistory.push({ date: today(), persona: p });
  if (prev && prev !== p) S.challenge.day = Math.min(S.challenge.day, IRON[p].days);
  // Goggins starts with 5 habit slots
  if (S.habits.slots < START_SLOTS[p]) { S.habits.slots = START_SLOTS[p]; fillSlots(); }
  checkBadges(); save();
}

/* ---------- 5) GOALS, SESSIONS, BASELINES ---------- */
function goalDef(id) {
  return GOALS.find(g => g.id === id) || (id === 'hx_race' ? { id, name: 'Hyrox race', kind: 'race', sport: 'hyrox', type: 'race', hx: true } : id === 'session' ? { id, name: 'Training session', kind: 'session', sport: 'other', type: 'session' }
    : { id, name: id, kind: 'reps', sport: 'bodyweight', type: 'test', base: 0, target: 1 });
}
const lib = goalDef;
function e1rm(reps, kg) { return reps <= 1 ? kg : kg * (1 + reps / 30); }
function keyOf(L, sets) {
  if (L.kind === 'race') return sets[0]?.total ?? null;
  const k = L.kind, v = sets.map(st => k === 'rm' ? e1rm(+st.reps, +st.kg) / (L.n === 5 ? 1 + 5 / 30 : 1) : k === 'reps' ? +st.reps : k === 'hold' ? +st.sec
    : k === 'watts' ? +st.watts * (L.factor || 1) : k === 'far' ? +st.km : k === 'session' ? +st.min : +st.time).filter(Number.isFinite);
  if (!v.length) return null;
  return Math.round((KINDS[k].lower ? Math.min(...v) : Math.max(...v)) * 10) / 10;
}
function volumeOf(L, sets) { return L.kind === 'rm' ? sets.reduce((a, s) => a + s.reps * s.kg, 0) : L.kind === 'reps' ? sets.reduce((a, s) => a + +s.reps, 0) : null; }
function isBetter(L, a, b) { return KINDS[L.kind].lower ? a < b : a > b; }
function mkSession(id, date, sets, t) { const L = goalDef(id); return { id: uid(), t: t ?? Date.now(), exId: id, sport: L.sport, date, sets, key: keyOf(L, sets), vol: volumeOf(L, sets) }; }
function markPBs(list) { const best = {}; for (const x of list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t)) { if (x.exId === 'session') continue; const L = goalDef(x.exId); x.pb = best[x.exId] != null && isBetter(L, x.key, best[x.exId]); if (best[x.exId] == null || isBetter(L, x.key, best[x.exId])) best[x.exId] = x.key; } }
const sessionsFor = id => S.sessions.filter(x => x.exId === id).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
function bestKey(id) { if (id === 'session') return null; const ks = sessionsFor(id).map(x => x.key).filter(k => k != null); if (!ks.length) return null; return KINDS[goalDef(id).kind].lower ? Math.min(...ks) : Math.max(...ks); }
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('en-US');
function fmtTime(sec) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
// "25:30" -> 1530 s, "1:02:03" -> 3723 s, a bare number is minutes ("25" -> 1500 s)
// digits-only entries of 3+ digits are read as [h]mmss (2840 → 28:40); 1–2 digits stay minutes
const TIN = 'type="text" inputmode="numeric" pattern="[0-9:]*" autocomplete="off" enterkeyhint="done" oninput="tmask(this)" onfocus="this.select()"';
window.tmask = el => { const d = el.value.replace(/\D/g, '').slice(0, 6); if (d.length < 3) { if (/^\d*$/.test(el.value)) return; el.value = d; return; }
  el.value = d.length <= 4 ? `${+d.slice(0, -2)}:${d.slice(-2)}` : `${+d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`; };
function parseTime(v) { v = String(v).trim(); if (!v) return NaN; if (/^\d{3,6}$/.test(v)) v = v.length <= 4 ? `${v.slice(0, -2)}:${v.slice(-2)}` : `${v.slice(0, -4)}:${v.slice(-4, -2)}:${v.slice(-2)}`; if (!v.includes(':')) return Math.round(parseFloat(v) * 60); return v.split(':').reduce((a, p) => a * 60 + (parseFloat(p) || 0), 0); }
const isTimeKind = L => L.kind === 'time' || L.kind === 'build' || L.kind === 'race';
const fmtVal = (L, v) => v == null ? '–' : isTimeKind(L) ? fmtTime(v) : `${fmtNum(v)} ${KINDS[L.kind].unit}`.trim();
function sessionKm(x) { if (x.exId === 'session') return +(x.sets[0] || {}).km || 0; if (x.sport === 'hyrox') return x.exId === 'hx_race' || x.exId === 'hx_full' ? 16 : x.exId === 'hx_half' ? 8 : 1; const L = goalDef(x.exId); return L.dist || (L.kind === 'far' ? x.key : 0); }
const longestIn = sport => Math.max(0, ...S.sessions.filter(x => x.sport === sport).map(sessionKm));
function compare(prev, cur, L) {
  if (L.kind === 'session') return [{ txt: `${cur.sets[0].min} min${cur.sets[0].km ? ` · ${cur.sets[0].km} km` : ''} logged`, cls: 'neu' }];
  if (!prev) return [{ txt: 'Baseline set 🎯', cls: 'up' }];
  const d = cur.key - prev.key, good = isBetter(L, cur.key, prev.key), out = [];
  out.push({ txt: `${isTimeKind(L) ? (d <= 0 ? '−' : '+') + fmtTime(Math.abs(d)) : (d >= 0 ? '+' : '') + fmtNum(d) + ' ' + KINDS[L.kind].unit} vs last`, cls: d === 0 ? 'neu' : good ? 'up' : 'down' });
  if (cur.vol && prev.vol) { const dv = (cur.vol - prev.vol) / prev.vol * 100; out.push({ txt: `Volume ${dv >= 0 ? '+' : ''}${Math.round(dv)}%`, cls: dv > 0 ? 'up' : dv < 0 ? 'down' : 'neu' }); }
  if (cur.pb) out.push({ txt: 'New PB!', cls: 'up' });
  return out;
}
// Baselines: a goal needs a baseline within 14 days of being picked or it is parked (kept, dimmed, out of the rating).
function hasBaseline(g) {
  const L = goalDef(g.id);
  return S.sessions.filter(x => x.date >= g.since && (L.type === 'build' ? x.sport === L.sport : x.exId === g.id)).map(x => x.date).sort()[0] || null;
}
const daysLeft = g => BASELINE_DAYS - daysBetween(g.since, today());
function updateBaselines() {
  for (const g of S.goals) {
    if (g.status !== 'active' || g.baselineDate) continue;
    const d = hasBaseline(g);
    if (d) { g.baselineDate = d; continue; }
    if (daysLeft(g) <= 0) { g.status = 'parked'; g.parkedOn = today(); S.everParked = true; toast(`⏸️ ${goalDef(g.id).name} parked: no baseline in ${BASELINE_DAYS} days`); }
  }
  checkGoalSlots();
}
function nextSuggestion(sp) {
  const have = new Set(S.goals.map(g => g.id)), w = ((S.goalWish || {})[sp] || []).filter(id => !have.has(id));
  return w[0] || (GOALS.find(L => L.sport === sp && !have.has(L.id)) || {}).id || null;
}
function checkGoalSlots() {
  S.goalSlots ||= {}; S.goalSlotAt ||= {};
  for (const sp of S.sports) {
    const act = activeIn(sp); if (!act.length || act.length < capFor(sp) || act.some(g => !g.baselineDate)) continue;
    const from = [S.goalSlotAt[sp], ...act.map(g => g.since)].filter(Boolean).sort().at(-1);
    if (daysBetween(from, today()) < SLOT_DAYS) continue;
    S.goalSlots[sp] = (S.goalSlots[sp] || 0) + 1; S.goalSlotAt[sp] = today();
    const nx = nextSuggestion(sp);
    toast(`🔓 New ${SPORTS[sp][1]} goal slot (${capFor(sp)})!${nx ? ` Next up: ${goalDef(nx).name}` : ''}`, true);
  }
}
const pendingBaselines = () => S.goals.filter(g => g.status === 'active' && !g.baselineDate).sort((a, b) => daysLeft(a) - daysLeft(b));
const baselineText = g => { const L = goalDef(g.id), d = daysLeft(g); return `${L.type === 'build' ? `Log any ${SPORTS[L.sport][1].toLowerCase()} session for your ${L.name} build-up` : `Set your ${L.name} baseline`} – ${d} day${d === 1 ? '' : 's'} left`; };

/* ---------- 6) HABITS (earn-your-habits) ---------- */
const habit = id => HABITS.find(h => h.id === id) || { id, label: (S.habits.wishlist.find(w => w.id === id) || {}).label || id, icon: '✨' };
function fillSlots() { // activate catalog habits in order until slots are full (used for start + override)
  const H = S.habits;
  for (const h of HABITS) { if (H.active.length >= H.slots) break; if (!H.active.includes(h.id) && !H.paused.includes(h.id)) H.active.push(h.id); }
}
const dayHit = rec => rec && rec.n > 0 && rec.done.length >= rec.n;
function evaluateHabitWeeks() {
  const H = S.habits; let ws = H.evaluatedTo ? addDays(H.evaluatedTo, 1) : weekStart(H.start);
  const thisWeek = weekStart(today());
  while (ws < thisWeek) {
    // A week only counts once you'd started; partial first weeks need 6 of the days available
    let hits = 0, avail = 0;
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d < H.start) continue; avail++; if (dayHit(H.days[d])) hits++; }
    const need = Math.min(6, Math.max(1, avail - 1));
    const strong = avail > 0 && hits >= need;
    H.weekLog.push({ week: ws, hits, avail, strong });
    if (strong) {
      H.weakWeeks = 0;
      if (H.paused.length) { H.active.push(H.paused.pop()); H.pausedNote = null; toast('Strong week: paused habit restored'); }
      else if (H.slots < HABITS.length + H.wishlist.length) { H.slots++; H.earnedSlots++; addXP(XP.slot, 'habit slot unlocked', true); H.pendingSlot = true; S.lastUnlock = '🔓 New habit slot'; }
    } else {
      H.weakWeeks++;
      if (H.weakWeeks >= 2 && H.active.length > 1) { const p = H.active.pop(); H.paused.push(p); H.weakWeeks = 0; H.pausedNote = `${habit(p).label} paused after two weak weeks. One strong week brings it back.`; }
    }
    H.evaluatedTo = addDays(ws, 6); ws = addDays(ws, 7);
  }
}
function weekProgress() {
  const H = S.habits, ws = weekStart(today()); let hits = 0;
  const days = [...Array(7)].map((_, i) => { const d = addDays(ws, i), h = dayHit(H.days[d]); if (h) hits++; return { d, h, rec: H.days[d], future: d > today() }; });
  return { days, hits };
}

/* ---------- 7) PHOTOS (IndexedDB, on-device only) ---------- */
const POSES = ['front', 'side', 'back'];
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('fitquest-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('photos', mode); const q = fn(t.objectStore('photos')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); },
  put(rec) { return this.tx('readwrite', st => st.put(rec)); },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
  all() { return this.tx('readonly', st => st.getAll()); },
};
let PHOTOS = [], URLS = {};
async function loadPhotos() {
  try { PHOTOS = (await idb.all()).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t); } catch (e) { PHOTOS = []; }
  for (const p of PHOTOS) if (!URLS[p.id]) URLS[p.id] = URL.createObjectURL(p.blob);
  S.photoCount = PHOTOS.length; S.photoWeeks = new Set(PHOTOS.map(p => weekStart(p.date))).size;
}
const photosOf = pose => PHOTOS.filter(p => p.pose === pose);
async function savePhoto(blob, pose) {
  const rec = { id: uid(), t: Date.now(), date: today(), pose, blob, weight: S.metrics.weight.current, level: levelInfo(S.xp).level, ovr: overall(S) };
  await idb.put(rec);
  const firstThisWeek = !PHOTOS.some(p => weekStart(p.date) === weekStart(today()));
  await loadPhotos();
  if (firstThisWeek) addXP(XP.photo, 'photo day');
  checkBadges(); save();
}
async function downscale(file, max = 1400) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
}

/* ---------- 8) CHARTS (hand-rolled SVG, no library, works offline) ---------- */
// pts: [{d:'YYYY-MM-DD', y:Number, pb?:bool, bar?:Number}]
function lineChart(pts, o = {}) {
  const W = 340, H = o.h || 190, L = 36, R = 10, T = 14, B = 24, col = o.color || '#ff5a1f', gid = 'g' + uid();
  if (!pts.length) return `<div class="empty">No data yet. Log a session to start the chart.</div>`;
  const ys = pts.map(p => p.y).concat(o.target != null ? [o.target] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys); if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts.at(-1).d).getTime(), span = Math.max(1, t1 - t0);
  const X = p => pts.length === 1 ? (L + W - R) / 2 : L + (new Date(p.d).getTime() - t0) / span * (W - L - R);
  const Y = v => T + (o.invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (H - T - B), fv = o.fmt || fmtNum, fa = o.fmt || fmtAx;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${X(pts.at(-1)).toFixed(1)},${H - B}L${X(pts[0]).toFixed(1)},${H - B}Z`;
  const grid = [0, 1, 2, 3].map(i => { const v = lo + (hi - lo) * (i + 0.5) / 4; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3}" class="ax" text-anchor="end">${fa(v)}</text>`; }).join('');
  const xl = [pts[0], pts[Math.floor(pts.length / 2)], pts.at(-1)].filter((p, i, a) => a.indexOf(p) === i)
    .map(p => `<text x="${X(p)}" y="${H - 6}" class="ax" text-anchor="middle">${fmtDate(p.d)}</text>`).join('');
  const bmax = Math.max(0, ...pts.map(p => p.bar || 0));
  const bars = bmax ? pts.map(p => { const h = (p.bar / bmax) * (H - T - B) * 0.35; return `<rect x="${X(p) - 3}" y="${H - B - h}" width="6" height="${h}" rx="2" class="vb"/>`; }).join('') : '';
  const tgt = o.target != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}" class="tg"/><text x="${W - R}" y="${Y(o.target) - 4}" class="tgl" text-anchor="end">TARGET ${fa(o.target)}</text>` : '';
  const dots = pts.map((p, i) => `<circle cx="${X(p)}" cy="${Y(p.y)}" r="${p.pb ? 5.5 : i === pts.length - 1 ? 5 : 3}" class="${p.pb ? 'pbd' : 'dt'}" style="--c:${col}"
    data-tip="${fmtDate(p.d)} · ${fv(p.y)}${o.unit ? ' ' + o.unit : ''}${p.pb ? ' · PB' : ''}${p.bar ? ` · vol ${fmtNum(p.bar)}` : ''}"/>`).join('');
  const last = pts.at(-1);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${o.label || 'history chart'}">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${bars}${tgt}<path d="${area}" fill="url(#${gid})"/><path d="${path}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    <text x="${Math.min(X(last), W - R - 2)}" y="${Y(last.y) - 9}" class="lv" text-anchor="end">${fv(last.y)}</text></svg><div class="tip"></div></div>`;
}
const fmtAx = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? Math.round(v) : (Math.round(v * 10) / 10);
document.addEventListener('click', e => {
  const c = e.target.closest('[data-tip]'); if (!c) return;
  const tip = c.closest('.chart').querySelector('.tip'), r = c.getBoundingClientRect(), pr = c.closest('.chart').getBoundingClientRect();
  tip.textContent = c.dataset.tip; tip.style.left = Math.max(4, Math.min(pr.width - 150, r.left - pr.left - 60)) + 'px'; tip.style.top = (r.top - pr.top - 34) + 'px'; tip.classList.add('show');
  clearTimeout(tip._h); tip._h = setTimeout(() => tip.classList.remove('show'), 2200);
});
const sinceRange = r => r === '4w' ? addDays(today(), -28) : r === '3m' ? addDays(today(), -91) : '0000';
function exSeries(id, range) {
  const L = goalDef(id);
  if (L.type === 'build') { // longest distance in this sport so far, building toward the full distance
    let best = 0;
    return S.sessions.filter(x => x.sport === L.sport).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t)
      .map(x => { best = Math.max(best, sessionKm(x)); return { d: x.date, y: +best.toFixed(2), pb: x.exId === id }; }).filter(p => p.d >= sinceRange(range));
  }
  return sessionsFor(id).map(x => ({ d: x.date, y: x.key, pb: !!x.pb, bar: x.vol || 0 })).filter(p => p.d >= sinceRange(range));
}
// ---------- bar charts: one bar per attempt (or best per week/month), taller = better ----------
const weekKey = d => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
function aggregate(pts, agg, invert) {
  if (agg === 'each') return pts.slice(-12);
  const by = new Map(); for (const p of pts) { const k = agg === 'week' ? weekKey(p.d) : p.d.slice(0, 7) + '-01'; const c = by.get(k); if (!c || (invert ? p.y < c.y : p.y > c.y)) by.set(k, { ...p, d: k, pb: (c && c.pb) || p.pb, n: (c?.n || 0) + 1 }); else c.n++; }
  return [...by.values()].slice(-12);
}
// normalise so "better" is always taller; times invert
function barScale(vals, target, invert) {
  const all = target != null ? [...vals, target] : vals, lo = Math.min(...all), hi = Math.max(...all), span = (hi - lo) || Math.abs(hi) * 0.2 || 1;
  return invert ? v => clamp01((hi + span * 0.35 - v) / (hi + span * 0.35 - lo)) : v => clamp01((v - (lo - span * 0.35)) / (hi - (lo - span * 0.35)));
}
let barSeq = 0;
function barChart(all, o = {}) {
  const agg = R.agg || 'each', pts = aggregate(all, agg, o.invert), cid = 'bc' + (++barSeq);
  const seg = all.length > 12 || agg !== 'each' ? `<div class="range aggs">${[['each', 'Last 12'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button class="${agg === k ? 'on' : ''}" onclick="R.agg='${k}';render()">${l}</button>`).join('')}</div>` : '';
  if (!pts.length) return `${seg}<div class="empty">No attempts yet. Log one and your first bar appears here.</div>`;
  const fmt = o.fmt || (v => `${fmtNum(v)}${o.unit ? ' ' + o.unit : ''}`), sc = barScale(pts.map(p => p.y), o.target, o.invert);
  const W = 320, H = 150, top = 14, base = 128, n = pts.length, slot = W / Math.max(n, 6), bw = Math.min(30, slot * 0.66);
  let best = null;
  const bars = pts.map((p, i) => { const h = Math.max(4, sc(p.y) * (base - top)), x = i * slot + (slot - bw) / 2, y = base - h;
    const isBest = best == null || (o.invert ? p.y < best : p.y > best); if (isBest) best = p.y;
    const tip = `${fmtDate(p.d)}${agg !== 'each' ? (agg === 'week' ? ' (week)' : ' (month)') : ''} · ${fmt(p.y)}${p.pb ? ' · PB 🏆' : ''}`;
    return `<g class="bar ${p.pb ? 'pb' : ''}" style="--i:${i}" onclick="document.getElementById('${cid}-tip').textContent='${tip.replace(/'/g, "\\'")}';this.parentNode.querySelectorAll('.bar').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/><rect class="hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${base}"/>
      ${n <= 8 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="bv">${fmt(p.y)}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="${base + 13}" text-anchor="middle" class="bd">${agg === 'month' ? new Date(p.d + 'T12:00').toLocaleDateString('en-GB', { month: 'short' }) : fmtDate(p.d).replace(/ \d{4}$/, '')}</text></g>`; }).join('');
  const ty = o.target != null ? base - sc(o.target) * (base - top) : null;
  const tl = ty != null ? `<line x1="0" x2="${W}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" class="tline"/><text x="${W - 2}" y="${(ty - 4).toFixed(1)}" text-anchor="end" class="tlbl">Target ${fmt(o.target)}</text>` : '';
  const last = pts.at(-1);
  return `${seg}<svg viewBox="0 0 ${W} ${H}" class="bars ${o.invert ? 'inv' : ''}"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="bgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a3d"/><stop offset="1" stop-color="#c2410c"/></linearGradient><linearGradient id="ggrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#e0a000"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="axis"/>${bars}${tl}</svg>
    <p class="bartip" id="${cid}-tip">${fmtDate(last.d)} · ${fmt(last.y)}${last.pb ? ' · PB 🏆' : ''} <span class="muted">· tap a bar</span></p>`;
}
// mini bars for Home rows (last 10 values)
function miniBars(vals, invert, pbs = []) {
  if (vals.length < 1) return '<svg class="spark" viewBox="0 0 60 20"></svg>';
  const v = vals.slice(-10), sc = barScale(v, null, invert), w = 60 / Math.max(v.length, 5);
  return `<svg class="spark mbars" viewBox="0 0 60 20">${v.map((x, i) => { const h = Math.max(2, sc(x) * 18); return `<rect x="${(i * w + w * 0.15).toFixed(1)}" y="${(20 - h).toFixed(1)}" width="${(w * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1" class="${pbs[vals.length - v.length + i] ? 'pb' : ''}"/>`; }).join('')}</svg>`;
}
function sparkline(id) {
  const L = goalDef(id), pts = exSeries(id, 'all'); if (!pts.length) return '';
  return miniBars(pts.map(x => x.y), KINDS[L.kind].lower && L.type !== 'build', pts.map(x => x.pb));
}

/* ---------- 9) SHARE CARDS (canvas -> PNG) ---------- */
const ACC = '#ff5a1f';
async function drawShare(fmt, theme, opt) {
  const W = 1080, H = fmt === 'story' ? 1920 : 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sticker = theme === 'sticker', light = theme === 'light';
  try { await Promise.all(['900 100px "Barlow Condensed"', '600 40px "Barlow Condensed"', '600 30px Inter'].map(f => document.fonts.load(f))); } catch (e) {}
  const F = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  const fg = light ? '#11131a' : '#ffffff', sub = light ? '#5b6275' : sticker ? 'rgba(255,255,255,.85)' : '#9aa3b8';
  if (!sticker) {
    if (opt.photo && opt.photoUrl) {
      const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = opt.photoUrl; });
      if (img) { const k = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,.8)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    } else {
      const gr = g.createLinearGradient(0, 0, W, H);
      if (light) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#eef0f5'); } else { gr.addColorStop(0, '#1a1f30'); gr.addColorStop(1, '#07080d'); }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = ACC; g.globalAlpha = light ? .08 : .14; g.beginPath(); g.arc(W * 0.85, H * 0.12, W * 0.45, 0, 7); g.fill(); g.globalAlpha = 1;
    }
  }
  const photoBg = !sticker && opt.photo && opt.photoUrl, txt = photoBg ? '#fff' : fg, sub2 = photoBg ? 'rgba(255,255,255,.85)' : sub;
  const shadow = on => { if (on && (sticker || photoBg)) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 18; g.shadowOffsetY = 3; } else { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; } };
  shadow(true); g.textBaseline = 'alphabetic';
  const r = overall(S), li = levelInfo(S.xp), P = PERSONAS[S.persona];
  const story = fmt === 'story', top = story ? 170 : 110, cx = W / 2;
  const avImg = await avatarImage(opt.mood || 'idle');
  g.textAlign = 'center';
  g.font = F(800, 54); const w1 = g.measureText('FIT').width, w2 = g.measureText('QUEST').width; g.textAlign = 'left';
  g.fillStyle = txt; g.fillText('FIT', cx - (w1 + w2) / 2, top); g.fillStyle = ACC; g.fillText('QUEST', cx - (w1 + w2) / 2 + w1, top); g.textAlign = 'center';
  g.fillStyle = sub2; g.font = F(600, 36); g.fillText(`${tier(r).toUpperCase()} CARD · ${P.name.toUpperCase()} MODE`, cx, top + 60);
  if (avImg) { shadow(true); if (story) g.drawImage(avImg, cx - 170, top + 90, 340, 476); else g.drawImage(avImg, W - 290, 130, 240, 336); }
  g.fillStyle = txt; g.font = F(900, story ? 360 : 300); g.fillText(r, story ? cx : cx - 90, top + (story ? 870 : 330));
  g.fillStyle = ACC; g.font = F(800, 52); g.fillText('OVERALL RATING', story ? cx : cx - 90, top + (story ? 940 : 395));
  const items = [[li.level, 'LEVEL'], [S.streak, 'DAY STREAK'], [`${S.challenge.day}/${IRON[S.persona].days}`, 'IRON DAYS']];
  if (opt.weight) items.push([S.metrics.weight.current, 'KG']);
  items.push([wkg(S).toFixed(2), 'W/KG']);
  const rowY = top + (story ? 1110 : 560), colW = W / Math.min(items.length, story ? 3 : 5);
  items.forEach(([v, l], i) => {
    const per = story ? 3 : 5, row = Math.floor(i / per), inRow = Math.min(per, items.length - row * per), x = W / 2 + ((i % per) - (inRow - 1) / 2) * colW;
    const y = rowY + row * 230;
    g.fillStyle = txt; g.font = F(900, 120); g.fillText(v, x, y); g.fillStyle = sub2; g.font = F(600, 34); g.fillText(l, x, y + 50);
  });
  const unlock = S.lastUnlock || (S.badges.length ? BADGES[S.badges.at(-1)][0] + ' ' + BADGES[S.badges.at(-1)][1] : null);
  if (unlock) {
    const y = story ? H - 250 : H - 150; shadow(false);
    if (!sticker) { g.fillStyle = photoBg ? 'rgba(0,0,0,.45)' : light ? '#11131a' : 'rgba(255,255,255,.08)'; roundRect(g, cx - 380, y - 70, 760, 110, 55); g.fill(); }
    shadow(true); g.fillStyle = sticker ? '#fff' : light ? '#fff' : '#fff'; g.font = F(800, 50); g.fillText(`NEW: ${unlock.toUpperCase()}`, cx, y + 4);
  }
  g.fillStyle = sub2; g.font = F(600, 32); g.fillText(`${S.name.toUpperCase()} · ${fmtDate(today()).toUpperCase()}`, cx, H - (story ? 160 : 50));
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- 9b) AVATAR (bobblehead caricature, inline SVG + CSS animation) ---------- */
const AV_STAGES = [ // soft round build -> lean muscular athlete. Rating thresholds below.
  { min: 0,  name: 'Couch Starter',  torso: 1.32, belly: 1.12, sh: 0.6,  bi: 0.55, abs: 0,    cheek: 1.09, leg: 1.18 },
  { min: 55, name: 'Getting Going',  torso: 1.18, belly: 0.78, sh: 0.76, bi: 0.72, abs: 0,    cheek: 1.05, leg: 1.09 },
  { min: 62, name: 'Solid',          torso: 1.03, belly: 0.45, sh: 0.9,  bi: 0.9,  abs: 0.25, cheek: 1.0,  leg: 1.0 },
  { min: 70, name: 'Athlete',        torso: 0.96, belly: 0.18, sh: 1.05, bi: 1.08, abs: 0.6,  cheek: 0.97, leg: 0.97 },
  { min: 80, name: 'Elite Machine',  torso: 0.92, belly: 0,    sh: 1.32, bi: 1.38, abs: 0.95, cheek: 0.95, leg: 0.95 },
];
const avStage = r => AV_STAGES.reduce((a, s, i) => r >= s.min ? i : a, 0);
const SKINS = ['#f7d7bd', '#efc19c', '#d9a074', '#b07a52', '#7d5236', '#55372a'];
const HAIRS = { short: 'Short', buzz: 'Buzz cut', curly: 'Curly', swept: 'Swept back', bald: 'Bald' };
const HAIR_COLS = ['#2b1d14', '#5a3a22', '#8a5a2b', '#c99a4a', '#9a9a9a', '#b8381e'];
const BEARDS = { none: 'Clean', stubble: 'Stubble', short: 'Short beard', full: 'Full beard', goatee: 'Goatee' };
// Kit: [label, icon, unlock text, test(state)]
const KIT = {
  headband: ['Headband', '🎽', 'Reach level 2', s => levelInfo(s.xp).level >= 2],
  shades:   ['Race shades', '🕶️', 'Set your first PB', s => s.badges.includes('firstpb')],
  wrist:    ['Sweatbands', '💪', '7-day streak', s => s.badges.includes('streak7')],
  trisuit:  ['Tri suit', '🩱', 'Reach level 5', s => levelInfo(s.xp).level >= 5],
  helmet:   ['Cycling helmet', '⛑️', 'FTP 260W or level 7', s => s.badges.includes('ftp260') || levelInfo(s.xp).level >= 7],
  bike:     ['Tri bike', '🚲', 'Reach level 8', s => levelInfo(s.xp).level >= 8],
  medal:    ['Finisher medal', '🏅', 'Finish Iron or a build-up distance, or lock in all baselines', s => ['ironDone', 'finisher', 'baselines'].some(b => s.badges.includes(b))],
  hxvest:   ['Hyrox race vest', '🟨', 'Log your first Hyrox race', s => s.badges.includes('hx_first')],
  hoodie:   ['Goggins hoodie', '💀', 'Goggins mode + 7-day streak', s => s.persona === 'goggins' && s.badges.includes('streak7')],
  blade:    ['Carbon running blade', '🦿', 'Reach level 12', s => levelInfo(s.xp).level >= 12],
};
const avDefaults = () => ({ skin: SKINS[1], hair: 'short', hairCol: HAIR_COLS[1], beard: 'stubble', kit: {}, seen: [] });
function avatarState() { S.avatar = { ...avDefaults(), ...(S.avatar || {}) }; return S.avatar; }
// Newly unlocked kit is equipped automatically once (the user can take it off in Settings)
function syncKit() {
  const A = avatarState(), fresh = [];
  for (const [k, [n, , , t]] of Object.entries(KIT)) if (t(S) && !A.seen.includes(k)) { A.seen.push(k); A.kit[k] = true; if (k === 'helmet') A.kit.headband = false; fresh.push(n); }
  if (fresh.length) S.lastUnlock = `${KIT[Object.keys(KIT).find(k => KIT[k][0] === fresh.at(-1))][1]} ${fresh.at(-1)}`;
  return fresh;
}
const kitOn = k => KIT[k][3](S) && avatarState().kit[k];
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
// o: { stage, from (stage to animate from), mood: idle|celebrate|slump, size, static (no anim), kit override }
function avatarSVG(o = {}) {
  const A = avatarState(), st = AV_STAGES[o.stage ?? avStage(overall(S))], fr = AV_STAGES[o.from ?? o.stage ?? avStage(overall(S))];
  const kit = o.kit || Object.fromEntries(Object.keys(KIT).map(k => [k, kitOn(k)]));
  const skin = A.skin, skinD = shade(skin, 0.86), hair = A.hairCol, side = S.prosthetic || 'left';
  const shirt = kit.hoodie ? '#474c59' : kit.trisuit ? '#1f2c5e' : '#ff5a1f', shirtD = shade(shirt, 0.82), shorts = kit.trisuit ? '#1f2c5e' : '#232838';
  // animated parts: style = "from" values, data-to = target values (render() swaps them so stage changes ease)
  const T = (id, f, t, origin) => `style="transform-origin:${origin};transform:${f}" data-to="${t}" data-av="${id}"`;
  const torsoT = s => `scaleX(${s.torso})`, bellyT = s => `scale(${s.belly})`, shT = s => `scale(${s.sh})`, biT = s => `scale(${s.bi})`, cheekT = s => `scaleX(${s.cheek})`;
  const armDx = s => (s.torso - 1) * 24, legT = s => `scaleX(${s.leg})`;
  const leg = (x, prost) => {
    if (!prost) return `<rect x="${x}" y="200" width="15" height="50" rx="6" fill="${skin}"/><path d="M${x - 3},248 h21 a6,6 0 0 1 0,10 h-21 z" fill="#f2f2f2"/><path d="M${x - 3},254 h21" stroke="#ff5a1f" stroke-width="2"/>`;
    const sock = `<rect x="${x}" y="200" width="15" height="22" rx="6" fill="${skin}"/><rect x="${x - 1}" y="216" width="17" height="15" rx="5" fill="#3a3f4d"/><rect x="${x + 1}" y="218" width="13" height="3" rx="1.5" fill="#5a6070"/>`;
    if (kit.blade) return `${sock}<path d="M${x + 4},230 C${x + 3},248 ${x + 6},259 ${x + 22},260 L${x + 26},260 C${x + 30},260 ${x + 30},255 ${x + 25},255 C${x + 15},254 ${x + 12},246 ${x + 12},230 Z" fill="#1b1d22"/><path d="M${x + 6},234 C${x + 6},247 ${x + 9},254 ${x + 20},256" stroke="#4b5060" stroke-width="1.2" fill="none"/>`;
    return `${sock}<rect x="${x + 5}" y="230" width="5" height="20" fill="#b9c0cc"/><rect x="${x + 4}" y="231" width="7" height="3" fill="#8a92a0"/><path d="M${x - 3},248 h21 a6,6 0 0 1 0,10 h-21 z" fill="#f2f2f2"/><path d="M${x - 3},254 h21" stroke="#ff5a1f" stroke-width="2"/>`;
  };
  // avatar faces the viewer: the avatar's LEFT leg is on the viewer's RIGHT
  const legs = leg(84, side === 'right') + leg(102, side === 'left');
  const arm = (sideX, dir) => { const x = sideX; return `<g class="arm ${dir}" style="transform-origin:${x + 6}px 140px"><g ${T('arm' + dir, `translateX(${dir === 'l' ? -armDx(fr) : armDx(fr)}px)`, `translateX(${dir === 'l' ? -armDx(st) : armDx(st)}px)`, `${x + 6}px 140px`)}>
      <rect x="${x}" y="136" width="13" height="48" rx="6.5" fill="${skin}"/>
      <ellipse cx="${x + 6.5}" cy="152" rx="8" ry="10" fill="${skin}" ${T('bi' + dir, biT(fr), biT(st), `${x + 6.5}px 152px`)}/>
      <rect x="${x - 1}" y="134" width="15" height="${kit.hoodie ? 44 : 14}" rx="6" fill="${kit.trisuit && !kit.hoodie ? skin : shirt}"/>
      ${kit.wrist ? `<rect x="${x - 1}" y="176" width="15" height="6" rx="2" fill="#ff5a1f"/>` : ''}<circle cx="${x + 6.5}" cy="187" r="7" fill="${skin}"/></g></g>`; };
  const hairSVG = { short: `<path d="M50,72 C48,30 80,18 104,20 C132,20 154,36 150,72 C146,58 134,46 118,44 C104,52 76,50 62,46 C54,54 52,62 50,72 Z" fill="${hair}"/>`,
    buzz: `<path d="M52,70 C52,34 78,22 100,22 C124,22 148,34 148,70 C142,52 124,40 100,40 C76,40 58,52 52,70 Z" fill="${hair}" opacity=".75"/>`,
    curly: [[60, 52], [72, 36], [88, 28], [104, 26], [120, 30], [134, 40], [144, 56], [54, 66], [146, 70], [80, 44], [112, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${hair}"/>`).join(''),
    swept: `<path d="M50,74 C44,36 76,14 110,18 C140,22 158,44 150,74 C150,60 140,44 120,40 C108,38 96,46 80,44 C66,44 56,56 50,74 Z" fill="${hair}"/><path d="M80,30 C100,22 124,26 138,40" stroke="${shade(hair, 1.4)}" stroke-width="3" fill="none" opacity=".5"/>`,
    bald: `<ellipse cx="86" cy="40" rx="14" ry="7" fill="#fff" opacity=".25"/>` }[A.hair] || '';
  const beard = { none: '', stubble: `<path d="M58,92 C62,124 82,136 100,136 C118,136 138,124 142,92 C134,112 120,118 100,118 C80,118 66,112 58,92 Z" fill="${hair}" opacity=".28"/>`,
    short: `<path d="M56,88 C58,124 80,140 100,140 C120,140 142,124 144,88 C138,108 124,116 100,116 C76,116 62,108 56,88 Z" fill="${hair}" opacity=".85"/>`,
    full: `<path d="M54,84 C52,128 78,150 100,150 C122,150 148,128 146,84 C140,106 124,114 100,114 C76,114 60,106 54,84 Z" fill="${hair}"/>`,
    goatee: `<path d="M88,116 C88,132 94,140 100,140 C106,140 112,132 112,116 C106,120 94,120 88,116 Z" fill="${hair}"/>` }[A.beard] || '';
  const sad = o.mood === 'slump';
  const mouth = sad ? `<path d="M88,112 Q100,103 112,112" stroke="#5a2a1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    : o.mood === 'celebrate' ? `<path d="M84,104 Q100,126 116,104 Z" fill="#5a2a1a"/><path d="M90,106 Q100,112 110,106" fill="#fff"/>` : `<path d="M86,106 Q100,120 114,106" stroke="#5a2a1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const eyes = kit.shades ? `<path d="M68,74 h26 a4,4 0 0 1 4,4 v4 a10,10 0 0 1 -10,10 h-12 a10,10 0 0 1 -10,-10 v-4 a4,4 0 0 1 2,-4z M106,74 h26 a4,4 0 0 1 2,4 v4 a10,10 0 0 1 -10,10 h-12 a10,10 0 0 1 -10,-10 v-4 a4,4 0 0 1 4,-4z" fill="#14161c"/><path d="M98,78 h8" stroke="#14161c" stroke-width="3"/><path d="M72,78 l8,0" stroke="#7ad7ff" stroke-width="2" opacity=".7"/>`
    : `<g class="eyes"><ellipse cx="82" cy="82" rx="6.5" ry="${sad ? 4.5 : 7.5}" fill="#1f1a17"/><ellipse cx="118" cy="82" rx="6.5" ry="${sad ? 4.5 : 7.5}" fill="#1f1a17"/><circle cx="84" cy="79" r="2.2" fill="#fff"/><circle cx="120" cy="79" r="2.2" fill="#fff"/></g>`;
  const brows = sad ? `<path d="M72,71 L90,65 M110,65 L128,71" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>` : `<path d="M72,${o.mood === 'celebrate' ? 64 : 68} Q82,${o.mood === 'celebrate' ? 59 : 63} 92,68 M108,68 Q118,${o.mood === 'celebrate' ? 59 : 63} 128,${o.mood === 'celebrate' ? 64 : 68}" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const helmet = kit.helmet ? `<path d="M46,64 C46,24 76,10 102,10 C134,10 158,28 156,62 C150,56 140,52 126,52 L74,52 C62,52 52,56 46,64 Z" fill="#f4f6fa"/><path d="M60,40 Q80,24 100,22 M84,50 Q94,30 112,22 M110,50 Q122,34 140,32" stroke="#ff5a1f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M52,66 Q58,100 70,112 M148,66 Q142,100 130,112" stroke="#2a2f3a" stroke-width="2.5" fill="none"/>` : '';
  const band = kit.headband && !kit.helmet ? `<path d="M50,58 Q100,40 150,58 L150,68 Q100,50 50,68 Z" fill="#ff3b3b"/><path d="M148,60 l14,6 l-6,10 z" fill="#d42c2c"/>` : '';
  const hood = kit.hoodie ? `<path d="M40,96 C36,40 70,22 100,22 C130,22 164,40 160,96 C158,130 140,140 100,140 C60,140 42,130 40,96 Z" fill="#3c404b"/>` : '';
  const strings = kit.hoodie ? `<path d="M92,132 v26 M108,132 v26" stroke="#e8e8e8" stroke-width="2"/><text x="100" y="178" font-size="9" font-weight="900" text-anchor="middle" fill="#cfd3dc" font-family="Arial Narrow,Arial,sans-serif" letter-spacing="1">STAY HARD</text>` : '';
  const vest = kit.hxvest ? `<path d="M74,132 L88,128 Q100,140 112,128 L126,132 L130,196 L70,196 Z" fill="#ffe000" stroke="#14161c" stroke-width="3"/><path d="M70,176 L130,176 L130,186 L70,186 Z" fill="#14161c"/><text x="100" y="166" font-size="13" font-weight="900" text-anchor="middle" fill="#14161c" font-family="Arial Narrow,Arial,sans-serif">HYROX</text>` : '';
  const medal = kit.medal ? `<path d="M90,128 L100,158 L110,128" stroke="#2f6bff" stroke-width="5" fill="none"/><circle cx="100" cy="162" r="9" fill="#ffc52e" stroke="#d99a00" stroke-width="2"/><text x="100" y="166" font-size="10" text-anchor="middle" font-weight="900" fill="#a86f00">1</text>` : '';
  const tri = kit.trisuit && !kit.hoodie ? `<path d="M82,130 L82,196 M118,130 L118,196" stroke="#ff5a1f" stroke-width="4"/>` : '';
  const bike = kit.bike ? `<g class="bike" opacity=".95"><circle cx="30" cy="244" r="20" fill="none" stroke="#2a2f3a" stroke-width="5"/><circle cx="170" cy="244" r="20" fill="none" stroke="#2a2f3a" stroke-width="5"/>
      <circle cx="30" cy="244" r="20" fill="none" stroke="#9aa3b8" stroke-width="1" stroke-dasharray="2 5"/><circle cx="170" cy="244" r="20" fill="none" stroke="#9aa3b8" stroke-width="1" stroke-dasharray="2 5"/>
      <path d="M30,244 L62,212 L150,212 L170,244 M62,212 L80,244 L150,212 M150,212 L146,198 L160,196" stroke="#ff5a1f" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/><rect x="54" y="204" width="20" height="5" rx="2.5" fill="#1b1d22"/></g>` : '';
  const confetti = o.mood === 'celebrate' && !o.static ? [...Array(14)].map((_, i) => `<rect class="cf" x="${20 + (i * 37) % 160}" y="-10" width="6" height="10" rx="1.5" fill="${['#ff5a1f', '#ffb020', '#2ee59d', '#5aa9ff', '#ff3df2'][i % 5]}" style="animation-delay:${(i % 7) * 0.13}s;--dx:${(i % 2 ? 1 : -1) * (6 + i % 5 * 3)}px"/>`).join('') : '';
  return `<svg class="av ${o.mood || 'idle'} ${o.static ? 'static' : ''}" viewBox="0 0 200 280" ${o.size ? `width="${o.size * 200 / 280}" height="${o.size}"` : ''} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avatar, ${st.name}">
    <ellipse class="shadow" cx="100" cy="268" rx="50" ry="7" fill="#000" opacity=".25"/>${bike}
    <g class="body"><g ${T('legs', legT(fr), legT(st), '100px 230px')}>${legs}</g>
      <path d="M78,192 h44 v14 a5,5 0 0 1 -5,5 h-12 l-5,-6 l-5,6 h-12 a5,5 0 0 1 -5,-5 z" fill="${shorts}"/>
      ${arm(64, 'r')}${arm(123, 'l')}
      <g class="torso" ${T('torso', torsoT(fr), torsoT(st), '100px 196px')}>
        <rect x="76" y="126" width="48" height="72" rx="18" fill="${shirt}"/>
        <ellipse cx="100" cy="176" rx="27" ry="19" fill="${shirtD}" ${T('belly', bellyT(fr), bellyT(st), '100px 170px')}/>
        <g opacity="${st.abs}" class="abs"><path d="M88,142 Q94,148 100,144 Q106,148 112,142" stroke="${shirtD}" stroke-width="2.5" fill="none"/><path d="M100,150 v32 M92,160 h16 M93,171 h14" stroke="${shirtD}" stroke-width="2" stroke-linecap="round"/></g>
        ${tri}${strings}${vest}${medal}</g>
      <circle cx="76" cy="138" r="12" fill="${kit.trisuit && !kit.hoodie ? skin : shirt}" ${T('shr', shT(fr), shT(st), '76px 140px')}/><circle cx="124" cy="138" r="12" fill="${kit.trisuit && !kit.hoodie ? skin : shirt}" ${T('shl', shT(fr), shT(st), '124px 140px')}/>
    </g>
    <g class="head">${hood}<rect x="91" y="118" width="18" height="14" fill="${skinD}"/>
      <g ${T('cheek', cheekT(fr), cheekT(st), '100px 80px')}><circle cx="50" cy="86" r="10" fill="${skinD}"/><circle cx="150" cy="86" r="10" fill="${skinD}"/>
      <ellipse cx="100" cy="80" rx="50" ry="54" fill="${skin}"/>${beard}<circle cx="70" cy="100" r="8" fill="#ff7a7a" opacity=".3"/><circle cx="130" cy="100" r="8" fill="#ff7a7a" opacity=".3"/></g>
      ${hairSVG}${band}${helmet}${brows}${eyes}<path d="M97,92 Q100,98 104,93" stroke="${skinD}" stroke-width="3" fill="none" stroke-linecap="round"/>${mouth}
      ${sad ? '<path d="M128,92 q3,8 0,10 q-3,-2 0,-10z" fill="#7ad7ff" class="tear"/>' : ''}</g>${confetti}</svg>`;
}
// After render: ease any avatar from the last shown stage to the current one
function settleAvatars() {
  const els = document.querySelectorAll('svg.av [data-to]'); if (!els.length) return;
  requestAnimationFrame(() => setTimeout(() => els.forEach(e => { e.style.transform = e.dataset.to; }), 60));
  const cur = avStage(overall(S)); if (S.avShown !== cur) { S.avShown = cur; save(); }
}
function avMood() {
  if (S.celebrateUntil && Date.now() < S.celebrateUntil) return 'celebrate';
  if (S.slumpDate === today() && !S.sessions.some(x => x.date === today())) return 'slump';
  return 'idle';
}
const celebrate = () => { S.celebrateUntil = Date.now() + 15 * 60 * 1000; };
function avatarImage(mood = 'idle') { // static SVG -> Image, for canvas share cards
  const cur = avatarSVG({ mood, static: true, from: avStage(overall(S)) });
  return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cur); });
}

/* ---------- 10) VIEWS ---------- */
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let R = { tab: 'home', ex: null, range: 'all', more: 'badges', pose: 'front', histKey: 'ovr' };
function toast(msg, force) { if (R.tab === 'log' && !force) return; const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
function go(tab, extra = {}) { Object.assign(R, { tab, ex: null }, extra); render(); window.scrollTo(0, 0); }
window.go = go;

function render() {
  const on = S.onboarded;
  $('#nav').style.display = on ? 'flex' : 'none';
  document.querySelector('#nav [data-tab="train"]').style.display = S.depth === 'detailed' ? '' : 'none';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === R.tab));
  const li = levelInfo(S.xp);
  $('#levelbox').innerHTML = on ? `<div class="lvl"><b>LV ${li.level}</b><span>${S.xp.toLocaleString()} XP</span></div><div class="xpbar"><i style="width:${li.pct}%"></i></div><small>${li.toNext} XP to LV ${li.level + 1}</small>` : '';
  $('#view').innerHTML = on ? VIEWS[R.tab]() : onboarding();
  AFTER[R.tab]?.(); settleAvatars();
}

function modePicker(sel, fn) {
  return Object.entries(PERSONAS).map(([k, p]) => `
    <button class="opt ${sel === k ? 'sel' : ''}" onclick="${fn}('${k}')"><span class="oi">${p.icon}</span><span><b>${p.name}</b>
      <small>${p.desc}</small><small class="acc">XP ×${p.xpMult} · Iron ${IRON[k].days} days · ${START_SLOTS[k]} starting habits</small></span></button>`).join('');
}
function depthPicker(sel, fn) {
  return Object.entries(DEPTHS).map(([k, p]) => `<button class="opt ${sel === k ? 'sel' : ''}" onclick="${fn}('${k}')"><span class="oi">${p.icon}</span><span><b>${p.name}</b><small>${p.desc}</small></span></button>`).join('');
}
function onboarding() {
  const st = S.onboardStep, N = 6, dots = `<div class="steps">${[...Array(N)].map((_, i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (back, next, label = 'Next') => `<div class="row"><button class="ghost" onclick="S.onboardStep=${back};render()">Back</button><button onclick="${next}">${label}</button></div>`;
  if (st === 0) return `${dots}<div class="hero"><div class="hero-ic">🏁</div><h1>Welcome, ${esc(S.name)}</h1><p class="muted">Pick how hard the game plays. You can drop down any time; moving up earns a badge.</p></div>
    ${S._migratedFromV1 ? '<div class="panel note">Your v1 data (XP, streak, badges, history) has been carried over.</div>' : ''}${modePicker(S.persona, 'obPersona')}`;
  if (st === 1) return `${dots}<h2>How much do you want to track?</h2><p class="muted">Switch any time in More › Settings.</p>${depthPicker(S.depth, 'obDepth')}
    <button class="ghost wide" onclick="S.onboardStep=0;render()">Back</button>`;
  if (st === 2) return `${dots}<h2>Your sports</h2><p class="muted">Pick everything you train. You can change this later in Settings.</p>${sportPicker()}
    ${nav(1, "S.onboardStep=3;save();render();scrollTo(0,0)")}`;
  if (st === 3) return `${dots}<h2>Your goals</h2><p class="muted">Pick specific benchmarks. Targets are scaled for ${PERSONAS[S.persona].name} mode; edit any of them.</p>
    ${goalPicker()}${nav(2, "S.onboardStep=4;save();render();scrollTo(0,0)")}`;
  if (st === 4) { const m = S.metrics, f = (k, f2, step) => `<div><label>${f2 === 'current' ? 'Now' : 'Target'}</label><input type="number" inputmode="decimal" step="${step}" value="${m[k][f2]}" onchange="obMetric('${k}','${f2}',this.value)"></div>`;
    return `${dots}<h2>Your starting line</h2><p class="muted">Seeded from your TrainingPeaks baseline. Edit if anything has changed.</p>
    <div class="panel"><b>⚖️ Weight (kg)</b><div class="grid2">${f('weight', 'current', 0.1)}${f('weight', 'target', 0.1)}</div></div>
    <div class="panel"><b>🚴 FTP (W)</b><div class="grid2">${f('ftp', 'current', 1)}${f('ftp', 'target', 1)}</div></div>
    <div class="panel note">🎯 <b>Baseline window:</b> each goal needs a first attempt within ${BASELINE_DAYS} days or it gets parked. Build-up goals (marathon, long swims, 100 km) just need any session in that sport. Set them all in time for the 🎯 badge.</div>
    ${nav(3, "S.onboardStep=5;save();render()")}`; }
  return `${dots}<h2>Earn your habits</h2><div class="panel"><p>You start with <b>${S.habits.slots}</b> habits:</p>
    ${S.habits.active.map(id => `<div class="hb static"><span>${habit(id).icon}</span>${habit(id).label}</div>`).join('')}
    <p class="muted">Hit them on 6 of 7 days and you unlock a new habit slot. Ideas go on a wishlist until then. Two weak weeks in a row pauses your newest habit instead of failing everything.</p></div>
    ${nav(4, 'obFinish()', `Let's go ${PERSONAS[S.persona].icon}`)}`;
}
function sportPicker() {
  return `<div class="sports">${Object.entries(SPORTS).map(([k, [ic, n]]) => `<button class="${S.sports.includes(k) ? 'on' : ''}" onclick="toggleSport('${k}')"><span>${ic}</span>${n}<i>${S.sports.includes(k) ? '✓' : ''}</i></button>`).join('')}</div>`;
}
function goalPicker() {
  const mine = id => S.goals.find(g => g.id === id);
  return S.sports.map(sp => { const list = GOALS.filter(g => g.sport === sp);
    const n = activeIn(sp).length, cap = capFor(sp), wish = ((S.goalWish || {})[sp] || []).filter(id => !mine(id)), nx = n < cap && (S.goalSlots || {})[sp] ? nextSuggestion(sp) : null;
    return `<h3 class="caph">${sportName(sp)} <span class="capct ${n > cap ? 'over' : n === cap ? 'full' : ''}">Goals ${n}/${cap}</span></h3>${(S.goalOverride || {})[sp] ? `<p class="capwarn">⚠️ Over the cap: ${sportName(sp)} Earned It badge forfeited</p>` : ''}
      ${wish.length ? `<div class="wishrow"><small>📝 Wishlist</small>${wish.map(id => `<span class="wchip ${id === nx ? 'next' : ''}">${goalDef(id).name}${id === nx ? ' · next up' : ''}<button onclick="unwish('${id}')" aria-label="remove">✕</button></span>`).join('')}</div>` : nx ? `<p class="muted small">🔓 Slot free. Suggested next: <b>${goalDef(nx).name}</b></p>` : ''}${sp === 'hyrox' ? hxDivisionPicker() : ''}<div class="chips ${sp === 'hyrox' ? 'hxchips' : ''}">${list.map(L => `<button class="chip btn ${mine(L.id) ? 'on' : ''}" onclick="toggleGoal('${L.id}')">${mine(L.id) ? (mine(L.id).overridden ? '⚠️ ' : '✓ ') : ''}${L.name}${L.type === 'build' ? ' <em>build-up</em>' : ''}</button>`).join('')}</div>
      ${S.goals.filter(g => goalDef(g.id).sport === sp).map(g => { const L = goalDef(g.id);
        return `<div class="gtgt"><span>${L.name}</span><label>Target <input ${isTimeKind(L) ? `${TIN} placeholder="mm:ss"` : 'type="number" inputmode="decimal" step="any"'} value="${isTimeKind(L) ? fmtTime(g.target) : g.target}" onchange="setGoalTarget('${g.id}',this.value)"> ${isTimeKind(L) ? '' : KINDS[L.kind].unit}</label></div>`; }).join('')}`; }).join('') || '<p class="muted">Pick at least one sport first.</p>';
}

const bar = (lbl, v, note, cls = '') => `<div class="metricrow ${cls}"><div class="lbl">${lbl}<small>${note}</small></div>
  <div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><div class="pct">${Math.round(v * 100)}%</div></div>`;

function athleteCard() {
  const r = overall(S), st = stats(S), t = tier(r), P = PERSONAS[S.persona];
  return `<div class="card ${t}"><div class="shine"></div>
    <div class="ctop"><div><div class="ovr">${r}</div><div class="ovl">OVR</div></div><div class="tier">${t.toUpperCase()}<br><span>${P.icon} ${P.name.toUpperCase()}</span></div></div>
    <div class="cav">${avatarSVG({ mood: avMood(), from: S.avShown ?? avStage(r) })}</div><div class="stagetag">${AV_STAGES[avStage(r)].name}</div>
    <div class="name">${esc(S.name)}</div>
    <div class="stats">${Object.entries(st).map(([k, v]) => `<div><b>${statRating(v)}</b>${k}</div>`).join('')}<div><b>${wkg(S).toFixed(2)}</b>W/KG</div></div></div>`;
}

const VIEWS = {
  card() {
    const ex = S.depth === 'detailed' ? activeGoals(S) : [];
    const next = ex.map(g => ({ g, p: goalProgress(g) })).filter(x => x.p < 1).sort((a, b) => b.p - a.p)[0];
    return `${athleteCard()}
      <div class="tiles"><div class="tile"><b>${S.streak}</b><small>day streak 🔥</small></div><div class="tile"><b>${S.challenge.day}<em>/${IRON[S.persona].days}</em></b><small>Iron days</small></div>
        <div class="tile"><b>${S.pbCount}</b><small>PBs 🏆</small></div></div>
      <div class="row"><button onclick="startLog()">Log workout</button><button class="ghost" onclick="go('more',{more:'share'})">Share card ↗</button></div>
      ${next ? `<div class="panel callout" onclick="go('train',{ex:'${next.g.id}'})"><small>CLOSEST TO TARGET</small><b>${goalDef(next.g.id).name}</b> is ${Math.round(next.p * 100)}% of the way.</div>` : ''}
      <div class="panel"><h3>Body & engine</h3>
      ${['weight', 'ftp'].map(k => { const m = S.metrics[k]; return bar(m.label, progress(m), `${m.current} → ${m.target}`); }).join('')}
      ${bar('W/kg', wkgProgress(S), `${wkg(S).toFixed(2)} → ${(S.metrics.ftp.target / S.metrics.weight.target).toFixed(2)}`)}</div>
      ${ex.length ? `<div class="panel"><h3>Goals <small>roll up into your rating</small></h3>${ex.map(g => { const L = goalDef(g.id);
        return bar(L.name, goalProgress(g), L.type === 'build' && bestKey(g.id) == null ? `longest ${fmtNum(longestIn(L.sport))} / ${L.dist} km` : `${fmtVal(L, bestKey(g.id) ?? g.base)} → ${fmtVal(L, g.target)}`, 'tap" onclick="go(\'train\',{ex:\'' + g.id + '\'})'); }).join('')}</div>` : ''}`;
  },

  today() {
    const H = S.habits, rec = H.days[today()] || { done: [], n: H.active.length }, wp = weekProgress();
    const free = H.slots - H.active.length;
    const candidates = HABITS.filter(h => !H.active.includes(h.id) && !H.paused.includes(h.id)).concat(H.wishlist.filter(w => !H.active.includes(w.id)).map(w => ({ ...w, icon: '✨', wish: 1 })));
    const m = S.metrics, done = S.lastCheckin === today() && S.log.some(e => e.date === today());
    const f = (k, step) => `<div><label>${m[k].label}</label><input type="number" inputmode="decimal" step="${step}" id="in-${k}" value="${m[k].current}"></div>`;
    return `<h2>Today <small class="muted">${fmtDate(today())}</small></h2>
      <div class="panel"><div class="ph"><h3>Habits</h3><span class="muted">${rec.done.filter(d => H.active.includes(d)).length}/${H.active.length}</span></div>
      ${H.active.map(id => { const on = rec.done.includes(id); return `<button class="hb ${on ? 'on' : ''}" onclick="tickHabit('${id}')"><span>${habit(id).icon}</span>${esc(habit(id).label)}<i>${on ? '✓' : ''}</i></button>`; }).join('')}
      <div class="week">${wp.days.map(x => `<div class="${x.h ? 'hit' : x.future ? 'fut' : x.rec ? 'part' : ''} ${x.d === today() ? 'now' : ''}"><i></i>${'MTWTFSS'[(new Date(x.d + 'T12:00').getDay() + 6) % 7]}</div>`).join('')}</div>
      <p class="muted center">${wp.hits}/7 perfect days this week · 6 unlocks a new slot${H.weakWeeks ? ` · ⚠️ ${H.weakWeeks} weak week, another pauses your newest habit` : ''}</p>
      ${H.pausedNote ? `<div class="note">⏸️ ${esc(H.pausedNote)}</div>` : ''}</div>
      ${free > 0 ? `<div class="panel glow"><h3>🔓 ${free} habit slot${free > 1 ? 's' : ''} unlocked</h3><p class="muted">Pick what to add:</p><div class="chips">
        ${candidates.map(h => `<button class="chip btn" onclick="activateHabit('${h.id}')">${h.icon} ${esc(h.label)}${h.wish ? ' ★' : ''}</button>`).join('') || '<span class="muted">Add an idea to your wishlist below.</span>'}</div></div>` : ''}
      <div class="panel"><h3>Wishlist</h3><p class="muted">Ideas wait here until you earn a slot.</p>
        ${H.wishlist.map(w => `<div class="wl">✨ ${esc(w.label)} ${H.active.includes(w.id) ? '<small class="acc">active</small>' : `<button class="x" onclick="dropWish('${w.id}')">✕</button>`}</div>`).join('')}
        <div class="row"><input id="wish" placeholder="e.g. Apple cider vinegar, multivitamin"><button onclick="addWish()">Add</button></div>
        ${H.slots < HABITS.length ? `<button class="link" onclick="overrideHabits()">Unlock everything now (forfeits the Earned It badge)</button>` : ''}</div>
      ${S.depth === 'detailed' ? `<div class="panel"><h3>Numbers check-in</h3>${done ? '<p class="muted">✅ Logged today. Update any number without extra XP.</p>' : ''}
        <div class="grid2">${f('weight', 0.1)}${f('ftp', 1)}</div><p class="muted">Workouts are logged from Home › Log workout.</p>
        <button class="wide" onclick="doCheckin()">Log it 💪</button></div>` : ''}`;
  },

  train() {
    if (R.ex) return goalView(R.ex);
    const act = activeGoals(S), parked = S.goals.filter(g => g.status === 'parked');
    const row = g => { const L = goalDef(g.id), b = bestKey(g.id), last = sessionsFor(g.id).at(-1), p = goalProgress(g), pend = g.status === 'active' && !g.baselineDate;
      return `<button class="exrow ${g.status} ${L.hx ? 'hx' : ''}" onclick="go('train',{ex:'${g.id}'})"><div class="exm"><b>${infoBtn(g.id)} ${L.name}${L.type === 'build' ? ' <em class="tag">build-up</em>' : ''}${g.overridden ? ' <em class="tag warn">over cap</em>' : ''}</b>${L.station && hxWeight(L.station) ? `<small class="hxw">${hxWeight(L.station)}</small>` : ''}
        <small>${pend ? `🎯 ${daysLeft(g)}d left for a baseline` : g.status === 'parked' ? 'Parked · tap to re-activate' : `${last ? `Last ${fmtDate(last.date)} · ` : ''}${L.type === 'build' && b == null ? `Longest ${fmtNum(longestIn(L.sport))} of ${L.dist} km` : `PB ${fmtVal(L, b)} → ${fmtVal(L, g.target)}`}`}</small>
        <div class="bar"><i style="width:${p * 100}%"></i></div></div>${sparkline(g.id)}<span class="pct">${Math.round(p * 100)}%</span></button>`; };
    const sports = [...new Set(act.map(g => goalDef(g.id).sport))];
    return `<div class="ph"><h2>Goals</h2><button class="sm" onclick="go('goals')">+ Edit goals</button></div>
      ${S.sports.includes('hyrox') ? hxRacesPanel() : ''}${sports.map(sp => `<h3 class="caph">${sportName(sp)} <span class="capct ${activeIn(sp).length > capFor(sp) ? 'over' : ''}">Goals ${activeIn(sp).length}/${capFor(sp)}</span></h3>${act.filter(g => goalDef(g.id).sport === sp).map(row).join('')}`).join('') || '<p class="muted">No active goals. Add some.</p>'}
      ${parked.length ? `<h3>⏸️ Parked <small>no baseline in ${BASELINE_DAYS} days · not in your rating</small></h3>${parked.map(g => `<div class="parkrow">${row(g)}<button class="sm ghost" onclick="reactivateGoal('${g.id}')">Re-activate</button></div>`).join('')}` : ''}`;
  },
  goals() {
    return `<button class="back" onclick="go('train')">‹ Goals</button><h2>Sports & goals</h2><p class="muted">New goals get a ${BASELINE_DAYS}-day baseline window.</p>
      ${sportPicker()}${goalPicker()}<button class="wide" onclick="go('train')">Done</button>`;
  },

  challenge() {
    const c = S.challenge, I = IRON[S.persona], doneToday = c.lastDate === today();
    const rule = I.onMiss === 'strict' ? 'Miss ANY item or a day and you restart at Day 1.' : I.onMiss === 'reset' ? 'Skip a whole day and you restart.' : 'Miss a day and the challenge pauses. No reset.';
    const pct = c.day / I.days, R0 = 70, C = 2 * Math.PI * R0;
    return `<h2>🔥 Iron ${I.days} <small class="muted">${PERSONAS[S.persona].name} tier</small></h2>
      <div class="panel center"><svg class="ring" viewBox="0 0 160 160"><circle cx="80" cy="80" r="${R0}" class="rbg"/><circle cx="80" cy="80" r="${R0}" class="rfg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
        <text x="80" y="78" text-anchor="middle" class="rnum">${c.day}</text><text x="80" y="102" text-anchor="middle" class="rlab">OF ${I.days} DAYS</text></svg>
        <p class="muted">${rule}${c.completed ? ` · Completed ${c.completed}×` : ''}</p></div>
      <div class="tiers">${Object.entries(IRON).map(([k, t]) => `<div class="${k === S.persona ? 'on' : ''}"><b>${PERSONAS[k].icon} ${t.days}d</b><small>${t.items.length} tasks · ${t.onMiss === 'pause' ? 'pauses' : 'resets'}</small></div>`).join('')}</div>
      ${I.items.map((it, i) => `<label class="check ${c.todays[i] ? 'done' : ''}"><input type="checkbox" ${c.todays[i] ? 'checked' : ''} ${doneToday ? 'disabled' : ''} onchange="tickItem(${i},this.checked)"> ${it}</label>`).join('')}
      ${doneToday ? '<div class="panel center">✅ Day banked. See you tomorrow.</div>' : `<button class="wide" onclick="completeDay()">Bank Day ${c.day + 1}</button>`}`;
  },

  photos() {
    const list = photosOf(R.pose), first = list[0], last = list.at(-1), lastAny = PHOTOS.at(-1);
    const thisWeek = PHOTOS.some(p => weekStart(p.date) === weekStart(today()));
    const tag = p => `${fmtDate(p.date)} · LV ${p.level}${p.weight ? ` · ${p.weight}kg` : ''}`;
    return `<h2>📸 Progress photos</h2>
      <div class="panel ${S.persona === 'goggins' && !thisWeek ? 'warn' : ''}">${thisWeek ? '✅ Photo day done this week.' : S.persona === 'goggins' ? '💀 Weekly photo is mandatory in Goggins mode. Take it today.' : 'Weekly photo day: front, side and back. Optional in your mode.'}
        <div class="muted">🔒 Stored on this device only. Never uploaded, never on share cards unless you opt in.</div></div>
      <div class="seg">${POSES.map(p => `<button class="${R.pose === p ? 'on' : ''}" onclick="R.pose='${p}';render()">${p} <small>${photosOf(p).length}</small></button>`).join('')}</div>
      <div class="row"><button onclick="openCamera()">📷 Take ${R.pose} photo</button><label class="btn ghost">🖼️ Upload<input type="file" accept="image/*" id="photoFile" hidden onchange="pickPhoto(this)"></label></div>
      ${list.length >= 2 ? `<h3>Week 1 vs now <small>drag</small></h3><div class="compare" id="cmp">
          <img src="${URLS[last.id]}" alt="now"><div class="cl" style="width:50%"><img src="${URLS[first.id]}" alt="week 1"></div><div class="handle" style="left:50%"><span>⟷</span></div>
          <em class="t1">${tag(first)}</em><em class="t2">${tag(last)}</em></div>
        <h3>Time-lapse</h3><div class="tl" id="tl"><img id="tlimg" src="${URLS[first.id]}" alt="time-lapse"><em id="tltag">${tag(first)}</em></div>
        <div class="row"><button class="ghost" id="tlbtn" onclick="toggleLapse()">▶ Play</button><input type="range" id="tlr" min="0" max="${list.length - 1}" value="0" oninput="lapseTo(+this.value)"></div>`
        : `<p class="muted center">${list.length ? 'One more ' + R.pose + ' photo unlocks the comparison slider and time-lapse.' : 'No ' + R.pose + ' photos yet.'}</p>`}
      ${list.length ? `<h3>All ${R.pose}</h3><div class="pgrid">${list.slice().reverse().map(p => `<figure><img src="${URLS[p.id]}" alt=""><figcaption>${tag(p)}</figcaption><button class="x" onclick="delPhoto('${p.id}')">✕</button></figure>`).join('')}</div>` : ''}`;
  },

  more() {
    const tabs = [['badges', '🏅 Badges'], ['history', '📈 History'], ['share', '↗ Share'], ['settings', '⚙️ Settings']];
    return `<div class="seg">${tabs.map(([k, l]) => `<button class="${R.more === k ? 'on' : ''}" onclick="R.more='${k}';render()">${l}</button>`).join('')}</div>${MORE[R.more]()}`;
  },
};


/* ---------- 10b) HOME + POST-WORKOUT FLOW ---------- */
let F = null; // flow state while logging
function recentIds(n = 4) { const seen = []; for (const x of S.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)) if (x.exId !== 'session' && !seen.includes(x.exId) && S.goals.some(g => g.id === x.exId && g.status === 'active')) seen.push(x.exId); return seen.slice(0, n); }
function suggestedIds(n = 4) {
  const lastDate = id => sessionsFor(id).at(-1)?.date || '0000';
  const recentSports = new Set(S.sessions.filter(x => x.date >= addDays(today(), -1)).map(x => x.sport));
  const ids = activeGoals(S).map(g => g.id).filter(id => !recentSports.has(goalDef(id).sport)).sort((a, b) => lastDate(a).localeCompare(lastDate(b)));
  const out = [], sp = new Set();
  for (const id of ids) if (!sp.has(goalDef(id).sport)) { sp.add(goalDef(id).sport); out.push(id); }
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out.slice(0, n);
}
function seedSets(id) {
  if (id === 'session') return [{ min: 60 }];
  const last = sessionsFor(id).at(-1); if (last) return structuredClone(last.sets);
  const L = goalDef(id), g = S.goals.find(x => x.id === id) || L, b = g.base;
  return L.kind === 'rm' ? [{ reps: L.n, kg: b }] : L.kind === 'reps' ? [{ reps: Math.round(b) }] : L.kind === 'hold' ? [{ sec: b }]
    : L.kind === 'watts' ? [{ watts: Math.round(b / (L.factor || 1)) }] : L.kind === 'far' ? [{ km: b }] : [{ time: b }];
}
/* ---------- 10a) HOME OVERVIEW ---------- */
// Same maths as overall(): each part's 0-1 score and its weight.
function overallParts(s) {
  const ag = s.depth === 'detailed' ? activeGoals(s) : [];
  const parts = [ag.length ? ['goals', 'Goals', ag.reduce((a, g) => a + goalProgress(g), 0) / ag.length, 5] : ['ftp', 'FTP', progress(s.metrics.ftp), 2],
    ['weight', 'Weight', progress(s.metrics.weight), 2], ['wkg', 'W/kg', wkgProgress(s), 2], ['cons', 'Consistency', clamp01(s.streak / 30), 1]];
  const W = parts.reduce((a, p) => a + p[3], 0);
  return parts.map(([k, label, v, w]) => ({ k, label, v, w, share: Math.round(w / W * 100) }));
}
function ovrAgo(days) { const d = addDays(today(), -days), e = S.log.filter(x => x.date <= d && x.ovr).at(-1); return e ? e.ovr : null; }
const delta = (r, then, lbl) => then == null ? `<span class="dl flat">– ${lbl}</span>` : `<span class="dl ${r > then ? 'up' : r < then ? 'down' : 'flat'}">${r > then ? '▲' : r < then ? '▼' : '■'} ${Math.abs(r - then)} ${lbl}</span>`;
function ring(v, size = 112) {
  const R0 = 46, C = 2 * Math.PI * R0, f = clamp01((v - 40) / 59);
  return `<svg viewBox="0 0 110 110" width="${size}" height="${size}" class="ring"><circle cx="55" cy="55" r="${R0}" class="rbg"/><circle cx="55" cy="55" r="${R0}" class="rfg ${tier(v)}" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>
    <text x="55" y="60" text-anchor="middle" class="rnum">${v}</text><text x="55" y="77" text-anchor="middle" class="rlbl">OVERALL</text></svg>`;
}
function overallHero() {
  const r = overall(S), L = levelInfo(S.xp), st = AV_STAGES[avStage(r)].name, parts = overallParts(S);
  return `<button class="ovhero" onclick="ovSheet()">${ring(r)}<div class="ovm"><div class="ovtop"><b>Lv ${L.level}</b><span>${st}</span></div>
    <div class="ovdl">${delta(r, ovrAgo(7), 'this week')}${delta(r, ovrAgo(30), 'this month')}</div>
    <small class="ovwhy">${parts.map(p => `${p.label} ${p.share}%`).join(' · ')}</small></div><i class="chev">›</i></button>`;
}
window.ovSheet = () => { const r = overall(S), parts = overallParts(S);
  modal(`<h2>Overall ${r}</h2><p class="muted">Your rating is a weighted mix of these parts, scaled to 40–99. Each bar is that part's progress from your start to your target.</p>
    <div class="ovparts">${parts.map(p => `<div class="ovp"><div><b>${p.label}</b><small>${p.share}% of rating</small></div><div class="bar"><i style="width:${Math.round(p.v * 100)}%"></i></div><b class="pv">${statRating(p.v)}</b></div>`).join('')}</div>
    <p class="muted small">Goals = average progress of your active goals (parked goals don't count). Consistency = streak / 30 days.</p>
    <button class="wide" onclick="closeModal();go('card')">Open athlete card</button>`); };
// progress as it stood on a past date (sessions after that date hidden)
function progressAt(g, d) { const keep = S.sessions; S.sessions = keep.filter(x => x.date <= d); try { return goalProgress(g); } finally { S.sessions = keep; } }
function metricAt(k, d) { const e = S.log.filter(x => x.date <= d).at(-1); return e && e[k] != null ? e[k] : S.metrics[k].base; }
// on track: progress gained over the last 4 weeks vs what's needed to hit the target within 6 months of starting
function paceStatus(pNow, p4, startDate, recent) {
  if (pNow >= 1) return ['ok', 'Done'];
  const wksLeft = Math.max(4, 26 - daysBetween(startDate, today()) / 7), need = (1 - pNow) / (wksLeft / 4), gain = pNow - p4;
  if (gain >= need * 0.8) return ['ok', 'On track'];
  if (gain > 0.005 || (recent && gain >= 0)) return gain > 0.005 ? ['warn', 'Behind'] : ['bad', 'Stalled'];
  return ['bad', 'Stalled'];
}
function goalTrack(g) {
  if (!g.baselineDate) return ['bad', `No baseline · ${daysLeft(g)}d`];
  const d4 = addDays(today(), -28), recent = sessionsFor(g.id).some(x => x.date > d4);
  return paceStatus(goalProgress(g), g.since > d4 ? 0 : progressAt(g, d4), g.since, recent);
}
function metricSpark(k, invert) { // weekly values (last ~10 weeks) as mini bars
  const by = new Map(); for (const e of S.log) if (e[k] != null) by.set(weekKey(e.date), e[k]);
  return miniBars([...by.values()], invert);
}
// Home tracking row. logId adds a one-tap Log that skips the pick step.
const trow = (name, val, p, [cls, txt], spark, onclick, logId) => {
  const body = `<div class="tm"><div class="tt"><b>${name}</b><span>${val}</span></div><div class="bar"><i style="width:${Math.round(clamp01(p) * 100)}%"></i></div></div>
    <div class="ts ${cls}">${spark}<em>${txt}</em></div>`;
  if (logId) return `<div class="trow"><button type="button" class="tmain" onclick="${onclick}">${body}</button><button type="button" class="tlog" onclick="startLog('${logId}')">Log</button></div>`;
  return `<button type="button" class="trow" onclick="${onclick}">${body}</button>`;
};
function tracking() {
  const m = S.metrics, d4 = addDays(today(), -28), start = S.habits.start || today();
  const wp = progress(m.weight), wp4 = progress({ ...m.weight, current: metricAt('weight', d4) });
  const fp4 = progress({ base: m.ftp.base / m.weight.base, target: m.ftp.target / m.weight.target, current: metricAt('ftp', d4) / metricAt('weight', d4) });
  const body = trow('Weight', `${fmtNum(m.weight.current)} → ${m.weight.target} kg`, wp, S.log.length > 1 ? paceStatus(wp, wp4, start, true) : ['bad', 'No data yet'], metricSpark('weight', true), "metricSheet('weight')")
    + trow('FTP · W/kg', `${Math.round(m.ftp.current)} W · ${wkg(S).toFixed(2)} → ${(m.ftp.target / m.weight.target).toFixed(2)}`, wkgProgress(S), S.log.length > 1 ? paceStatus(wkgProgress(S), fp4, start, true) : ['bad', 'No data yet'], metricSpark('ftp'), "metricSheet('ftp')");
  const act = S.depth === 'detailed' ? activeGoals(S) : [], sports = [...new Set(act.map(g => goalDef(g.id).sport))];
  const goals = sports.map(sp => `<h4>${sportName(sp)}</h4>${act.filter(g => goalDef(g.id).sport === sp).map(g => { const L = goalDef(g.id), b = bestKey(g.id);
    const val = L.type === 'build' && b == null ? `${fmtNum(longestIn(L.sport))} / ${L.dist} km → ${fmtVal(L, g.target)}` : `${fmtVal(L, b ?? null)} → ${fmtVal(L, g.target)}`;
    return trow(L.name, val, goalProgress(g), goalTrack(g), sparkline(g.id) || '<svg class="spark" viewBox="0 0 60 20"></svg>', `go('train',{ex:'${g.id}'})`, g.id); }).join('')}`).join('');
  return `<div class="panel track"><div class="ph"><h3>How I'm tracking</h3><small class="muted legend"><i class="d ok"></i>on track <i class="d warn"></i>behind <i class="d bad"></i>stalled</small></div>
    <h4>⚖️ Body & power</h4>${body}${goals || `<p class="muted">Pick goals to track them here.</p><button class="sm" onclick="go('goals')">+ Add goals</button>`}</div>`;
}
VIEWS.home = () => {
  const H = S.habits, rec = H.days[today()] || { done: [] }, hDone = rec.done.filter(d => H.active.includes(d)).length;
  const todays = S.sessions.filter(x => x.date === today()), last = S.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)[0];
  const iron = S.challenge.lastDate === today(), r = overall(S), hr = new Date().getHours(), pend = S.depth === 'detailed' ? pendingBaselines() : [];
  return `<div class="hello"><small>${hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'}, ${esc(S.name)}</small><b>${todays.length ? 'Nice work today 💪' : 'Just trained? Log it.'}</b></div>
    ${!S.hintSeen ? `<div class="panel hint"><b>👋 How to use Fit Quest</b><ol><li>Finish a workout, open the app.</li><li>Tap <b>Log workout</b>: pick the goal you attempted (or a general session), nudge the numbers, tick your habits.</li><li>Collect XP, PBs and unlocks. Share if you like.</li></ol><button class="sm" onclick="S.hintSeen=true;save();render()">Got it</button></div>` : ''}
    <button class="cta" onclick="startLog()"><span>＋</span>Log workout<small>${todays.length ? `${todays.length} logged today · add more` : 'About 30 seconds'}</small></button>
    ${overallHero()}${tracking()}
    ${pend.length ? `<div class="panel baseline"><div class="ph"><h3>🎯 Baseline week</h3><small class="muted">${S.goals.filter(g => g.baselineDate).length}/${S.goals.filter(g => g.status === 'active').length} set</small></div>
      ${pend.map(g => `<button class="bl ${daysLeft(g) <= 3 ? 'urgent' : ''}" onclick="startLog('${goalDef(g.id).type === 'build' ? 'session:' + goalDef(g.id).sport : g.id}')"><span>${SPORTS[goalDef(g.id).sport][0]}</span><b>${baselineText(g)}</b><i>${daysLeft(g) <= 3 ? '⚠️' : '›'}</i></button>`).join('')}
      <p class="muted">No baseline in ${BASELINE_DAYS} days parks the goal (kept, but out of your rating). All in time earns 🎯.</p></div>` : ''}
    <div class="panel"><h3>Today</h3>
      <button class="status ${todays.length ? 'ok' : ''}" onclick="startLog()"><i>${todays.length ? '✓' : ''}</i>Workout<span>${todays.length ? todays.map(x => x.exId === 'session' ? sportName(x.sport).split(' ')[1] + ' session' : goalDef(x.exId).name).join(', ') : 'Not logged yet'}</span></button>
      <button class="status ${hDone >= H.active.length ? 'ok' : ''}" onclick="go('today')"><i>${hDone >= H.active.length ? '✓' : ''}</i>Habits<span>${hDone}/${H.active.length} done</span></button>
      <button class="status ${iron ? 'ok' : ''}" onclick="go('challenge')"><i>${iron ? '✓' : ''}</i>Iron ${IRON[S.persona].days}<span>${iron ? 'Day banked' : `Bank day ${S.challenge.day + 1}`}</span></button></div>
    ${last ? `<div class="panel callout" onclick="${last.exId === 'session' ? '' : `go('train',{ex:'${last.exId}'})`}"><small>LAST SESSION · ${fmtDate(last.date)}</small><b>${last.exId === 'session' ? sportName(last.sport) + ' session' : goalDef(last.exId).name}</b> ${last.sets.map(x => setText(goalDef(last.exId), x)).join(' · ')} ${last.pb ? '🏆' : ''}</div>` : ''}`;
};
// pre: optional goal id, or 'session:<sport>' to open a general session
window.startLog = pre => {
  S.newKit = []; F = { step: 1, q: null, sel: [], sets: {}, sport: S.sports[0] || 'run', startXP: S.xp, startBadges: [...S.badges], startSlots: S.habits.slots, startLevel: levelInfo(S.xp).level, startWeight: S.metrics.weight.current };
  if (pre?.startsWith('session:')) { F.sel = ['session']; F.sport = pre.slice(8); F.q = F.sport; }
  else if (pre) { F.sel = [pre]; F.q = goalDef(pre).sport; F.step = 2; } // one-tap Log / baseline test: skip "What did you do?"
  go('log');
};
const stepDots = () => `<div class="steps">${[1, 2, 3].map(i => `<i class="${i <= F.step ? 'on' : ''}"></i>`).join('')}</div>`;
const pickTile = id => { if (id === 'session') return `<button class="pick gen ${F.sel.includes(id) ? 'on' : ''}" onclick="togglePick('session')"><b>⏱️ Training session</b><small>Any workout. Just duration${F.q ? ` · ${SPORTS[F.q][1]}` : ''}. No PB.</small><i>${F.sel.includes(id) ? '✓' : '+'}</i></button>`;
  const L = goalDef(id), g = S.goals.find(x => x.id === id), last = sessionsFor(id).at(-1), pend = g && g.status === 'active' && !g.baselineDate;
  return `<button class="pick ${L.hx ? 'hx' : ''} ${F.sel.includes(id) ? 'on' : ''} ${pend ? 'need' : ''}" onclick="togglePick('${id}')"><b>${L.name} ${infoBtn(id)}</b><small>${pend ? `🎯 baseline · ${daysLeft(g)}d left` : last ? `${fmtDate(last.date)} · ${fmtVal(L, last.key)}` : sportName(L.sport)}</small><i>${F.sel.includes(id) ? '✓' : '+'}</i></button>`; };
VIEWS.log = () => {
  if (!F) { R.tab = 'home'; return VIEWS.home(); }
  if (F.step === 1) {
    const act = activeGoals(S).map(g => g.id), rec = recentIds(), need = pendingBaselines().filter(g => goalDef(g.id).type !== 'build').map(g => g.id).filter(id => !rec.includes(id));
    const sug = suggestedIds().filter(id => !rec.includes(id) && !need.includes(id)), rest = act.filter(id => !rec.includes(id) && !sug.includes(id) && !need.includes(id));
    const pool = F.q ? act.filter(id => goalDef(id).sport === F.q) : [];
    return `${stepDots()}<div class="ph"><h2>What did you do?</h2><button class="x" onclick="F=null;go('home')">✕</button></div>
      <div class="quick">${S.sports.map(k => `<button class="${F.q === k ? 'on' : ''}" onclick="quickPick('${k}')"><span>${SPORTS[k][0]}</span>${SPORTS[k][1]}</button>`).join('')}</div>
      <div class="picks one">${S.sports.includes('hyrox') ? `<button class="pick hx race ${F.sel.includes('hx_race') ? 'on' : ''}" onclick="togglePick('hx_race')"><b>🟨 Hyrox race</b><small>All 8 runs + 8 stations + roxzone · ${hxDivLabel()}</small><i>${F.sel.includes('hx_race') ? '✓' : '+'}</i></button>` : ''}${pickTile('session')}</div>
      ${F.q ? `<h3>${sportName(F.q)} goals</h3><div class="picks">${pool.map(pickTile).join('') || '<span class="muted">No goals for this sport yet. Log a session, or add goals in Train.</span>'}</div>` : ''}
      ${need.length && !F.q ? `<h3>🎯 Needs a baseline</h3><div class="picks">${need.map(pickTile).join('')}</div>` : ''}
      ${rec.length && !F.q ? `<h3>Recent</h3><div class="picks">${rec.map(pickTile).join('')}</div>` : ''}
      ${sug.length && !F.q ? `<h3>Suggested today <small>not attempted lately</small></h3><div class="picks">${sug.map(pickTile).join('')}</div>` : ''}
      ${rest.length && !F.q ? `<details class="more" ${F.sel.some(id => rest.includes(id)) ? 'open' : ''}><summary>All my goals (${rest.length})</summary><div class="picks">${rest.map(pickTile).join('')}</div></details>` : ''}
      <div class="dock"><button class="wide" ${F.sel.length ? '' : 'disabled'} onclick="F.step=2;render();scrollTo(0,0)">${F.sel.length ? `Next: enter results (${F.sel.length})` : 'Pick a goal or a session'}</button></div>`;
  }
  if (F.step === 2) {
    return `${stepDots()}<div class="ph"><h2>Your results</h2><button class="x" onclick="F.step=1;render()">‹ Back</button></div><p class="muted">Prefilled from last time. Tap − / + to adjust. Times are mm:ss.</p>
      ${F.sel.includes('hx_race') ? raceForm() : ''}${F.sel.filter(id => id !== 'hx_race').map(id => { const L = goalDef(id), last = sessionsFor(id).at(-1), sets = F.sets[id] || (F.sets[id] = seedSets(id)), multi = L.kind === 'rm';
        const head = id === 'session' ? `<b class="en">⏱️ Training session</b></div><div class="chips">${S.sports.map(k => `<button class="chip btn ${F.sport === k ? 'on' : ''}" onclick="F.sport='${k}';render()">${SPORTS[k][0]} ${SPORTS[k][1]}</button>`).join('')}</div><div>`
          : `<b class="en">${L.name} ${infoBtn(id)}</b><small class="muted">${last ? 'Last ' + fmtVal(L, last.key) : 'Baseline attempt'}${bestKey(id) != null ? ` · PB ${fmtVal(L, bestKey(id))}` : ''}</small>`;
        return `<div class="panel" id="fx-${id}"><div class="ph">${head}</div>
          ${sets.map((st, i) => `<div class="srow"><span class="sn">${sets.length > 1 ? i + 1 : ''}</span>${KINDS[L.kind].fields.map(([f, lbl, step, opt, typ]) => `<div class="stp"><button onclick="bump('${id}',${i},'${f}',-${step})">−</button><label><input ${typ === 'time' ? `${TIN} placeholder="mm:ss"` : 'type="number" inputmode="decimal" placeholder="–"'} value="${st[f] == null ? '' : typ === 'time' ? fmtTime(st[f]) : st[f]}" onchange="setF('${id}',${i},'${f}',this.value,'${typ || ''}')"><small>${lbl}${opt ? ' (opt.)' : ''}</small></label><button onclick="bump('${id}',${i},'${f}',${step})">+</button></div>`).join('')}
          ${sets.length > 1 ? `<button class="x" onclick="F.sets['${id}'].splice(${i},1);render()">✕</button>` : ''}</div>`).join('')}
          ${multi ? `<button class="link" onclick="F.sets['${id}'].push(structuredClone(F.sets['${id}'].at(-1)));render()">+ add set</button>` : ''}${L.dist ? `<small class="muted">${L.type === 'build' ? 'Finished the full ' : ''}${L.dist} km${L.type === 'build' ? '? Enter your finish time. Shorter build-up runs go in a Training session.' : ''}</small>` : ''}</div>`; }).join('')}
      <div class="dock"><button class="wide" onclick="toStep3()">Next: habits</button></div>`;
  }
  if (F.step === 3) {
    const H = S.habits, rec = H.days[today()] || { done: [] }, w = S.metrics.weight.current, list = H.active.filter(id => id !== 'trained');
    return `${stepDots()}<div class="ph"><h2>Today's habits</h2><button class="x" onclick="F.step=2;render()">‹ Back</button></div>
      <div class="panel">${H.active.includes('trained') ? '<div class="implied">✅ <b>Trained today</b> counted from this log</div>' : ''}
      ${list.map(id => { const on = rec.done.includes(id); return `<button class="hb ${on ? 'on' : ''}" onclick="tickHabit('${id}')"><span>${habit(id).icon}</span>${esc(habit(id).label)}<i>${on ? '✓' : ''}</i></button>`; }).join('')}
      <p class="muted">Tick what's true so far. You can come back later today.</p></div>
      ${S.depth === 'detailed' ? `<div class="panel"><b>⚖️ Weigh-in</b> <small class="muted">optional</small><div class="stp big"><button onclick="F.w=+((F.w??${w})-0.1).toFixed(1);render()">−</button><label><input type="number" step="0.1" value="${F.w ?? w}" onchange="F.w=parseFloat(this.value)"><small>kg</small></label><button onclick="F.w=+((F.w??${w})+0.1).toFixed(1);render()">+</button></div></div>` : ''}
      <div class="dock"><button class="wide" onclick="finishLog()">Finish & collect XP 🎉</button></div>`;
  }
  const gained = S.xp - F.startXP, li = levelInfo(S.xp), newB = S.badges.filter(b => !F.startBadges.includes(b));
  return `<div class="reward"><div class="burst sm"></div><div class="rav">${avatarSVG({ mood: 'celebrate', size: 190 })}</div><small>WORKOUT LOGGED</small><div class="xpbig">+${gained}<span>XP</span></div>
      ${li.level > F.startLevel ? `<div class="lvup">LEVEL UP · LV ${li.level}</div>` : `<div class="muted">Level ${li.level} · ${li.toNext} XP to go</div>`}
      <div class="xpbar"><i style="width:${li.pct}%"></i></div></div>
    <div class="tiles"><div class="tile hot"><b>${S.streak}</b><small>day streak 🔥</small></div><div class="tile"><b>${F.res.filter(x => x.cur.pb).length}</b><small>PBs today</small></div><div class="tile"><b>${overall(S)}</b><small>rating</small></div></div>
    ${F.res.map(({ cur, prev }) => { const L = goalDef(cur.exId); if (cur.exId === 'hx_race') return racePanel(cur, prev); return `<div class="panel ${cur.pb ? 'pbrow' : ''}"><div class="ph"><b>${cur.pb ? '🏆 ' : ''}${cur.exId === 'session' ? sportName(cur.sport) + ' session' : L.name}</b>${cur.pb ? '<span class="pbtag">PB!</span>' : cur.exId !== 'session' ? `<b>${fmtVal(L, cur.key)}</b>` : ''}</div><div class="cmp">${compare(prev, cur, L).map(x => `<span class="${x.cls}">${x.txt}</span>`).join('')}</div></div>`; }).join('')}
    ${F.newBaselines?.length ? `<div class="panel"><h3>🎯 Baselines set</h3>${F.newBaselines.map(id => `<div class="unl">✓ ${goalDef(id).name}</div>`).join('')}</div>` : ''}
    ${newB.length || S.habits.slots > F.startSlots || S.newKit?.length ? `<div class="panel glow"><h3>🔓 Unlocked</h3>${newB.map(b => `<div class="unl">${BADGES[b][0]} ${BADGES[b][1]}</div>`).join('')}${(S.newKit || []).map(n => `<div class="unl">🎁 Avatar kit: ${n}</div>`).join('')}${S.habits.slots > F.startSlots ? '<div class="unl">🔓 New habit slot</div>' : ''}</div>` : ''}
    <div class="row"><button onclick="F=null;go('more',{more:'share'})">Share ↗</button><button class="ghost" onclick="F=null;go('home')">Done</button></div>`;
};
window.setAv = (k, v) => { avatarState()[k] = v; save(); render(); };
window.toggleKit = k => { const A = avatarState(); A.kit[k] = !A.kit[k]; if (k === 'helmet' && A.kit.helmet) A.kit.headband = false; if (k === 'headband' && A.kit.headband) A.kit.helmet = false; save(); render(); };
window.toStep3 = () => { F.step = 3; render(); scrollTo(0, 0); };
window.quickPick = q => { F.q = F.q === q ? null : q; if (F.q) F.sport = F.q; render(); };
window.togglePick = id => { F.sel = F.sel.includes(id) ? F.sel.filter(x => x !== id) : [...F.sel, id]; render(); };
window.bump = (id, i, f, d) => { const st = F.sets[id][i], v = (parseFloat(st[f]) || 0) + d; st[f] = Math.max(0, Math.round(v * 10) / 10); render(); };
window.setF = (id, i, f, v, typ) => { F.sets[id][i][f] = typ === 'time' ? parseTime(v) : parseFloat(v); };
function cleanSets(L, sets) {
  return sets.map(x => ({ ...x })).filter(st => KINDS[L.kind].fields.every(([f, , , opt]) => opt || st[f] > 0))
    .map(st => { for (const [f, , , opt] of KINDS[L.kind].fields) if (opt && !(st[f] > 0)) delete st[f]; return st; });
}
window.finishLog = () => {
  F.res = []; const before = new Set(S.goals.filter(g => g.baselineDate).map(g => g.id));
  if (F.sel.includes('hx_race')) F.res.push(saveRace());
  for (const id of F.sel.filter(x => x !== 'hx_race')) { const sets = cleanSets(goalDef(id), F.sets[id] || []); if (sets.length) F.res.push(saveSession(id, sets, true, id === 'session' ? F.sport : null)); }
  if (!F.res.length) { F.step = 2; render(); return toast('Enter at least one result', true); }
  if (F.w != null && F.w !== F.startWeight && F.w > 0) {
    const lowest = F.w < Math.min(F.startWeight, ...S.log.map(e => e.weight)); S.metrics.weight.current = F.w; addXP(XP.weighin, 'weigh-in', true);
    if (lowest) { S.pbCount++; addXP(XP.pb, 'PB', true); } logPoint();
  }
  // Training is implied by logging: tick "Trained today" without asking again
  const H = S.habits, rec = H.days[today()];
  if (H.active.includes('trained') && !(rec && rec.done.includes('trained'))) tickHabit('trained', true);
  updateBaselines(); F.newBaselines = S.goals.filter(g => g.baselineDate && !before.has(g.id)).map(g => g.id);
  checkBadges(); save(); F.step = 4; render(); scrollTo(0, 0);
  const p = F.res.find(x => x.cur.pb)?.cur; if (p) pbMoment(fmtVal(goalDef(p.exId), p.key), goalDef(p.exId).name);
};

/* ---------- 10c) HYROX RACE ---------- */
const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
function raceSeed() {
  const last = sessionsFor('hx_race').at(-1);
  if (last) { const r = last.sets[0]; return { runs: [...r.runs], st: [...r.st], rox: r.rox }; }
  const gb = id => (S.goals.find(g => g.id === id) || goalDef(id)).base;
  return { runs: Array(8).fill(gb('hx_run')), st: HX_STATIONS.map(([k]) => gb('hx_' + k)), rox: gb('hx_rox') };
}
function raceForm() {
  const r = F.race || (F.race = raceSeed()), total = sum(r.runs) + sum(r.st) + (+r.rox || 0), prev = sessionsFor('hx_race').at(-1);
  const inp = (path, i, v) => ` <input ${TIN} placeholder="m:ss" value="${v ? fmtTime(v) : ''}" onchange="setRace('${path}',${i},this.value)">`;
  return `<div class="panel hxpanel"><div class="ph"><b class="en">🟨 Hyrox race</b><small class="muted">${hxDivLabel()}</small></div>
    <p class="muted">${prev ? `Prefilled from ${fmtDate(prev.date)}.` : 'Prefilled from your goal baselines.'} Enter each split as m:ss.</p>
    <div class="racegrid"><span></span><small>Run</small><small>Station</small>
    ${HX_STATIONS.map(([k, n], i) => `<b>${i + 1}</b>${inp('runs', i, r.runs[i])}<label>${inp('st', i, r.st[i])}<small>${n}${hxWeight(k) ? ' · ' + hxWeight(k) : ''}</small></label>`).join('')}
    <b>⇄</b><label class="span2">${inp('rox', 0, r.rox)}<small>Roxzone total (all transitions)</small></label></div>
    <div class="racetotal"><span>Total</span><b>${fmtTime(total)}</b>${prev ? `<em class="${total < prev.key ? 'up' : 'down'}">${total < prev.key ? '−' : '+'}${fmtTime(Math.abs(total - prev.key))} vs last</em>` : ''}</div></div>`;
}
window.setRace = (path, i, v) => { const t = parseTime(v); if (path === 'rox') F.race.rox = t; else F.race[path][i] = t; render(); };
function saveRace() {
  const r = F.race || raceSeed(), total = sum(r.runs) + sum(r.st) + (+r.rox || 0);
  const res = saveSession('hx_race', [{ runs: r.runs.map(Number), st: r.st.map(Number), rox: +r.rox || 0, total }], true, 'hyrox');
  const pbs = [];
  const derive = (id, time) => {
    if (!(time > 0)) return; const best = bestKey(id), x = mkSession(id, today(), [{ time }]); x.derived = 'race'; x.pb = best != null && time < best; S.sessions.push(x);
    const g = S.goals.find(g => g.id === id); if (g && best == null) g.base = time;
    if (x.pb) { pbs.push(id); S.pbCount++; addXP(25, 'station PB', true); }
  };
  HX_STATIONS.forEach(([k], i) => derive('hx_' + k, +r.st[i]));
  derive('hx_run', Math.round(sum(r.runs) / 8)); derive('hx_rox', +r.rox); derive('hx_full', total);
  res.cur.stationPBs = pbs.filter(id => goalDef(id).station).length; res.cur.pbList = pbs;
  if (pbs.length) celebrate(); save();
  return res;
}
// Split breakdown: stacked bars (this race vs previous) + per-segment table
function raceChart(cur, prev) {
  const segs = r => { const out = []; for (let i = 0; i < 8; i++) { out.push(['run', `Run ${i + 1}`, +r.runs[i] || 0]); out.push(['st', HX_STATIONS[i][1], +r.st[i] || 0, i]); } out.push(['rox', 'Roxzone', +r.rox || 0]); return out; };
  const a = segs(cur.sets[0]), b = prev ? segs(prev.sets[0]) : null, max = Math.max(cur.key, prev?.key || 0), W = 340, L = 64;
  const bar = (sg, y, label, tot) => { let x = L; return `<text x="0" y="${y + 17}" class="rl">${label}</text>${sg.map(([t, n, v, i], j) => { const w = v / max * (W - L - 4); const r = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, w - 0.6).toFixed(1)}" height="26" class="seg ${t} ${t === 'st' ? 'c' + (i % 2) : t === 'run' ? 'c' + (j / 2 % 2) : ''}"><title>${n}: ${fmtTime(v)}</title></rect>`; x += w; return r; }).join('')}<text x="${Math.min(x + 4, W - 2)}" y="${y + 40}" class="rt" text-anchor="end">${fmtTime(tot)}</text>`; };
  const svg = `<svg viewBox="0 0 ${W} ${b ? 104 : 54}" class="racechart">${bar(a, 4, 'This race', cur.key)}${b ? bar(b, 56, 'Previous', prev.key) : ''}</svg>`;
  const pbSet = new Set(cur.pbList || []);
  const rows = HX_STATIONS.map(([k, n], i) => [n, +cur.sets[0].st[i], b ? +prev.sets[0].st[i] : null, pbSet.has('hx_' + k), hxWeight(k)])
    .concat([['Avg run split', Math.round(sum(cur.sets[0].runs) / 8), b ? Math.round(sum(prev.sets[0].runs) / 8) : null, pbSet.has('hx_run')], ['Roxzone', +cur.sets[0].rox, b ? +prev.sets[0].rox : null, pbSet.has('hx_rox')]]);
  return `${svg}<div class="legend"><i class="lgr"></i>Runs <i class="lgs"></i>Stations <i class="lgx"></i>Roxzone</div>
    <table class="splits"><tr><th>Split</th><th>Time</th><th>vs prev</th></tr>${rows.map(([n, v, pv, pb, w]) => `<tr class="${pb ? 'pb' : ''}"><td>${n}${w ? `<small>${w}</small>` : ''}</td><td>${fmtTime(v)}${pb ? ' 🏆' : ''}</td><td class="${pv == null ? '' : v < pv ? 'up' : v > pv ? 'down' : ''}">${pv == null ? '–' : (v <= pv ? '−' : '+') + fmtTime(Math.abs(v - pv))}</td></tr>`).join('')}</table>`;
}
function racePanel(cur, prev) {
  return `<div class="panel hxpanel ${cur.pb ? 'pbrow' : ''}"><div class="ph"><b>🟨 Hyrox race</b>${cur.pb ? '<span class="pbtag hxtag">RACE PB!</span>' : ''}</div>
    <div class="racetotal"><span>Total</span><b>${fmtTime(cur.key)}</b>${cur.pbList?.length ? `<em class="up">${cur.stationPBs} station PB${cur.stationPBs === 1 ? '' : 's'}</em>` : ''}</div>${raceChart(cur, prev)}</div>`;
}
function hxDivisionPicker() {
  const h = hxCfg(), seg = (key, opts) => `<div class="seg sm">${Object.entries(opts).map(([k, l]) => `<button class="${h[key] === k ? 'on' : ''}" onclick="hxCfg().${key}='${k}';save();render()">${l}</button>`).join('')}</div>`;
  return `<div class="panel hxpanel"><b>🟨 Hyrox division</b>${seg('div', HX_DIV)}${h.div === 'adaptive' ? seg('adapt', HX_ADAPT) : ''}
    <div class="chips">${Object.entries(HX_CAT).filter(([k]) => h.div !== 'adaptive' || ['men', 'women'].includes(k)).map(([k, l]) => `<button class="chip btn ${h.cat === k ? 'on' : ''}" onclick="hxCfg().cat='${k}';save();render()">${l}</button>`).join('')}</div>
    ${h.div !== 'adaptive' && (S.prosthetic || 'left') !== 'none' ? '<p class="muted">With a below-knee prosthetic you may qualify for <b>Adaptive · Lower Limb Minor</b>. Check the HYROX adaptive classification.</p>' : ''}
    <div class="wtable">${HX_STATIONS.filter(([k]) => hxWeight(k)).map(([k, n]) => `<div><span>${n}</span><b>${hxWeight(k)}</b></div>`).join('')}</div></div>`;
}

function hxRacesPanel() {
  const rs = sessionsFor('hx_race'), last = rs.at(-1);
  return `<div class="panel hxpanel"><div class="ph"><b>🟨 Hyrox races</b><button class="sm hxbtn" onclick="startLog('hx_race')">+ Log race</button></div>
    ${last ? `<div class="racetotal"><span>Last · ${fmtDate(last.date)}</span><b>${fmtTime(last.key)}</b><em>PB ${fmtTime(bestKey('hx_race'))}</em></div>${raceChart(last, rs.at(-2))}
    <div class="racelist">${rs.slice().reverse().map(r => `<div><span>${fmtDate(r.date)}</span><b>${fmtTime(r.key)}${r.pb ? ' 🏆' : ''}</b></div>`).join('')}</div>` : '<p class="muted">No races yet. Log one to unlock the Hyrox vest.</p>'}</div>`;
}
const MORE = {
  badges() {
    return `<p class="muted">${S.badges.length}/${Object.keys(BADGES).length} unlocked</p><div class="badges">
      ${Object.entries(BADGES).map(([id, [ic, t]]) => `<div class="badge ${S.badges.includes(id) ? 'on' : ''}"><div class="ic">${ic}</div>${t}</div>`).join('')}</div>
      ${S.habits.override ? '<p class="muted">🔓 Habits were unlocked early, so Earned It badges are forfeited.</p>' : ''}`;
  },
  history() {
    const keys = { ovr: ['Overall', '', '#ff5a1f'], weight: ['Weight', 'kg', '#2ee59d'], ftp: ['FTP', 'W', '#ffb020'], wkg: ['W/kg', '', '#5aa9ff'] };
    const [lbl, unit, col] = keys[R.histKey];
    const tgt = { weight: S.metrics.weight.target, ftp: S.metrics.ftp.target, wkg: S.metrics.ftp.target / S.metrics.weight.target }[R.histKey];
    const pts = S.log.map(e => ({ d: e.date, y: R.histKey === 'wkg' ? +(e.ftp / e.weight).toFixed(2) : e[R.histKey] })).filter(p => p.d >= sinceRange(R.range));
    const first = pts[0], last = pts.at(-1), delta = first && last ? last.y - first.y : 0;
    return `<div class="seg sm">${Object.entries(keys).map(([k, v]) => `<button class="${R.histKey === k ? 'on' : ''}" onclick="R.histKey='${k}';render()">${v[0]}</button>`).join('')}</div>
      <div class="panel"><div class="ph"><div><small class="muted">${lbl.toUpperCase()}</small><div class="kpi">${last ? fmtNum(last.y) : '–'}<small> ${unit}</small></div></div>
        ${first ? `<span class="delta ${(R.histKey === 'weight' ? -delta : delta) > 0 ? 'up' : delta ? 'down' : ''}">${delta >= 0 ? '+' : ''}${fmtNum(delta)} ${unit}</span>` : ''}</div>
        ${rangeSeg()}${lineChart(pts, { target: tgt, unit, color: col, label: lbl })}</div>
      ${S.log.length < 2 ? '<p class="muted">Check in a few days to see your trend.</p>' : ''}
      ${S.habits.weekLog.length ? `<div class="panel"><h3>Habit weeks</h3><div class="hweeks">${S.habits.weekLog.slice(-12).map(w => `<div class="${w.strong ? 'hit' : ''}" title="${w.week}"><i style="height:${w.hits / 7 * 100}%"></i><small>${w.hits}</small></div>`).join('')}</div></div>` : ''}`;
  },
  share() {
    const sh = S.share;
    return `<p class="muted">One tap card for stories and posts. Weight and photos stay off unless you switch them on.</p>
      <div class="seg sm">${[['story', '9:16 story'], ['square', 'Square']].map(([k, l]) => `<button class="${(sh.fmt || 'story') === k ? 'on' : ''}" onclick="S.share.fmt='${k}';save();render()">${l}</button>`).join('')}</div>
      <div class="seg sm">${[['dark', 'Dark'], ['light', 'Light'], ['sticker', 'Overlay sticker']].map(([k, l]) => `<button class="${(sh.theme || 'dark') === k ? 'on' : ''}" onclick="S.share.theme='${k}';save();render()">${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" ${sh.weight ? 'checked' : ''} onchange="S.share.weight=this.checked;save();render()"> Show my weight</label>
      <label class="check ${PHOTOS.length ? '' : 'dis'}"><input type="checkbox" ${sh.photo ? 'checked' : ''} ${PHOTOS.length ? '' : 'disabled'} onchange="S.share.photo=this.checked;save();render()"> Use my latest progress photo as the background</label>
      <div class="sharewrap ${(sh.theme || 'dark') === 'sticker' ? 'checker' : ''} ${sh.fmt === 'square' ? 'sq' : ''}"><img id="shareimg" alt="share card preview"></div>
      <div class="row"><button onclick="shareCard()">Share ↗</button><button class="ghost" onclick="downloadCard()">Download PNG</button></div>`;
  },
  settings() {
    const rows = ['weight', 'ftp'].map(k => { const m = S.metrics[k]; return `<div class="panel"><b>${m.label}</b><div class="grid3">
      <div><label>Baseline</label><input type="number" step="any" value="${m.base}" onchange="setMetric('${k}','base',this.value)"></div>
      <div><label>Target</label><input type="number" step="any" value="${m.target}" onchange="setMetric('${k}','target',this.value)"></div>
      <div><label>Now</label><input type="number" step="any" value="${m.current}" onchange="setMetric('${k}','current',this.value)"></div></div></div>`; }).join('');
    return `<h3>Intensity</h3><p class="muted">Drop down any time. Moving up earns the 📈 badge.</p>${modePicker(S.persona, 'pickPersona')}
      <h3>Tracking</h3>${depthPicker(S.depth, 'pickDepth')}
      <h3>Sports & goals</h3><div class="panel"><p class="muted">${S.sports.map(sportName).join(' · ')}<br>${activeGoals(S).length} active goals${S.goals.some(g => g.status === 'parked') ? `, ${S.goals.filter(g => g.status === 'parked').length} parked` : ''}</p><button class="ghost wide" onclick="go('goals')">Edit sports & goals</button></div>
      <h3>Profile</h3><div class="panel"><label>Name on card</label><input value="${esc(S.name)}" onchange="S.name=this.value;save()">
      </div>${S.sports.includes('hyrox') ? '<h3>Hyrox</h3>' + hxDivisionPicker() : ''}<h3>Avatar</h3><div class="panel avedit"><div class="avprev">${avatarSVG({ mood: 'idle', size: 220 })}</div>
        <label>Skin tone</label><div class="sw">${SKINS.map(c => `<button style="background:${c}" class="${avatarState().skin === c ? 'on' : ''}" onclick="setAv('skin','${c}')" aria-label="skin ${c}"></button>`).join('')}</div>
        <label>Hair</label><div class="chips">${Object.entries(HAIRS).map(([k, l]) => `<button class="chip btn ${avatarState().hair === k ? 'on' : ''}" onclick="setAv('hair','${k}')">${l}</button>`).join('')}</div>
        <div class="sw">${HAIR_COLS.map(c => `<button style="background:${c}" class="${avatarState().hairCol === c ? 'on' : ''}" onclick="setAv('hairCol','${c}')" aria-label="hair colour ${c}"></button>`).join('')}</div>
        <label>Beard</label><div class="chips">${Object.entries(BEARDS).map(([k, l]) => `<button class="chip btn ${avatarState().beard === k ? 'on' : ''}" onclick="setAv('beard','${k}')">${l}</button>`).join('')}</div>
        <label>Prosthetic (drawn on the avatar and sample photos)</label><div class="seg sm">${[['left', 'Left below-knee'], ['right', 'Right below-knee'], ['none', 'None']].map(([k, l]) => `<button class="${(S.prosthetic || 'left') === k ? 'on' : ''}" onclick="S.prosthetic='${k}';save();render()">${l}</button>`).join('')}</div>
        <label>Kit <small>(earned with badges and levels)</small></label><div class="kit">${Object.entries(KIT).map(([k, [n, ic, req, t]]) => { const un = t(S), on = un && avatarState().kit[k];
          return `<button class="${on ? 'on' : ''} ${un ? '' : 'locked'}" ${un ? `onclick="toggleKit('${k}')"` : 'disabled'}><span>${un ? ic : '🔒'}</span><b>${n}</b><small>${un ? (on ? 'Equipped' : 'Tap to wear') : req}</small></button>`; }).join('')}</div></div>
      <h3>Body</h3>${rows}
      <div class="row"><button class="ghost" onclick="exportData()">Export data (JSON)</button>
      <button class="ghost danger" onclick="if(confirm('Wipe all data, including photos?')){localStorage.removeItem(STORE_KEY);localStorage.removeItem(V1_KEY);indexedDB.deleteDatabase('fitquest-photos');location.reload()}">Reset all</button></div>
      <p class="muted center">Fit Quest v3 · all data stays in this browser</p>`;
  },
};
const rangeSeg = () => `<div class="range">${[['4w', '4W'], ['3m', '3M'], ['all', 'All']].map(([k, l]) => `<button class="${R.range === k ? 'on' : ''}" onclick="R.range='${k}';render()">${l}</button>`).join('')}</div>`;

function goalView(id) {
  const g = S.goals.find(x => x.id === id); if (!g) { R.ex = null; return VIEWS.train(); }
  const L = goalDef(id), K = KINDS[L.kind], ss = sessionsFor(id), last = ss.at(-1), best = bestKey(id), p = goalProgress(g), build = L.type === 'build', tm = isTimeKind(L);
  const seed = last ? last.sets : seedSets(id);
  const ftp = L.id === 'cyc_ftp' && best ? '' : '';
  return `<button class="back" onclick="go('train')">‹ Goals</button>
    <div class="ph ${L.hx ? 'hxhead' : ''}"><h2>${L.name}</h2><button class="howbtn" onclick="howto('${id}')">ⓘ How to</button><span class="pill">${sportName(L.sport)}${build ? ' · build-up' : ' · test'}</span></div>${L.note ? `<p class="muted">${L.note}</p>` : ''}${L.station && hxWeight(L.station) ? `<p class="hxw big">${hxDivLabel()}: <b>${hxWeight(L.station)}</b></p>` : ''}
    ${g.status === 'parked' ? `<div class="panel warn">⏸️ Parked on ${fmtDate(g.parkedOn || today())}: no baseline within ${BASELINE_DAYS} days. It's kept but left out of your rating.<button class="wide" onclick="reactivateGoal('${id}')">Re-activate (new ${BASELINE_DAYS}-day window)</button></div>`
      : !g.baselineDate ? `<div class="panel note">🎯 ${baselineText(g)}</div>` : ''}
    <div class="tiles"><div class="tile"><b>${best != null ? fmtVal(L, best) : '–'}</b><small>${K.keyLabel.includes('PB') ? K.keyLabel : K.keyLabel + ' PB'}</small></div><div class="tile"><b>${build && best == null ? fmtNum(longestIn(L.sport)) : fmtVal(L, g.target)}</b><small>${build && best == null ? `longest of ${L.dist} km` : 'Target'}</small></div><div class="tile"><b>${Math.round(p * 100)}%</b><small>to target</small></div></div>
    <div class="panel"><div class="ph"><h3>${build ? 'Build-up: longest ' + SPORTS[L.sport][1].toLowerCase() : 'History'}</h3>${rangeSeg()}</div>
      ${barChart(exSeries(id, R.range), build ? { target: L.dist, unit: 'km', label: L.name } : { target: g.target, unit: tm ? '' : K.unit, label: L.name, fmt: tm ? fmtTime : null, invert: !!K.lower })}
      <p class="muted legend"><i class="lgb"></i>${build ? 'Longest so far' : 'Attempt'} <i class="lgpb"></i>PB <i class="lgt"></i>Target${KINDS[L.kind].lower && !build ? ' · faster = taller' : ''}</p></div>
    <div class="panel"><h3>${build ? 'Log a full-distance finish' : 'Log an attempt'}</h3>
      <div id="sets">${seed.map((s, i) => setRow(L, s, i)).join('')}</div>
      <div class="row">${L.kind === 'rm' ? '<button class="ghost" onclick="addSet()">+ Set</button>' : ''}<button onclick="logSession('${id}')">Save</button></div><div id="cmpout"></div></div>
    ${ss.length ? `<div class="panel"><h3>Attempts</h3>${ss.slice().reverse().slice(0, 12).map(x => `<div class="sess"><b>${fmtDate(x.date)}</b><span>${x.sets.map(s => setText(L, s)).join(' · ')}</span><em>${fmtVal(L, x.key)} ${x.pb ? '🏆' : ''}</em></div>`).join('')}</div>` : ''}
    <details class="panel"><summary>Edit target</summary><div class="grid2"><div><label>Start</label><input ${tm ? TIN : 'type="number" inputmode="decimal" step="any"'} value="${tm ? fmtTime(g.base) : g.base}" onchange="setEx('${id}','base',this.value)"></div>
      <div><label>Target</label><input ${tm ? TIN : 'type="number" inputmode="decimal" step="any"'} value="${tm ? fmtTime(g.target) : g.target}" onchange="setEx('${id}','target',this.value)"></div></div>
      <button class="ghost danger" onclick="removeEx('${id}')">Remove goal (attempts are kept)</button></details>`;
}
const exerciseView = goalView;
const setRow = (L, s, i) => `<div class="setrow"><span>${i + 1}</span>${KINDS[L.kind].fields.map(([f, lbl, step, opt, typ]) => `<label><input ${typ === 'time' ? `${TIN} placeholder="mm:ss"` : `type="number" inputmode="decimal" step="${step}" placeholder="0"`} data-f="${f}" data-t="${typ || ''}" value="${s[f] == null ? '' : typ === 'time' ? fmtTime(s[f]) : s[f]}">${lbl}</label>`).join('')}<button class="x" onclick="this.parentNode.remove()">✕</button></div>`;
const setText = (L, s) => { const k = L.kind; if (k === 'race') return `race ${fmtTime(s.total)}`; return k === 'rm' ? `${s.reps}×${s.kg}kg` : k === 'reps' ? `${s.reps} reps` : k === 'hold' ? `${s.sec}s` : k === 'watts' ? `${s.watts}W` : k === 'far' ? `${s.km}km` : k === 'session' ? `${s.min} min${s.km ? ` · ${s.km}km` : ''}` : fmtTime(s.time); };

const AFTER = {
  more() { if (R.more === 'share') renderSharePreview(); },
  photos() { bindCompare(); },
};

/* ---------- 11) ACTIONS ---------- */
window.obPersona = p => { S.persona = p; S.goals = seedGoals(p); S.habits.slots = START_SLOTS[p]; S.habits.active = []; fillSlots(); S.onboardStep = 1; save(); render(); };
window.obDepth = d => { S.depth = d; S.onboardStep = 2; save(); render(); };
window.obMetric = (k, f, v) => { S.metrics[k][f] = parseFloat(v); if (f === 'current') S.metrics[k].base = parseFloat(v); save(); };
window.obFinish = () => { S.onboarded = true; S.modeHistory.push({ date: today(), persona: S.persona }); S.habits.start = today(); save(); R.tab = 'home'; render(); toast(`${PERSONAS[S.persona].icon} ${PERSONAS[S.persona].name} mode activated`); };
window.pickPersona = p => { if (p === S.persona) return; const up = PERSONAS[p].rank > PERSONAS[S.persona].rank; setPersona(p); applyMissedDays(); render(); toast(`${PERSONAS[p].icon} ${PERSONAS[p].name} mode${up ? ' · moved up!' : ''}`); };
window.pickDepth = d => { S.depth = d; save(); render(); toast(`Tracking: ${DEPTHS[d].name}`); };
window.setMetric = (k, f, v) => { S.metrics[k][f] = parseFloat(v); save(); };

// Quick Weight / FTP sheet from Home › How I'm tracking (body metrics, not Bodyweight sport)
let Q = null;
window.metricSheet = k => {
  const m = S.metrics[k], isW = k === 'weight', unit = isW ? 'kg' : 'W', step = isW ? 0.1 : 1;
  Q = { k, v: m.current, start: m.current };
  modal(`<div class="qmetric"><h2>${isW ? '⚖️ Weigh-in' : '🚴 Update FTP'}</h2>
    <p class="muted">Target ${isW ? fmtNum(m.target) + ' kg' : Math.round(m.target) + ' W'}${isW ? '' : ` · current W/kg ${wkg(S).toFixed(2)}`}</p>
    <div class="stp big"><button type="button" onclick="bumpQ(-${step})">−</button>
      <label><input type="number" id="q-v" inputmode="decimal" step="${step}" value="${isW ? m.current : Math.round(m.current)}" onchange="Q.v=parseFloat(this.value)"><small>${unit}</small></label>
      <button type="button" onclick="bumpQ(${step})">+</button></div>
    <button class="wide" onclick="saveMetric()">Save</button>
    <button class="wide ghost" onclick="closeModal()">Cancel</button></div>`);
};
window.bumpQ = d => {
  if (!Q) return;
  Q.v = Math.max(0, Math.round(((+Q.v || 0) + d) * 10) / 10);
  const inp = $('#q-v'); if (inp) inp.value = Q.k === 'weight' ? Q.v : Math.round(Q.v);
};
window.saveMetric = () => {
  if (!Q) return;
  const inp = $('#q-v'), raw = inp ? parseFloat(inp.value) : Q.v;
  if (!(raw > 0)) return toast('Enter a value', true);
  const k = Q.k, start = Q.start, v = k === 'weight' ? raw : Math.round(raw);
  if (v === start) { closeModal(); return toast('No change'); }
  if (k === 'weight') {
    const lowest = v < Math.min(start, ...S.log.map(e => e.weight));
    S.metrics.weight.current = v;
    addXP(XP.weighin, 'weigh-in', true);
    if (lowest) { S.pbCount++; addXP(XP.pb, 'PB', true); pbMoment(`${fmtNum(v)} kg`, 'Lowest weight'); }
    toast(`⚖️ ${fmtNum(v)} kg logged`, true);
  } else {
    const highest = v > Math.max(start, ...S.log.map(e => e.ftp));
    S.metrics.ftp.current = v;
    if (highest) { S.pbCount++; addXP(XP.pb, 'NEW PB!', true); pbMoment(`FTP ${v} W`, 'New FTP'); }
    toast(`🚴 FTP ${v} W`, true);
  }
  markActiveDay(); logPoint(); checkBadges(); save(); Q = null; closeModal();
  if (R.tab === 'home') render(); else go('home');
};

window.doCheckin = () => {
  const m = S.metrics, num = k => parseFloat($('#in-' + k).value);
  const pbFtp = num('ftp') > Math.max(m.ftp.current, ...S.log.map(e => e.ftp));
  const pbWt = num('weight') < Math.min(m.weight.current, ...S.log.map(e => e.weight));
  const weighedIn = num('weight') !== m.weight.current;
  const first = !S.log.some(e => e.date === today());
  for (const k of ['weight', 'ftp']) if (Number.isFinite(num(k))) m[k].current = num(k);
  markActiveDay();
  if (first) { addXP(XP.checkin, 'check-in'); if (weighedIn) addXP(XP.weighin, 'weigh-in'); }
  if (pbFtp || pbWt) { addXP(XP.pb, 'NEW PB!'); S.pbCount++; pbMoment(pbFtp ? `FTP ${m.ftp.current} W` : `${m.weight.current} kg`, pbFtp ? 'New FTP' : 'Lowest weight'); }
  logPoint(); checkBadges(); save(); go('card');
};
function logPoint() { S.log = S.log.filter(e => e.date !== today()); S.log.push({ date: today(), ovr: overall(S), ftp: S.metrics.ftp.current, weight: S.metrics.weight.current }); }

window.tickHabit = (id, noRender) => {
  const H = S.habits, rec = H.days[today()] || (H.days[today()] = { done: [], n: H.active.length });
  rec.n = H.active.length;
  const wasHit = dayHit(rec);
  rec.done = rec.done.includes(id) ? rec.done.filter(x => x !== id) : [...rec.done, id];
  rec.done = rec.done.filter(x => H.active.includes(x));
  if (!wasHit && dayHit(rec) && !rec.xp) { rec.xp = 1; markActiveDay(); addXP(XP.habitDay, 'all habits done'); logPoint(); }
  checkBadges(); save(); if (!noRender) render();
};
window.activateHabit = id => { const H = S.habits; if (H.active.length >= H.slots) return; H.active.push(id); H.pendingSlot = false; S.lastUnlock = `${habit(id).icon} ${habit(id).label}`; if (H.days[today()]) H.days[today()].n = H.active.length; save(); render(); toast(`Habit added: ${habit(id).label}`); };
window.addWish = () => { const v = $('#wish').value.trim(); if (!v) return; S.habits.wishlist.push({ id: 'w_' + uid(), label: v }); save(); render(); };
window.dropWish = id => { S.habits.wishlist = S.habits.wishlist.filter(w => w.id !== id); save(); render(); };
window.overrideHabits = () => {
  if (!confirm('Unlock every habit now? You lose the "Earned It" badges for good. Earning them is the point, but it is your call.')) return;
  const H = S.habits; H.override = true; H.slots = HABITS.length + H.wishlist.length; H.active.push(...H.paused); H.paused = []; fillSlots();
  for (const w of H.wishlist) if (!H.active.includes(w.id)) H.active.push(w.id);
  S.badges = S.badges.filter(b => b !== 'earned' && b !== 'allhabits'); save(); render(); toast('All habits unlocked');
};

window.tickItem = (i, on) => { S.challenge.todays[i] = on; save(); render(); };
window.completeDay = () => {
  const c = S.challenge, I = IRON[S.persona];
  if (!I.items.every((_, i) => c.todays[i])) {
    if (I.onMiss === 'strict') { c.day = 0; c.todays = {}; c.startDate = null; save(); render(); return toast('💀 Item missed. Back to Day 0. Stay hard.'); }
    return toast('Tick every task to bank the day');
  }
  if (!c.startDate) c.startDate = today();
  c.day = Math.min(I.days, c.day + 1); c.lastDate = today();
  addXP(XP.challengeDay, `Iron Day ${c.day}`);
  if (c.day === I.days) { c.completed++; pbMoment(`Iron ${I.days}`, 'Challenge complete'); c.day = 0; c.startDate = null; S.lastUnlock = `👑 Iron ${I.days} finished`; }
  checkBadges(); save(); render();
};

// Sports & goals
window.toggleSport = k => { S.sports = S.sports.includes(k) ? S.sports.filter(x => x !== k) : [...S.sports, k]; save(); render(); };
window.toggleGoal = id => {
  const g = S.goals.find(x => x.id === id);
  if (g) { if (sessionsFor(id).length && !confirm('Remove this goal? Your attempts are kept.')) return; S.goals = S.goals.filter(x => x.id !== id); }
  else {
    const sp = goalDef(id).sport;
    if (activeIn(sp).length >= capFor(sp)) return capModal(id);
    S.goals.push(newGoal(id, S.persona)); S.goalWish[sp] = (S.goalWish[sp] || []).filter(x => x !== id);
  }
  save(); render();
};
function capModal(id) {
  const L = goalDef(id), sp = L.sport, n = SPORTS[sp][1];
  modal(`<div class="capmodal"><div class="capic">🧱</div><h2>Are you sure?</h2><p><b>Building up works better.</b> You already have ${activeIn(sp).length}/${capFor(sp)} ${n.toLowerCase()} goals. Lock in their baselines, and after 2 weeks you earn another slot.</p>
    <button class="wide" onclick="capWish('${id}')">Build up instead</button><p class="muted small">Adds <b>${L.name}</b> to your ${n} wishlist. We'll suggest it when the slot unlocks.</p>
    <button class="wide ghost" onclick="capOverride('${id}')">Override</button><p class="muted small">⚠️ Adds it now, but you give up the <b>Earned It: ${n}</b> badge.</p></div>`);
}
window.capWish = id => { const sp = goalDef(id).sport; S.goalWish[sp] = [...new Set([...(S.goalWish[sp] || []), id])]; save(); closeModal(); render(); toast(`📝 ${goalDef(id).name} added to your ${SPORTS[sp][1]} wishlist`, true); };
window.capOverride = id => { const sp = goalDef(id).sport, g = newGoal(id, S.persona); g.overridden = true; S.goals.push(g); S.goalOverride[sp] = true;
  S.goalWish[sp] = (S.goalWish[sp] || []).filter(x => x !== id); save(); closeModal(); render(); toast(`⚠️ Over the ${SPORTS[sp][1]} goal cap. Earned It badge forfeited`, true); };
window.unwish = id => { const sp = goalDef(id).sport; S.goalWish[sp] = (S.goalWish[sp] || []).filter(x => x !== id); save(); render(); };
window.setGoalTarget = (id, v) => { const g = S.goals.find(x => x.id === id), L = goalDef(id); g.target = isTimeKind(L) ? parseTime(v) : parseFloat(v); g.targetEdited = true; save(); };
window.reactivateGoal = id => { const g = S.goals.find(x => x.id === id); Object.assign(g, { status: 'active', since: today(), baselineDate: null, parkedOn: null }); save(); render(); toast(`🎯 ${goalDef(id).name} is back. ${BASELINE_DAYS} days to set a baseline.`); };
window.removeEx = id => { if (!confirm('Remove this goal? Attempts are kept.')) return; S.goals = S.goals.filter(e => e.id !== id); save(); go('train'); };
window.setEx = (id, f, v) => { const g = S.goals.find(x => x.id === id), L = goalDef(id); g[f] = isTimeKind(L) ? parseTime(v) : parseFloat(v); if (f === 'target') g.targetEdited = true; save(); render(); };
window.addSet = () => {
  const L = goalDef(R.ex), rows = document.querySelectorAll('#sets .setrow'), lastRow = rows[rows.length - 1];
  const vals = lastRow ? readRow(lastRow) : {};
  $('#sets').insertAdjacentHTML('beforeend', setRow(L, vals, rows.length));
};
const readRow = r => Object.fromEntries([...r.querySelectorAll('input')].map(i => [i.dataset.f, i.dataset.t === 'time' ? parseTime(i.value) : parseFloat(i.value)]));
window.logSession = id => {
  const L = goalDef(id), sets = cleanSets(L, [...document.querySelectorAll('#sets .setrow')].map(readRow));
  if (!sets.length) return toast('Enter a complete result');
  const { prev, cur } = saveSession(id, sets, false); updateBaselines(); checkBadges(); save(); render();
  $('#cmpout').innerHTML = `<div class="cmp">${prev ? `<small>vs ${fmtDate(prev.date)}</small>` : ''}${compare(prev, cur, L).map(x => `<span class="${x.cls}">${x.txt}</span>`).join('')}</div>`;
};
// Core save used by the goal screen and the post-workout flow. quiet = no toasts/PB overlay.
function saveSession(id, sets, quiet, sport) {
  const L = goalDef(id), prev = sessionsFor(id).at(-1), prevBest = bestKey(id);
  const cur = mkSession(id, today(), sets); if (sport) cur.sport = sport;
  cur.pb = id !== 'session' && prevBest != null && isBetter(L, cur.key, prevBest);
  const g = S.goals.find(x => x.id === id);
  if (g && prevBest == null && id !== 'session') { // first attempt is the baseline; re-anchor the target if it's already beaten
    g.base = cur.key; if (!g.targetEdited && !isBetter(L, g.target, cur.key)) g.target = roundFor(L, cur.key + (L.target - L.base) * 0.5 * PERSONAS[S.persona].targetMult);
  }
  S.sessions.push(cur);
  if (id === 'cyc_ftp' && cur.key > S.metrics.ftp.current) S.metrics.ftp.current = Math.round(cur.key);
  const firstToday = !S.sessions.some(x => x !== cur && x.date === today());
  addXP(firstToday ? XP.session : 10, 'logged', quiet || cur.pb);
  if (cur.pb) { celebrate(); S.pbCount++; addXP(XP.pb, 'PB bonus', true); if (!quiet) pbMoment(fmtVal(L, cur.key), `${L.name} · +${Math.round(XP.pb * PERSONAS[S.persona].xpMult)} XP`); }
  markActiveDay(); logPoint(); checkBadges(); save();
  return { cur, prev };
}
function pbMoment(big, small) {
  const el = $('#pb'); el.innerHTML = `<div class="burst"></div><div class="pbt">PB!</div><div class="pbv">${esc(big)}</div><div class="pbs">${esc(small)}</div>`;
  el.classList.remove('hidden'); el.onclick = () => el.classList.add('hidden'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.add('hidden'), 2600);
  navigator.vibrate?.([60, 40, 120]);
}

// Modal
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet"><div class="handle" aria-hidden="true"></div><button class="x close" onclick="closeModal()">✕</button>${html}</div>`; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  const sh = m.querySelector('.sheet'); let y0 = null, dy = 0; // swipe down to close
  sh.addEventListener('touchstart', e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', () => { if (y0 != null && dy > 90) closeModal(); else sh.style.transform = ''; y0 = null; }); }
window.closeModal = () => { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; stopCam(); };

// Photos
let stream = null;
function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
window.openCamera = async () => {
  const ghost = photosOf(R.pose).at(-1);
  if (!navigator.mediaDevices?.getUserMedia) return $('#photoFile').click();
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false }); }
  catch (e) { toast('Camera not available, choose a photo instead'); return $('#photoFile').click(); }
  modal(`<h2>${R.pose} photo</h2><div class="cam"><video id="vid" autoplay playsinline muted></video>${ghost ? `<img class="ghost" src="${URLS[ghost.id]}" alt="">` : '<div class="guide"></div>'}</div>
    <p class="muted center">${ghost ? 'Line up with the ghost of last week for a consistent pose.' : 'Stand centred, full body in frame.'}</p><button class="wide shutter" onclick="snap()">◉ Capture</button>`);
  $('#vid').srcObject = stream;
};
window.snap = async () => {
  const v = $('#vid'), c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); closeModal(); await savePhoto(blob, R.pose); render(); toast(`${R.pose} photo saved on this device`);
};
window.pickPhoto = async inp => { const f = inp.files[0]; if (!f) return; await savePhoto(await downscale(f), R.pose); render(); toast(`${R.pose} photo saved on this device`); };
window.delPhoto = async id => { if (!confirm('Delete this photo?')) return; await idb.del(id); URL.revokeObjectURL(URLS[id]); delete URLS[id]; await loadPhotos(); save(); render(); };
function bindCompare() {
  const box = $('#cmp'); if (!box) return;
  const set = x => { const r = box.getBoundingClientRect(), p = Math.max(0, Math.min(100, (x - r.left) / r.width * 100)); box.querySelector('.cl').style.width = p + '%'; box.querySelector('.handle').style.left = p + '%'; };
  box.onpointerdown = e => { box.setPointerCapture(e.pointerId); set(e.clientX); box.onpointermove = ev => set(ev.clientX); };
  box.onpointerup = () => { box.onpointermove = null; };
}
let lapse = null;
window.lapseTo = i => { const l = photosOf(R.pose), p = l[i]; if (!p) return; $('#tlimg').src = URLS[p.id]; $('#tltag').textContent = `${fmtDate(p.date)} · LV ${p.level}${p.weight ? ` · ${p.weight}kg` : ''}`; $('#tlr').value = i; };
window.toggleLapse = () => {
  if (lapse) { clearInterval(lapse); lapse = null; $('#tlbtn').textContent = '▶ Play'; return; }
  let i = +$('#tlr').value; $('#tlbtn').textContent = '⏸ Pause';
  lapse = setInterval(() => { if (!$('#tlimg')) { clearInterval(lapse); lapse = null; return; } i = (i + 1) % photosOf(R.pose).length; lapseTo(i); }, 600);
};

// Share
let shareCanvas = null;
const shareOpts = () => ({ weight: S.share.weight, photo: S.share.photo && PHOTOS.length, photoUrl: PHOTOS.length ? URLS[PHOTOS.at(-1).id] : null });
async function renderSharePreview() {
  shareCanvas = await drawShare(S.share.fmt || 'story', S.share.theme || 'dark', shareOpts());
  const img = $('#shareimg'); if (img) img.src = shareCanvas.toDataURL('image/png');
}
const shareName = () => `fit-quest-${S.share.fmt || 'story'}-${S.share.theme || 'dark'}-${today()}.png`;
window.downloadCard = () => { if (!shareCanvas) return; const a = document.createElement('a'); a.href = shareCanvas.toDataURL('image/png'); a.download = shareName(); a.click(); };
window.shareCard = async () => {
  if (!shareCanvas) return;
  const blob = await new Promise(r => shareCanvas.toBlob(r, 'image/png')), file = new File([blob], shareName(), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Fit Quest' }); } catch (e) {} }
  else { downloadCard(); toast('Saved. Share it from your photos.'); }
};
window.exportData = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = `fit-quest-${today()}.json`; a.click(); };

/* ---------- 12) BOOT + DEMO ---------- */
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.tab));

// ?demo seeds 8 weeks of sample data (replaces local data, generates sample silhouette photos)
async function seedDemo() {
  S = freshState(); S.persona = 'athlete'; S.onboarded = true; S.habits.slots = 3; S.sports = ['run', 'cycle', 'swim', 'hyrox', 'strength', 'bodyweight'];
  const start = addDays(today(), -55); S.habits.start = start;
  const rnd = (i, k) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  for (let i = 0; i <= 55; i++) {
    const d = addDays(start, i), t = i / 55;
    S.metrics.ftp.current = Math.round(240 + 22 * t); S.metrics.weight.current = +(102.8 - 4.6 * t + Math.abs(rnd(i, 1)) * 0.4).toFixed(1);
    const rec = { done: [], n: S.habits.active.length };
    for (const h of S.habits.active) if (Math.abs(rnd(i, h.length)) > (i < 28 ? 0.45 : 0.08) || i % 7 < 4) rec.done.push(h);
    S.habits.days[d] = rec;
    S.streak = i + 1; S.bestStreak = S.streak; S.lastCheckin = d; S.xp += 70;
    S.log.push({ date: d, ovr: 0, ftp: S.metrics.ftp.current, weight: S.metrics.weight.current });
    if (i % 7 === 6) { todayOverride = addDays(d, 1); evaluateHabitWeeks(); todayOverride = null; }
  }
  S.goals = ['run_5k', 'run_21', 'cyc_ftp', 'cyc_100', 'swim_400', 'swim_1900', 'str_trapdl_1', 'str_bench_5', 'bw_pullup', 'bw_plank', 'hx_full', 'hx_run', 'hx_push'].map(id => ({ ...newGoal(id, 'athlete'), since: start }));
  // [goal, start value, change per week (negative = faster)]
  const plan = { run_5k: [Tm(29, 40), -14], cyc_ftp: [253, 2.6], cyc_5min: [300, 4], swim_400: [Tm(9, 20), -6], str_trapdl_1: [130, 2], str_bench_5: [65, 0.8], bw_pullup: [4, 0.4], bw_plank: [60, 9] };
  for (const [id, [b, step]] of Object.entries(plan)) {
    const L = goalDef(id);
    for (let w = 0; w < 8; w++) {
      if (L.sport === 'run' || L.sport === 'swim' ? w % 2 : 0) continue; // timed tests every 2 weeks
      const d = addDays(start, w * 7 + 1 + (id.length % 3)), v = b + step * w * (0.85 + Math.abs(rnd(w, id.length)) * 0.3) - (w === 5 ? step * 1.5 : 0);
      const sets = L.kind === 'rm' ? [{ reps: L.n, kg: Math.round(v / 2.5) * 2.5 }, { reps: L.n, kg: Math.round(v * 0.95 / 2.5) * 2.5 }] : L.kind === 'reps' ? [{ reps: Math.round(v) }]
        : L.kind === 'hold' ? [{ sec: Math.round(v / 5) * 5 }] : L.kind === 'watts' ? [{ watts: Math.round(v) }] : [{ time: Math.round(v) }];
      S.sessions.push(mkSession(id, d, sets, w * 10));
    }
  }
  // general sessions: long runs, rides and swims building toward the long goals
  for (let w = 0; w < 8; w++) {
    S.sessions.push({ id: uid(), t: 1, exId: 'session', sport: 'run', date: addDays(start, w * 7 + 5), sets: [{ min: 50 + w * 9, km: +(8 + w * 1.5).toFixed(1) }], key: null, vol: null });
    S.sessions.push({ id: uid(), t: 2, exId: 'session', sport: 'cycle', date: addDays(start, w * 7 + 6), sets: [{ min: 120 + w * 12, km: 45 + w * 6 }], key: null, vol: null });
    S.sessions.push({ id: uid(), t: 3, exId: 'session', sport: 'swim', date: addDays(start, w * 7 + 3), sets: [{ min: 30 + w * 3, km: +(1.2 + w * 0.12).toFixed(2) }], key: null, vol: null });
  }
  // two Hyrox races (Open Men), the second faster on most splits
  [[18, 1.0], [46, 0.9]].forEach(([day, f], ri) => {
    const d = addDays(start, day), runs = [6.3, 6.0, 6.1, 6.2, 6.1, 6.4, 6.6, 6.8].map((m, i) => Math.round(m * 60 * (ri ? 0.93 : 1) + (rnd(i, ri) * 8))),
      st = HX_STATIONS.map(([k, n, b], i) => Math.round(b * (ri ? (i === 3 ? 1.04 : 0.9) : 1.02))), rox = Math.round(540 * f), total = sum(runs) + sum(st) + rox;
    S.sessions.push(mkSession('hx_race', d, [{ runs, st, rox, total }], 200 + ri));
    HX_STATIONS.forEach(([k], i) => S.sessions.push(mkSession('hx_' + k, d, [{ time: st[i] }], 210 + i)));
    S.sessions.push(mkSession('hx_run', d, [{ time: Math.round(sum(runs) / 8) }], 220), mkSession('hx_rox', d, [{ time: rox }], 221), mkSession('hx_full', d, [{ time: total }], 222));
  });
  markPBs(S.sessions); for (const r of sessionsFor('hx_race')) { const pl = S.sessions.filter(x => x.date === r.date && x.pb && goalDef(x.exId).hx && x.exId !== 'hx_race').map(x => x.exId); r.pbList = pl; r.stationPBs = pl.filter(id => goalDef(id).station).length; }
  S.pbCount = S.sessions.filter(x => x.pb).length;
  for (const g of S.goals) { const first = sessionsFor(g.id)[0]; if (first) g.base = first.key; }
  S.metrics.ftp.current = Math.max(S.metrics.ftp.current, Math.round(bestKey('cyc_ftp')));
  updateBaselines();
  // baseline-week examples: one urgent, one fresh, one parked
  S.goals.push({ ...newGoal('run_10k', 'athlete'), since: addDays(today(), -12) }, { ...newGoal('cyc_tt40', 'athlete'), since: addDays(today(), -5) }, { ...newGoal('swim_css', 'athlete'), since: addDays(today(), -20) });
  updateBaselines();
  S.log.forEach(e => e.ovr = Math.round(40 + (overall(S) - 40) * (0.35 + 0.65 * daysBetween(start, e.date) / 55)));
  S.log.at(-1).ovr = overall(S); S.lastCheckin = addDays(today(), -1);
  delete S.habits.days[today()];
  S.challenge.day = 18; S.challenge.lastDate = addDays(today(), -1); S.challenge.startDate = addDays(today(), -18);
  if (S.habits.slots > S.habits.active.length) S.habits.active.push('steps');
  S.goalWish = { cycle: ['cyc_5min'], hyrox: ['hx_rox', 'hx_wb'], strength: ['str_bench_1'] };
  S.habits.wishlist = [{ id: 'w_acv', label: 'Apple cider vinegar' }, { id: 'w_multi', label: 'Multivitamin' }];
  S.upgraded = false; S.hintSeen = true; checkBadges();
  try { await new Promise(r => { const q = indexedDB.deleteDatabase('fitquest-photos'); q.onsuccess = q.onerror = q.onblocked = r; }); idb.db = null; } catch (e) {}
  for (let w = 0; w < 8; w++) for (const pose of POSES) {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, '#3a3f52'); gr.addColorStop(1, '#1c1f2b'); g.fillStyle = gr; g.fillRect(0, 0, 600, 800);
    const k = 1 - w * 0.025, bw = (pose === 'side' ? 110 : 170) * k; g.fillStyle = '#c99a7a';
    g.beginPath(); g.arc(300, 150, 55, 0, 7); g.fill(); roundRect(g, 300 - bw, 215, bw * 2, 300, 60); g.fill();
    // legs: the prosthetic side follows S.prosthetic (default LEFT below-knee). Front view: subject's left = viewer's right; back view: viewer's left.
    const pl = S.prosthetic || 'left', pxLeft = 300 - bw * 0.8, pxRight = 300 + bw * 0.1, lw = bw * 0.7;
    const protX = pl === 'none' ? null : pose === 'front' ? (pl === 'left' ? pxRight : pxLeft) : pose === 'back' ? (pl === 'left' ? pxLeft : pxRight) : pxRight;
    for (const x of pose === 'side' ? [pxRight] : [pxLeft, pxRight]) { g.fillStyle = '#c99a7a'; g.fillRect(x, 500, lw, x === protX ? 130 : 260);
      if (x === protX) { g.fillStyle = '#8892a6'; g.fillRect(x + lw * 0.3, 630, lw * 0.4, 110); g.fillRect(x, 740, lw * 1.1, 20); } }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '28px sans-serif'; g.fillText(`DEMO · week ${w + 1}`, 20, 780);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    await idb.put({ id: uid(), t: w * 3, date: addDays(start, w * 7 + 2), pose, blob, weight: +(102.8 - w * 0.65).toFixed(1), level: 1 + Math.floor(w * 0.8), ovr: 50 + w });
  }
  await loadPhotos(); checkBadges(); save();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
(async function boot() {
  if (location.search.includes('demo')) { await seedDemo(); history.replaceState(null, '', location.pathname); }
  await loadPhotos(); applyMissedDays(); updateBaselines(); checkBadges(); save(); render();
})();
