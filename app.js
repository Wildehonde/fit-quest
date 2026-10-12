/* =====================================================================
   Fit Quest v2 – gamified fitness tracker (plain JS, no build step)
   Data: localStorage (STORE_KEY) + IndexedDB for progress photos.
   Sections: 1) config 2) state+migration 3) scoring 4) game rules
             5) exercises 6) habits 7) photos 8) charts 9) share cards
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

// Kinds of exercise logging. key = the number a PB is measured on.
const KINDS = {
  weight:   { fields: [['reps', 'reps', 1], ['kg', 'kg', 0.5]], unit: 'kg e1RM', keyLabel: 'Est. 1RM', volLabel: 'Volume (kg)' },
  reps:     { fields: [['reps', 'reps', 1]], unit: 'reps', keyLabel: 'Best set', volLabel: 'Total reps' },
  hold:     { fields: [['sec', 'sec', 5]], unit: 's', keyLabel: 'Longest hold', volLabel: 'Total time (s)' },
  power:    { fields: [['min', 'min', 1], ['watts', 'W', 1]], unit: 'W', keyLabel: 'Best avg power', volLabel: 'Work (kJ)' },
  distance: { fields: [['km', 'km', 0.1], ['min', 'min', 1]], unit: 'km', keyLabel: 'Longest', volLabel: 'Total km' },
  // 4th field entry = optional (e.g. no power meter)
  endurance: { fields: [['min', 'min', 5], ['km', 'km', 1], ['watts', 'avg W', 5, true]], unit: 'km', keyLabel: 'Longest', volLabel: 'Total km' },
};
const TYPES = { strength: '🏋️ Strength', bodyweight: '🤸 Bodyweight', cycling: '🚴 Cycling', cardio: '🏊 Cardio' };

// Library. base/target are seeds for Matt (edit any time). sug = in the suggested 10.
const LIBRARY = [
  { id: 'ftptest', name: 'FTP test (20 min)', type: 'cycling', kind: 'power', base: 253, target: 316, sug: 1, note: 'FTP ≈ 95% of 20-min power. Updates your FTP.' },
  { id: 'ride', name: 'Ride', type: 'cycling', kind: 'endurance', base: 40, target: 90, sug: 1, note: 'Duration, distance and average watts (watts optional).' },
  { id: 'z2ride', name: 'Zone 2 ride', type: 'cycling', kind: 'distance', base: 40, target: 80 },
  { id: 'sweetspot', name: 'Sweet spot 2×20', type: 'cycling', kind: 'power', base: 215, target: 270 },
  { id: 'vo2', name: 'VO2 max intervals', type: 'cycling', kind: 'power', base: 280, target: 340 },
  { id: 'swim', name: 'Swim', type: 'cardio', kind: 'distance', base: 1.5, target: 3, sug: 1 },
  { id: 'run', name: 'Run', type: 'cardio', kind: 'distance', base: 5, target: 10, sug: 1, note: 'Running blade or walking leg, log whichever you use.' },
  { id: 'row', name: 'Row erg', type: 'cardio', kind: 'distance', base: 4, target: 8 },
  { id: 'ski', name: 'Ski erg', type: 'cardio', kind: 'distance', base: 2, target: 5 },
  { id: 'bench', name: 'Bench press', type: 'strength', kind: 'weight', base: 70, target: 90, sug: 1 },
  { id: 'trapdl', name: 'Trap-bar deadlift', type: 'strength', kind: 'weight', base: 120, target: 160, sug: 1 },
  { id: 'legpress', name: 'Leg press', type: 'strength', kind: 'weight', base: 140, target: 200, sug: 1, note: 'Single-leg or both, keep it consistent.' },
  { id: 'ohp', name: 'Overhead press', type: 'strength', kind: 'weight', base: 45, target: 60 },
  { id: 'row_c', name: 'Seated cable row', type: 'strength', kind: 'weight', base: 70, target: 95 },
  { id: 'latpd', name: 'Lat pulldown', type: 'strength', kind: 'weight', base: 70, target: 95 },
  { id: 'rdl', name: 'Romanian deadlift', type: 'strength', kind: 'weight', base: 90, target: 130 },
  { id: 'hipthrust', name: 'Hip thrust', type: 'strength', kind: 'weight', base: 100, target: 160 },
  { id: 'pullup', name: 'Pull-ups', type: 'bodyweight', kind: 'reps', base: 4, target: 10, sug: 1 },
  { id: 'pushup', name: 'Push-ups', type: 'bodyweight', kind: 'reps', base: 25, target: 50, sug: 1 },
  { id: 'dips', name: 'Dips', type: 'bodyweight', kind: 'reps', base: 8, target: 20 },
  { id: 'plank', name: 'Plank', type: 'bodyweight', kind: 'hold', base: 60, target: 180, sug: 1 },
  { id: 'sideplank', name: 'Side plank', type: 'bodyweight', kind: 'hold', base: 30, target: 90 },
  { id: 'glutebr', name: 'Single-leg glute bridge', type: 'bodyweight', kind: 'reps', base: 12, target: 25 },
];

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

function seedExercises(persona = 'athlete') {
  return LIBRARY.filter(e => e.sug).map(e => newExercise(e.id, persona));
}
function newExercise(id, persona) {
  const L = LIBRARY.find(e => e.id === id), m = PERSONAS[persona || 'athlete'].targetMult;
  const target = +(L.base + (L.target - L.base) * m).toFixed(1);
  return { id: L.id, base: L.base, target, targetEdited: false, logged: false };
}
function freshState() {
  return { version: 2, onboarded: false, onboardStep: 0, persona: null, depth: 'detailed', name: 'Matt', xp: 0,
    metrics: structuredClone(DEFAULT_METRICS), log: [], streak: 0, bestStreak: 0, lastCheckin: null, badges: [],
    upgraded: false, modeHistory: [],
    challenge: { day: 0, lastDate: null, todays: {}, todaysDate: null, completed: 0, startDate: null },
    exercises: seedExercises(), sessions: [], pbCount: 0,
    habits: { active: HABITS.filter(h => h.core).map(h => h.id), slots: 3, earnedSlots: 0, wishlist: [], paused: [],
      days: {}, start: today(), evaluatedTo: null, weakWeeks: 0, override: false, weekLog: [] },
    photoCount: 0, photoWeeks: 0, share: { weight: false, photo: false } };
}
// Fill any missing fields from a fresh state (works for v1 data and older v2 saves).
function migrate(old) {
  const s = freshState();
  if (!old) return s;
  const out = { ...s, ...old, version: 2 };
  out.metrics = { ...s.metrics, ...(old.metrics || {}) };
  out.challenge = { ...s.challenge, ...(old.challenge || {}) };
  out.habits = { ...s.habits, ...(old.habits || {}) };
  out.share = { ...s.share, ...(old.share || {}) };
  if (!old.version) { // v1 -> v2
    out.onboarded = !!old.persona; out.depth = 'detailed';
    if (old.persona) { out.exercises = seedExercises(old.persona); out.habits.slots = START_SLOTS[old.persona]; out.habits.active = HABITS.slice(0, out.habits.slots).map(h => h.id); }
    // v1 Goggins saved Iron 75 days up to 75; v2 tiers cap per persona.
    if (old.persona) out.challenge.day = Math.min(out.challenge.day, IRON[old.persona].days);
  }
  return out;
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
function exProgress(ex) { return progress({ base: ex.base, target: ex.target, current: bestKey(ex.id) ?? ex.base }); }
function exGroupProgress(s, types) {
  const list = s.exercises.filter(e => types.includes(lib(e.id).type));
  return list.length ? list.reduce((a, e) => a + exProgress(e), 0) / list.length : null;
}
function stats(s) {
  const p = k => progress(s.metrics[k]), d = s.depth === 'detailed';
  const strEx = d ? exGroupProgress(s, ['strength', 'bodyweight']) : null;
  const endEx = d ? exGroupProgress(s, ['cardio', 'cycling']) : null;
  const eng = (p('hours') * 2 + p('sleep') + p('steps')) / 4;
  return {
    PWR: (p('ftp') + wkgProgress(s)) / 2,
    END: endEx == null ? eng : (eng + endEx) / 2,
    STR: strEx == null ? p('strength') : (p('strength') + strEx * 2) / 3,
    BOD: p('weight'),
    CON: clamp01(s.streak / 30),
  };
}
function overall(s) {
  let sum = 0, w = 0;
  for (const m of Object.values(s.metrics)) { sum += progress(m) * m.weight; w += m.weight; }
  sum += wkgProgress(s) * 2; w += 2;
  sum += clamp01(s.streak / 30); w += 1;
  if (s.depth === 'detailed' && s.exercises.length) {
    sum += s.exercises.reduce((a, e) => a + exProgress(e), 0) / s.exercises.length * 3; w += 3;
  }
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
  if (!quiet) toast(after > before ? `LEVEL UP! Level ${after} 🎉` : `+${gained} XP · ${why}`);
  return gained;
}
function applyMissedDays() {
  if (!S.persona) return;
  const P = PERSONAS[S.persona];
  if (S.lastCheckin) {
    const missed = daysBetween(S.lastCheckin, today()) - 1;
    if (missed > 0 && !S._penalised?.[today()]) {
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

/* ---------- 5) EXERCISES ---------- */
const lib = id => LIBRARY.find(e => e.id === id) || { id, name: id, type: 'strength', kind: 'weight' };
const e1rm = (reps, kg) => reps <= 1 ? kg : kg * (1 + reps / 30);
function keyOf(kind, sets) {
  const v = sets.map(st => kind === 'weight' ? e1rm(+st.reps, +st.kg) : kind === 'reps' ? +st.reps : kind === 'hold' ? +st.sec
    : kind === 'power' ? +st.watts : +st.km).filter(Number.isFinite);
  return v.length ? Math.round(Math.max(...v) * 10) / 10 : null;
}
function volumeOf(kind, sets) {
  return Math.round(sets.reduce((a, st) => a + (kind === 'weight' ? st.reps * st.kg : kind === 'reps' ? +st.reps
    : kind === 'hold' ? +st.sec : kind === 'power' ? st.watts * st.min * 60 / 1000 : +st.km), 0) * 10) / 10;
}
const sessionsFor = id => S.sessions.filter(x => x.exId === id).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
function bestKey(id) { const ks = sessionsFor(id).map(x => x.key); return ks.length ? Math.max(...ks) : null; }
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('en-US');
function compare(prev, cur, kind) {
  if (!prev) return [{ txt: 'First session logged, baseline set', cls: 'neu' }];
  const out = [], u = KINDS[kind].unit;
  const dk = cur.key - prev.key, dv = prev.vol ? (cur.vol - prev.vol) / prev.vol * 100 : 0;
  out.push({ txt: `${KINDS[kind].keyLabel} ${dk >= 0 ? '+' : ''}${fmtNum(dk)} ${u}`, cls: dk > 0 ? 'up' : dk < 0 ? 'down' : 'neu' });
  out.push({ txt: `${KINDS[kind].volLabel} ${dv >= 0 ? '+' : ''}${Math.round(dv)}%`, cls: dv > 0 ? 'up' : dv < 0 ? 'down' : 'neu' });
  if (kind === 'weight') {
    const top = a => Math.max(...a.sets.map(s => +s.kg)), d = top(cur) - top(prev);
    if (d) out.push({ txt: `Top set ${d > 0 ? '+' : ''}${fmtNum(d)} kg`, cls: d > 0 ? 'up' : 'down' });
  }
  return out;
}

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
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${X(pts.at(-1)).toFixed(1)},${H - B}L${X(pts[0]).toFixed(1)},${H - B}Z`;
  const grid = [0, 1, 2, 3].map(i => { const v = lo + (hi - lo) * (i + 0.5) / 4; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3}" class="ax" text-anchor="end">${fmtAx(v)}</text>`; }).join('');
  const xl = [pts[0], pts[Math.floor(pts.length / 2)], pts.at(-1)].filter((p, i, a) => a.indexOf(p) === i)
    .map(p => `<text x="${X(p)}" y="${H - 6}" class="ax" text-anchor="middle">${fmtDate(p.d)}</text>`).join('');
  const bmax = Math.max(0, ...pts.map(p => p.bar || 0));
  const bars = bmax ? pts.map(p => { const h = (p.bar / bmax) * (H - T - B) * 0.35; return `<rect x="${X(p) - 3}" y="${H - B - h}" width="6" height="${h}" rx="2" class="vb"/>`; }).join('') : '';
  const tgt = o.target != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}" class="tg"/><text x="${W - R}" y="${Y(o.target) - 4}" class="tgl" text-anchor="end">TARGET ${fmtAx(o.target)}</text>` : '';
  const dots = pts.map((p, i) => `<circle cx="${X(p)}" cy="${Y(p.y)}" r="${p.pb ? 5.5 : i === pts.length - 1 ? 5 : 3}" class="${p.pb ? 'pbd' : 'dt'}" style="--c:${col}"
    data-tip="${fmtDate(p.d)} · ${fmtNum(p.y)}${o.unit ? ' ' + o.unit : ''}${p.pb ? ' · PB' : ''}${p.bar ? ` · vol ${fmtNum(p.bar)}` : ''}"/>`).join('');
  const last = pts.at(-1);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${o.label || 'history chart'}">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${bars}${tgt}<path d="${area}" fill="url(#${gid})"/><path d="${path}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    <text x="${Math.min(X(last), W - R - 2)}" y="${Y(last.y) - 9}" class="lv" text-anchor="end">${fmtNum(last.y)}</text></svg><div class="tip"></div></div>`;
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
  let best = -Infinity;
  return sessionsFor(id).map(x => { const pb = x.key > best; best = Math.max(best, x.key); return { d: x.date, y: x.key, pb: pb && x !== sessionsFor(id)[0] ? true : false, bar: x.vol }; })
    .filter(p => p.d >= sinceRange(range));
}
function sparkline(id) {
  const p = sessionsFor(id).slice(-10).map(x => x.key); if (p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p) || 1, d = p.map((v, i) => `${i ? 'L' : 'M'}${(i / (p.length - 1) * 60).toFixed(1)},${(18 - (v - lo) / ((hi - lo) || 1) * 16).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 60 20"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
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
  const story = fmt === 'story', top = story ? 300 : 110, cx = W / 2;
  g.textAlign = 'center';
  g.font = F(800, 54); const w1 = g.measureText('FIT').width, w2 = g.measureText('QUEST').width; g.textAlign = 'left';
  g.fillStyle = txt; g.fillText('FIT', cx - (w1 + w2) / 2, top); g.fillStyle = ACC; g.fillText('QUEST', cx - (w1 + w2) / 2 + w1, top); g.textAlign = 'center';
  g.fillStyle = sub2; g.font = F(600, 36); g.fillText(`${tier(r).toUpperCase()} CARD · ${P.name.toUpperCase()} MODE`, cx, top + 60);
  g.fillStyle = txt; g.font = F(900, story ? 420 : 300); g.fillText(r, cx, top + (story ? 450 : 330));
  g.fillStyle = ACC; g.font = F(800, 52); g.fillText('OVERALL RATING', cx, top + (story ? 525 : 395));
  const items = [[li.level, 'LEVEL'], [S.streak, 'DAY STREAK'], [`${S.challenge.day}/${IRON[S.persona].days}`, 'IRON DAYS']];
  if (opt.weight) items.push([S.metrics.weight.current, 'KG']);
  items.push([wkg(S).toFixed(2), 'W/KG']);
  const rowY = top + (story ? 760 : 560), colW = W / Math.min(items.length, story ? 3 : 5);
  items.forEach(([v, l], i) => {
    const per = story ? 3 : 5, row = Math.floor(i / per), inRow = Math.min(per, items.length - row * per), x = W / 2 + ((i % per) - (inRow - 1) / 2) * colW;
    const y = rowY + row * 230;
    g.fillStyle = txt; g.font = F(900, 120); g.fillText(v, x, y); g.fillStyle = sub2; g.font = F(600, 34); g.fillText(l, x, y + 50);
  });
  const unlock = S.lastUnlock || (S.badges.length ? BADGES[S.badges.at(-1)][0] + ' ' + BADGES[S.badges.at(-1)][1] : null);
  if (unlock) {
    const y = story ? H - 380 : H - 150; shadow(false);
    if (!sticker) { g.fillStyle = photoBg ? 'rgba(0,0,0,.45)' : light ? '#11131a' : 'rgba(255,255,255,.08)'; roundRect(g, cx - 380, y - 70, 760, 110, 55); g.fill(); }
    shadow(true); g.fillStyle = sticker ? '#fff' : light ? '#fff' : '#fff'; g.font = F(800, 50); g.fillText(`NEW: ${unlock.toUpperCase()}`, cx, y + 4);
  }
  g.fillStyle = sub2; g.font = F(600, 32); g.fillText(`${S.name.toUpperCase()} · ${fmtDate(today()).toUpperCase()}`, cx, H - (story ? 160 : 50));
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

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
  AFTER[R.tab]?.();
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
  const st = S.onboardStep, dots = `<div class="steps">${[0, 1, 2, 3].map(i => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
  if (st === 0) return `${dots}<div class="hero"><div class="hero-ic">🏁</div><h1>Welcome, ${esc(S.name)}</h1><p class="muted">Pick how hard the game plays. You can drop down any time; moving up earns a badge.</p></div>
    ${S._migratedFromV1 ? '<div class="panel note">Your v1 data (XP, streak, badges, history) has been carried over.</div>' : ''}${modePicker(S.persona, 'obPersona')}`;
  if (st === 1) return `${dots}<h2>How much do you want to track?</h2><p class="muted">Switch any time in More › Settings.</p>${depthPicker(S.depth, 'obDepth')}
    <button class="ghost wide" onclick="S.onboardStep=0;render()">Back</button>`;
  if (st === 2) { const m = S.metrics, f = (k, f2, step) => `<div><label>${f2 === 'current' ? 'Now' : 'Target'}</label><input type="number" inputmode="decimal" step="${step}" value="${m[k][f2]}" onchange="obMetric('${k}','${f2}',this.value)"></div>`;
    return `${dots}<h2>Your starting line</h2><p class="muted">Seeded from your TrainingPeaks baseline. Edit if anything has changed.</p>
    <div class="panel"><b>⚖️ Weight (kg)</b><div class="grid2">${f('weight', 'current', 0.1)}${f('weight', 'target', 0.1)}</div></div>
    <div class="panel"><b>🚴 FTP (W)</b><div class="grid2">${f('ftp', 'current', 1)}${f('ftp', 'target', 1)}</div></div>
    ${S.depth === 'detailed' ? `<div class="panel"><b>🏋️ Your 10 suggested exercises</b><p class="muted">Targets are scaled for ${PERSONAS[S.persona].name} mode and re-anchored to your first log. Change them in Train.</p>
      <div class="chips">${S.exercises.map(e => `<span class="chip">${lib(e.id).name}</span>`).join('')}</div></div>` : ''}
    <div class="row"><button class="ghost" onclick="S.onboardStep=1;render()">Back</button><button onclick="S.onboardStep=3;save();render()">Next</button></div>`; }
  return `${dots}<h2>Earn your habits</h2><div class="panel"><p>You start with <b>${S.habits.slots}</b> habits:</p>
    ${S.habits.active.map(id => `<div class="hb static"><span>${habit(id).icon}</span>${habit(id).label}</div>`).join('')}
    <p class="muted">Hit them on 6 of 7 days and you unlock a new habit slot. Ideas go on a wishlist until then. Two weak weeks in a row pauses your newest habit instead of failing everything.</p></div>
    <div class="row"><button class="ghost" onclick="S.onboardStep=2;render()">Back</button><button onclick="obFinish()">Let's go ${PERSONAS[S.persona].icon}</button></div>`;
}

const bar = (lbl, v, note, cls = '') => `<div class="metricrow ${cls}"><div class="lbl">${lbl}<small>${note}</small></div>
  <div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><div class="pct">${Math.round(v * 100)}%</div></div>`;

function athleteCard() {
  const r = overall(S), st = stats(S), t = tier(r), P = PERSONAS[S.persona];
  return `<div class="card ${t}"><div class="shine"></div>
    <div class="ctop"><div><div class="ovr">${r}</div><div class="ovl">OVR</div></div><div class="tier">${t.toUpperCase()}<br><span>${P.icon} ${P.name.toUpperCase()}</span></div></div>
    <div class="name">${esc(S.name)}</div>
    <div class="stats">${Object.entries(st).map(([k, v]) => `<div><b>${statRating(v)}</b>${k}</div>`).join('')}<div><b>${wkg(S).toFixed(2)}</b>W/KG</div></div></div>`;
}

const VIEWS = {
  card() {
    const ex = S.depth === 'detailed' ? S.exercises : [], li = levelInfo(S.xp);
    const nextPB = ex.map(e => ({ e, p: exProgress(e) })).filter(x => x.p < 1).sort((a, b) => b.p - a.p)[0];
    return `${athleteCard()}
      <div class="tiles"><div class="tile"><b>${S.streak}</b><small>day streak 🔥</small></div><div class="tile"><b>${S.challenge.day}<em>/${IRON[S.persona].days}</em></b><small>Iron days</small></div>
        <div class="tile"><b>${S.pbCount}</b><small>PBs 🏆</small></div></div>
      <div class="row"><button onclick="go('today')">Today's check-in</button><button class="ghost" onclick="go('more',{more:'share'})">Share card ↗</button></div>
      ${nextPB ? `<div class="panel callout" onclick="go('train',{ex:'${nextPB.e.id}'})"><small>CLOSEST TO TARGET</small><b>${lib(nextPB.e.id).name}</b> is ${Math.round(nextPB.p * 100)}% of the way. Tap to log.</div>` : ''}
      <div class="panel"><h3>Body & engine</h3>
      ${Object.values(S.metrics).map(m => bar(m.label, progress(m), `${m.current} → ${m.target}`)).join('')}
      ${bar('W/kg', wkgProgress(S), `${wkg(S).toFixed(2)} → ${(S.metrics.ftp.target / S.metrics.weight.target).toFixed(2)}`)}</div>
      ${ex.length ? `<div class="panel"><h3>Exercise targets <small>roll up into your rating</small></h3>${ex.map(e => bar(lib(e.id).name, exProgress(e), `${fmtNum(bestKey(e.id) ?? e.base)} → ${fmtNum(e.target)} ${KINDS[lib(e.id).kind].unit}`, 'tap" onclick="go(\'train\',{ex:\'' + e.id + '\'})')).join('')}</div>` : ''}`;
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
        <div class="grid2">${f('weight', 0.1)}${f('ftp', 1)}${f('sleep', 0.5)}${f('steps', 100)}${f('hours', 0.5)}${f('strength', 1)}</div>
        <label class="check"><input type="checkbox" id="in-workout"> I trained today</label>
        <button class="wide" onclick="doCheckin()">Log it 💪</button></div>` : ''}`;
  },

  train() {
    if (R.ex) return exerciseView(R.ex);
    const groups = Object.keys(TYPES).map(t => [t, S.exercises.filter(e => lib(e.id).type === t)]).filter(g => g[1].length);
    return `<div class="ph"><h2>Train</h2><button class="sm" onclick="openLibrary()">+ Add</button></div>
      ${groups.map(([t, list]) => `<h3>${TYPES[t]}</h3>${list.map(e => { const L = lib(e.id), b = bestKey(e.id), last = sessionsFor(e.id).at(-1), p = exProgress(e);
        return `<button class="exrow" onclick="go('train',{ex:'${e.id}'})"><div class="exm"><b>${L.name}</b><small>${last ? `Last ${fmtDate(last.date)} · ` : ''}${b != null ? `Best ${fmtNum(b)}` : `Start ${fmtNum(e.base)}`} → ${fmtNum(e.target)} ${KINDS[L.kind].unit}</small>
          <div class="bar"><i style="width:${p * 100}%"></i></div></div>${sparkline(e.id)}<span class="pct">${Math.round(p * 100)}%</span></button>`; }).join('')}`).join('')}`;
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
const QUICK = [['ride', '🚴', 'Ride', 'cycling'], ['run', '🏃', 'Run', 'run'], ['swim', '🏊', 'Swim', 'swim'], ['strength', '🏋️', 'Strength', 'strength'], ['bodyweight', '🤸', 'Bodyweight', 'bodyweight']];
const quickMatch = (q, id) => { const L = lib(id); return q === 'ride' ? L.type === 'cycling' : q === 'run' ? id === 'run' : q === 'swim' ? id === 'swim' : L.type === q; };
function recentIds(n = 4) { const seen = []; for (const x of S.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)) if (!seen.includes(x.exId)) seen.push(x.exId); return seen.slice(0, n); }
function suggestedIds(n = 3) {
  const lastDate = id => sessionsFor(id).at(-1)?.date || '0000';
  const recentTypes = new Set(S.sessions.filter(x => x.date >= addDays(today(), -1)).map(x => lib(x.exId).type));
  const ids = S.exercises.map(e => e.id).filter(id => !recentTypes.has(lib(id).type)).sort((a, b) => lastDate(a).localeCompare(lastDate(b)));
  const out = [], types = new Set(); // one per type first, so suggestions cover strength and endurance
  for (const id of ids) if (!types.has(lib(id).type)) { types.add(lib(id).type); out.push(id); }
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out.slice(0, n);
}
function seedSets(id) {
  const last = sessionsFor(id).at(-1); if (last) return structuredClone(last.sets);
  const L = lib(id), b = (S.exercises.find(e => e.id === id) || L).base;
  return L.kind === 'weight' ? [1, 2, 3].map(() => ({ reps: 5, kg: Math.round(b / 1.17 / 2.5) * 2.5 })) : L.kind === 'reps' ? [{ reps: Math.round(b) }, { reps: Math.round(b * 0.8) }]
    : L.kind === 'hold' ? [{ sec: b }] : L.kind === 'power' ? [{ min: 20, watts: b }] : L.kind === 'endurance' ? [{ min: 90, km: b, watts: 180 }] : [{ km: b, min: Math.round(b * (id === 'swim' ? 22 : 6)) }];
}
VIEWS.home = () => {
  const H = S.habits, rec = H.days[today()] || { done: [] }, hDone = rec.done.filter(d => H.active.includes(d)).length;
  const todays = S.sessions.filter(x => x.date === today()), last = S.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)[0];
  const iron = S.challenge.lastDate === today(), r = overall(S), hr = new Date().getHours();
  return `<div class="hello"><small>${hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'}, ${esc(S.name)}</small><b>${todays.length ? 'Nice work today 💪' : 'Just trained? Log it.'}</b></div>
    ${!S.hintSeen ? `<div class="panel hint"><b>👋 How to use Fit Quest</b><ol><li>Finish a workout, open the app.</li><li>Tap <b>Log workout</b>: pick what you did, nudge the numbers, tick your habits.</li><li>Collect XP, PBs and unlocks. Share if you like.</li></ol><button class="sm" onclick="S.hintSeen=true;save();render()">Got it</button></div>` : ''}
    <button class="cta" onclick="startLog()"><span>＋</span>Log workout<small>${todays.length ? `${todays.length} logged today · add more` : 'About 30 seconds'}</small></button>
    <div class="tiles"><div class="tile hot"><b>${S.streak}</b><small>day streak 🔥</small></div><div class="tile" onclick="go('card')"><b>${r}</b><small>${tier(r)} rating</small></div><div class="tile" onclick="go('challenge')"><b>${S.challenge.day}<em>/${IRON[S.persona].days}</em></b><small>Iron days</small></div></div>
    <div class="panel"><h3>Today</h3>
      <button class="status ${todays.length ? 'ok' : ''}" onclick="startLog()"><i>${todays.length ? '✓' : ''}</i>Workout<span>${todays.length ? todays.map(x => lib(x.exId).name).join(', ') : 'Not logged yet'}</span></button>
      <button class="status ${hDone >= H.active.length ? 'ok' : ''}" onclick="go('today')"><i>${hDone >= H.active.length ? '✓' : ''}</i>Habits<span>${hDone}/${H.active.length} done</span></button>
      <button class="status ${iron ? 'ok' : ''}" onclick="go('challenge')"><i>${iron ? '✓' : ''}</i>Iron ${IRON[S.persona].days}<span>${iron ? 'Day banked' : `Bank day ${S.challenge.day + 1}`}</span></button></div>
    ${last ? `<div class="panel callout" onclick="go('train',{ex:'${last.exId}'})"><small>LAST SESSION · ${fmtDate(last.date)}</small><b>${lib(last.exId).name}</b> ${last.sets.map(x => setText(lib(last.exId).kind, x)).join(' · ')} ${last.pb ? '🏆' : ''}</div>` : ''}`;
};
window.startLog = () => { F = { step: 1, q: null, sel: [], sets: {}, startXP: S.xp, startBadges: [...S.badges], startSlots: S.habits.slots, startLevel: levelInfo(S.xp).level, startWeight: S.metrics.weight.current }; go('log'); };
const stepDots = () => `<div class="steps">${[1, 2, 3].map(i => `<i class="${i <= F.step ? 'on' : ''}"></i>`).join('')}</div>`;
VIEWS.log = () => {
  if (!F) { R.tab = 'home'; return VIEWS.home(); }
  if (F.step === 1) {
    const tile = id => { const L = lib(id), last = sessionsFor(id).at(-1); return `<button class="pick ${F.sel.includes(id) ? 'on' : ''}" onclick="togglePick('${id}')"><b>${L.name}</b><small>${last ? `${fmtDate(last.date)} · ${last.sets.length > 1 ? last.sets.length + ' sets' : setText(L.kind, last.sets[0])}` : TYPES[L.type]}</small><i>${F.sel.includes(id) ? '✓' : '+'}</i></button>`; };
    const rec = recentIds(), sug = suggestedIds(4).filter(id => !rec.includes(id)), rest = S.exercises.map(e => e.id).filter(id => !rec.includes(id) && !sug.includes(id));
    const pool = F.q ? [...new Set([...S.exercises.map(e => e.id), ...LIBRARY.map(e => e.id)])].filter(id => quickMatch(F.q, id)) : [];
    return `${stepDots()}<div class="ph"><h2>What did you do?</h2><button class="x" onclick="F=null;go('home')">✕</button></div>
      <div class="quick">${QUICK.map(([k, ic, l]) => `<button class="${F.q === k ? 'on' : ''}" onclick="quickPick('${k}')"><span>${ic}</span>${l}</button>`).join('')}</div>
      ${F.q ? `<h3>${QUICK.find(x => x[0] === F.q)[2]}</h3><div class="picks">${pool.map(tile).join('')}</div>` : ''}
      ${rec.length ? `<h3>Recent</h3><div class="picks">${rec.map(tile).join('')}</div>` : ''}
      ${sug.length ? `<h3>Suggested today <small>not done lately</small></h3><div class="picks">${sug.map(tile).join('')}</div>` : ''}
      ${rest.length ? `<details class="more" ${F.sel.some(id => rest.includes(id)) ? 'open' : ''}><summary>All my exercises (${rest.length})</summary><div class="picks">${rest.map(tile).join('')}</div></details>` : ''}
      <div class="dock"><button class="wide" ${F.sel.length ? '' : 'disabled'} onclick="F.step=2;render();scrollTo(0,0)">${F.sel.length ? `Next: enter numbers (${F.sel.length})` : 'Pick at least one'}</button></div>`;
  }
  if (F.step === 2) {
    return `${stepDots()}<div class="ph"><h2>Your numbers</h2><button class="x" onclick="F.step=1;render()">‹ Back</button></div><p class="muted">Prefilled from last time. Tap − / + to adjust.</p>
      ${F.sel.map(id => { const L = lib(id), last = sessionsFor(id).at(-1), sets = F.sets[id] || (F.sets[id] = seedSets(id));
        return `<div class="panel" id="fx-${id}"><div class="ph"><b class="en">${L.name}</b><small class="muted">${last ? 'Last ' + fmtDate(last.date) : 'First time'}</small></div>
          ${sets.map((st, i) => `<div class="srow"><span class="sn">${sets.length > 1 ? i + 1 : ''}</span>${KINDS[L.kind].fields.map(([f, lbl, step]) => `<div class="stp"><button onclick="bump('${id}',${i},'${f}',-${step})">−</button><label><input type="number" inputmode="decimal" value="${st[f] ?? ''}" placeholder="–" onchange="setF('${id}',${i},'${f}',this.value)"><small>${lbl}</small></label><button onclick="bump('${id}',${i},'${f}',${step})">+</button></div>`).join('')}
          ${sets.length > 1 ? `<button class="x" onclick="F.sets['${id}'].splice(${i},1);render()">✕</button>` : ''}</div>`).join('')}
          <button class="link" onclick="F.sets['${id}'].push(structuredClone(F.sets['${id}'].at(-1)));render()">+ add set</button></div>`; }).join('')}
      <div class="dock"><button class="wide" onclick="toStep3()">Next: habits</button></div>`;
  }
  if (F.step === 3) {
    const H = S.habits, rec = H.days[today()] || { done: [] }, w = S.metrics.weight.current;
    return `${stepDots()}<div class="ph"><h2>Today's habits</h2><button class="x" onclick="F.step=2;render()">‹ Back</button></div>
      <div class="panel">${H.active.map(id => { const on = rec.done.includes(id); return `<button class="hb ${on ? 'on' : ''}" onclick="tickHabit('${id}')"><span>${habit(id).icon}</span>${esc(habit(id).label)}<i>${on ? '✓' : ''}</i></button>`; }).join('')}
      <p class="muted">Tick what's true so far. You can come back later today.</p></div>
      ${S.depth === 'detailed' ? `<div class="panel"><b>⚖️ Weigh-in</b> <small class="muted">optional</small><div class="stp big"><button onclick="F.w=+((F.w??${w})-0.1).toFixed(1);render()">−</button><label><input type="number" step="0.1" value="${F.w ?? w}" onchange="F.w=parseFloat(this.value)"><small>kg</small></label><button onclick="F.w=+((F.w??${w})+0.1).toFixed(1);render()">+</button></div></div>` : ''}
      <div class="dock"><button class="wide" onclick="finishLog()">Finish & collect XP 🎉</button></div>`;
  }
  // step 4: reward
  const gained = S.xp - F.startXP, li = levelInfo(S.xp), newB = S.badges.filter(b => !F.startBadges.includes(b));
  return `<div class="reward"><div class="burst sm"></div><small>WORKOUT LOGGED</small><div class="xpbig">+${gained}<span>XP</span></div>
      ${li.level > F.startLevel ? `<div class="lvup">LEVEL UP · LV ${li.level}</div>` : `<div class="muted">Level ${li.level} · ${li.toNext} XP to go</div>`}
      <div class="xpbar"><i style="width:${li.pct}%"></i></div></div>
    <div class="tiles"><div class="tile hot"><b>${S.streak}</b><small>day streak 🔥</small></div><div class="tile"><b>${F.res.filter(x => x.cur.pb).length}</b><small>PBs today</small></div><div class="tile"><b>${overall(S)}</b><small>rating</small></div></div>
    ${F.res.map(({ cur, prev }) => { const L = lib(cur.exId); return `<div class="panel ${cur.pb ? 'pbrow' : ''}"><div class="ph"><b>${cur.pb ? '🏆 ' : ''}${L.name}</b>${cur.pb ? '<span class="pbtag">PB!</span>' : ''}</div><div class="cmp">${compare(prev, cur, L.kind).map(x => `<span class="${x.cls}">${x.txt}</span>`).join('')}</div></div>`; }).join('')}
    ${newB.length || S.habits.slots > F.startSlots ? `<div class="panel glow"><h3>🔓 Unlocked</h3>${newB.map(b => `<div class="unl">${BADGES[b][0]} ${BADGES[b][1]}</div>`).join('')}${S.habits.slots > F.startSlots ? '<div class="unl">🔓 New habit slot</div>' : ''}</div>` : ''}
    <div class="row"><button onclick="F=null;go('more',{more:'share'})">Share ↗</button><button class="ghost" onclick="F=null;go('home')">Done</button></div>`;
};
window.toStep3 = () => { F.step = 3; const rec = S.habits.days[today()]; if (S.habits.active.includes('trained') && !(rec && rec.done.includes('trained'))) tickHabit('trained'); else render(); scrollTo(0, 0); };
window.quickPick = q => { F.q = F.q === q ? null : q; const main = { ride: 'ride', run: 'run', swim: 'swim' }[q]; if (F.q && main && !F.sel.includes(main)) F.sel.push(main); render(); };
window.togglePick = id => { F.sel = F.sel.includes(id) ? F.sel.filter(x => x !== id) : [...F.sel, id]; render(); };
window.bump = (id, i, f, d) => { const st = F.sets[id][i], v = (parseFloat(st[f]) || 0) + d; st[f] = Math.max(0, Math.round(v * 10) / 10); render(); };
window.setF = (id, i, f, v) => { F.sets[id][i][f] = parseFloat(v); };
window.finishLog = () => {
  F.res = [];
  for (const id of F.sel) {
    const kind = lib(id).kind, sets = (F.sets[id] || []).map(x => ({ ...x })).filter(st => KINDS[kind].fields.every(([f, , , opt]) => opt || st[f] > 0));
    sets.forEach(st => KINDS[kind].fields.forEach(([f, , , opt]) => { if (opt && !(st[f] > 0)) delete st[f]; }));
    if (sets.length) F.res.push(saveSession(id, sets, true));
  }
  if (!F.res.length) { F.step = 2; render(); return toast('Enter at least one complete set', true); }
  if (F.w != null && F.w !== F.startWeight && F.w > 0) {
    const lowest = F.w < Math.min(F.startWeight, ...S.log.map(e => e.weight)); S.metrics.weight.current = F.w; addXP(XP.weighin, 'weigh-in', true);
    if (lowest) { S.pbCount++; addXP(XP.pb, 'PB', true); } logPoint();
  }
  const H = S.habits, rec = H.days[today()]; // "Trained today" is implied by logging
  checkBadges(); save(); F.step = 4; render(); scrollTo(0, 0);
  if (F.res.some(x => x.cur.pb)) { const p = F.res.find(x => x.cur.pb).cur; pbMoment(`${fmtNum(p.key)} ${KINDS[lib(p.exId).kind].unit}`, lib(p.exId).name); }
};

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
    const rows = Object.entries(S.metrics).map(([k, m]) => `<div class="panel"><b>${m.label}</b><div class="grid3">
      <div><label>Baseline</label><input type="number" step="any" value="${m.base}" onchange="setMetric('${k}','base',this.value)"></div>
      <div><label>Target</label><input type="number" step="any" value="${m.target}" onchange="setMetric('${k}','target',this.value)"></div>
      <div><label>Score weight</label><input type="number" step="0.5" value="${m.weight}" onchange="setMetric('${k}','weight',this.value)"></div></div></div>`).join('');
    return `<h3>Intensity</h3><p class="muted">Drop down any time. Moving up earns the 📈 badge.</p>${modePicker(S.persona, 'pickPersona')}
      <h3>Tracking</h3>${depthPicker(S.depth, 'pickDepth')}
      <h3>Profile</h3><div class="panel"><label>Name on card</label><input value="${esc(S.name)}" onchange="S.name=this.value;save()"></div>
      <h3>Metrics</h3>${rows}
      <div class="row"><button class="ghost" onclick="exportData()">Export data (JSON)</button>
      <button class="ghost danger" onclick="if(confirm('Wipe all data, including photos?')){localStorage.removeItem(STORE_KEY);localStorage.removeItem(V1_KEY);indexedDB.deleteDatabase('fitquest-photos');location.reload()}">Reset all</button></div>
      <p class="muted center">Fit Quest v2 · all data stays in this browser</p>`;
  },
};
const rangeSeg = () => `<div class="range">${[['4w', '4W'], ['3m', '3M'], ['all', 'All']].map(([k, l]) => `<button class="${R.range === k ? 'on' : ''}" onclick="R.range='${k}';render()">${l}</button>`).join('')}</div>`;

function exerciseView(id) {
  const e = S.exercises.find(x => x.id === id); if (!e) { R.ex = null; return VIEWS.train(); }
  const L = lib(id), K = KINDS[L.kind], ss = sessionsFor(id), last = ss.at(-1), best = bestKey(id), p = exProgress(e);
  const seed = last ? last.sets : [Object.fromEntries(K.fields.map(([f]) => [f, '']))];
  const ex = L.kind === 'power' && L.id === 'ftptest' && best ? `<small class="muted"> · FTP ≈ ${Math.round(best * 0.95)} W</small>` : '';
  return `<button class="back" onclick="go('train')">‹ Train</button>
    <div class="ph"><h2>${L.name}</h2><span class="pill">${TYPES[L.type]}</span></div>${L.note ? `<p class="muted">${L.note}</p>` : ''}
    <div class="tiles"><div class="tile"><b>${best != null ? fmtNum(best) : '–'}</b><small>${K.keyLabel} PB${ex}</small></div><div class="tile"><b>${fmtNum(e.target)}</b><small>Target ${K.unit}</small></div><div class="tile"><b>${Math.round(p * 100)}%</b><small>to target</small></div></div>
    <div class="panel"><div class="ph"><h3>History</h3>${rangeSeg()}</div>${lineChart(exSeries(id, R.range), { target: e.target, unit: K.unit, label: L.name })}
      <p class="muted legend"><i class="lg1"></i>${K.keyLabel} <i class="lg2"></i>PB <i class="lg3"></i>${K.volLabel} <i class="lg4"></i>Target</p></div>
    <div class="panel"><h3>Log session</h3>${last ? `<p class="muted">Prefilled from ${fmtDate(last.date)}. Beat it.</p>` : '<p class="muted">Your first log sets the baseline and re-anchors the target.</p>'}
      <div id="sets">${seed.map((s, i) => setRow(L.kind, s, i)).join('')}</div>
      <div class="row"><button class="ghost" onclick="addSet()">+ Set</button><button onclick="logSession('${id}')">Save session</button></div><div id="cmpout"></div></div>
    ${ss.length ? `<div class="panel"><h3>Sessions</h3>${ss.slice().reverse().slice(0, 12).map(x => `<div class="sess"><b>${fmtDate(x.date)}</b><span>${x.sets.map(s => setText(L.kind, s)).join(' · ')}</span><em>${fmtNum(x.key)} ${x.pb ? '🏆' : ''}</em></div>`).join('')}</div>` : ''}
    <details class="panel"><summary>Edit target</summary><div class="grid2"><div><label>Start (${K.unit})</label><input type="number" step="any" value="${e.base}" onchange="setEx('${id}','base',this.value)"></div>
      <div><label>Target (${K.unit})</label><input type="number" step="any" value="${e.target}" onchange="setEx('${id}','target',this.value)"></div></div>
      <button class="ghost danger" onclick="removeEx('${id}')">Remove from my list</button></details>`;
}
const setRow = (kind, s, i) => `<div class="setrow"><span>${i + 1}</span>${KINDS[kind].fields.map(([f, lbl, step]) => `<label><input type="number" inputmode="decimal" step="${step}" data-f="${f}" value="${s[f] ?? ''}" placeholder="0">${lbl}</label>`).join('')}<button class="x" onclick="this.parentNode.remove()">✕</button></div>`;
const setText = (kind, s) => kind === 'endurance' ? `${s.min}′ · ${s.km}km${s.watts ? ` · ${s.watts}W` : ''}` : kind === 'weight' ? `${s.reps}×${s.kg}kg` : kind === 'reps' ? `${s.reps}` : kind === 'hold' ? `${s.sec}s` : kind === 'power' ? `${s.min}′@${s.watts}W` : `${s.km}km/${s.min}′`;

const AFTER = {
  more() { if (R.more === 'share') renderSharePreview(); },
  photos() { bindCompare(); },
};

/* ---------- 11) ACTIONS ---------- */
window.obPersona = p => { S.persona = p; S.exercises = seedExercises(p); S.habits.slots = START_SLOTS[p]; S.habits.active = []; fillSlots(); S.onboardStep = 1; save(); render(); };
window.obDepth = d => { S.depth = d; S.onboardStep = 2; save(); render(); };
window.obMetric = (k, f, v) => { S.metrics[k][f] = parseFloat(v); if (f === 'current') S.metrics[k].base = parseFloat(v); save(); };
window.obFinish = () => { S.onboarded = true; S.modeHistory.push({ date: today(), persona: S.persona }); S.habits.start = today(); save(); R.tab = 'home'; render(); toast(`${PERSONAS[S.persona].icon} ${PERSONAS[S.persona].name} mode activated`); };
window.pickPersona = p => { if (p === S.persona) return; const up = PERSONAS[p].rank > PERSONAS[S.persona].rank; setPersona(p); applyMissedDays(); render(); toast(`${PERSONAS[p].icon} ${PERSONAS[p].name} mode${up ? ' · moved up!' : ''}`); };
window.pickDepth = d => { S.depth = d; save(); render(); toast(`Tracking: ${DEPTHS[d].name}`); };
window.setMetric = (k, f, v) => { S.metrics[k][f] = parseFloat(v); save(); };

window.doCheckin = () => {
  const m = S.metrics, num = k => parseFloat($('#in-' + k).value);
  const pbFtp = num('ftp') > Math.max(m.ftp.current, ...S.log.map(e => e.ftp));
  const pbWt = num('weight') < Math.min(m.weight.current, ...S.log.map(e => e.weight));
  const weighedIn = num('weight') !== m.weight.current;
  const first = !S.log.some(e => e.date === today());
  for (const k of ['weight', 'ftp', 'sleep', 'steps', 'hours', 'strength']) if (Number.isFinite(num(k))) m[k].current = num(k);
  markActiveDay();
  if (first) { addXP(XP.checkin, 'check-in'); if ($('#in-workout').checked) addXP(XP.workout, 'workout'); if (weighedIn) addXP(XP.weighin, 'weigh-in'); }
  if (pbFtp || pbWt) { addXP(XP.pb, 'NEW PB!'); S.pbCount++; pbMoment(pbFtp ? `FTP ${m.ftp.current} W` : `${m.weight.current} kg`, pbFtp ? 'New FTP' : 'Lowest weight'); }
  logPoint(); checkBadges(); save(); go('card');
};
function logPoint() { S.log = S.log.filter(e => e.date !== today()); S.log.push({ date: today(), ovr: overall(S), ftp: S.metrics.ftp.current, weight: S.metrics.weight.current }); }

window.tickHabit = id => {
  const H = S.habits, rec = H.days[today()] || (H.days[today()] = { done: [], n: H.active.length });
  rec.n = H.active.length;
  const wasHit = dayHit(rec);
  rec.done = rec.done.includes(id) ? rec.done.filter(x => x !== id) : [...rec.done, id];
  rec.done = rec.done.filter(x => H.active.includes(x));
  if (!wasHit && dayHit(rec) && !rec.xp) { rec.xp = 1; markActiveDay(); addXP(XP.habitDay, 'all habits done'); logPoint(); }
  checkBadges(); save(); render();
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

// Exercises
window.openLibrary = () => {
  const mine = new Set(S.exercises.map(e => e.id));
  modal(`<h2>Exercise library</h2>${Object.entries(TYPES).map(([t, l]) => `<h3>${l}</h3>${LIBRARY.filter(e => e.type === t).map(e =>
    `<button class="exrow" ${mine.has(e.id) ? 'disabled' : ''} onclick="addEx('${e.id}')"><div class="exm"><b>${e.name}</b><small>${KINDS[e.kind].keyLabel} · ${e.sug ? 'suggested' : ''}</small></div><span class="pct">${mine.has(e.id) ? '✓' : '+'}</span></button>`).join('')}`).join('')}`);
};
window.addEx = id => { S.exercises.push(newExercise(id, S.persona)); save(); closeModal(); go('train', { ex: id }); };
window.removeEx = id => { if (!confirm('Remove from your list? Logged sessions are kept.')) return; S.exercises = S.exercises.filter(e => e.id !== id); save(); go('train'); };
window.setEx = (id, f, v) => { const e = S.exercises.find(x => x.id === id); e[f] = parseFloat(v); if (f === 'target') e.targetEdited = true; save(); render(); };
window.addSet = () => {
  const L = lib(R.ex), rows = document.querySelectorAll('#sets .setrow'), lastRow = rows[rows.length - 1];
  const vals = lastRow ? Object.fromEntries([...lastRow.querySelectorAll('input')].map(i => [i.dataset.f, i.value])) : {};
  $('#sets').insertAdjacentHTML('beforeend', setRow(L.kind, vals, rows.length));
};
window.logSession = id => {
  const L = lib(id), e = S.exercises.find(x => x.id === id);
  const sets = readSets('#sets', L.kind);
  if (!sets.length) return toast('Enter at least one complete set');
  const r = saveSession(id, sets, false), prev = r.prev, cur = r.cur;
  render();
  $('#cmpout').innerHTML = `<div class="cmp">${prev ? `<small>vs ${fmtDate(prev.date)}</small>` : ''}${compare(prev, cur, L.kind).map(x => `<span class="${x.cls}">${x.txt}</span>`).join('')}</div>`;
};
function readSets(root, kind) {
  return [...document.querySelectorAll(root + ' .setrow')].map(r => Object.fromEntries([...r.querySelectorAll('input')].map(i => [i.dataset.f, parseFloat(i.value)])))
    .filter(s => KINDS[kind].fields.every(([f, , , opt]) => opt ? true : Number.isFinite(s[f]) && s[f] > 0))
    .map(s => { for (const [f, , , opt] of KINDS[kind].fields) if (opt && !(s[f] > 0)) delete s[f]; return s; });
}
// Core save used by the exercise screen and the post-workout flow. quiet = no toasts/PB overlay.
function saveSession(id, sets, quiet) {
  const L = lib(id); let e = S.exercises.find(x => x.id === id);
  if (!e) { e = newExercise(id, S.persona); S.exercises.push(e); }
  const prev = sessionsFor(id).at(-1), prevBest = bestKey(id);
  const cur = { id: uid(), t: Date.now(), exId: id, date: today(), sets, key: keyOf(L.kind, sets), vol: volumeOf(L.kind, sets) };
  cur.pb = prevBest != null && cur.key > prevBest;
  if (!e.logged) { e.logged = true; if (prevBest == null) { const gap = (lib(id).target - lib(id).base) * PERSONAS[S.persona].targetMult;
    e.base = cur.key; if (!e.targetEdited) e.target = +(Math.max(e.target, cur.key + gap * 0.5)).toFixed(1); } }
  S.sessions.push(cur);
  if (id === 'ftptest') { const f = Math.round(cur.key * 0.95); if (f > S.metrics.ftp.current) S.metrics.ftp.current = f; }
  const firstToday = !S.sessions.some(x => x !== cur && x.date === today());
  addXP(firstToday ? XP.session : 10, 'session logged', quiet || cur.pb);
  if (cur.pb) { S.pbCount++; addXP(XP.pb, 'PB bonus', true); if (!quiet) pbMoment(`${fmtNum(cur.key)} ${KINDS[L.kind].unit}`, `${L.name} · +${Math.round(XP.pb * PERSONAS[S.persona].xpMult)} XP`); }
  markActiveDay(); logPoint(); checkBadges(); save();
  return { cur, prev };
}
function pbMoment(big, small) {
  const el = $('#pb'); el.innerHTML = `<div class="burst"></div><div class="pbt">PB!</div><div class="pbv">${esc(big)}</div><div class="pbs">${esc(small)}</div>`;
  el.classList.remove('hidden'); el.onclick = () => el.classList.add('hidden'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.add('hidden'), 2600);
  navigator.vibrate?.([60, 40, 120]);
}

// Modal
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet"><button class="x close" onclick="closeModal()">✕</button>${html}</div>`; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; }
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
  S = freshState(); S.persona = 'athlete'; S.onboarded = true; S.habits.slots = 3;
  const start = addDays(today(), -55); S.habits.start = start;
  const rnd = (i, k) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  for (let i = 0; i <= 55; i++) {
    const d = addDays(start, i), t = i / 55;
    S.metrics.ftp.current = Math.round(240 + 22 * t); S.metrics.weight.current = +(102.8 - 4.6 * t + Math.abs(rnd(i, 1)) * 0.4).toFixed(1);
    S.metrics.hours.current = 7; S.metrics.strength.current = 2; S.metrics.sleep.current = 7; S.metrics.steps.current = 8500;
    const rec = { done: [], n: S.habits.active.length };
    for (const h of S.habits.active) if (Math.abs(rnd(i, h.length)) > (i < 28 ? 0.45 : 0.08) || i % 7 < 4) rec.done.push(h);
    S.habits.days[d] = rec;
    S.streak = i + 1; S.bestStreak = S.streak; S.lastCheckin = d; S.xp += 70;
    S.log.push({ date: d, ovr: 0, ftp: S.metrics.ftp.current, weight: S.metrics.weight.current });
    // weekly evaluation as we go
    if (i % 7 === 6) { todayOverride = addDays(d, 1); evaluateHabitWeeks(); todayOverride = null; }
  }
  const plan = { bench: [70, 0.9], trapdl: [120, 1.7], legpress: [140, 2.6], pullup: [4, 0.35], pushup: [25, 1.4], plank: [60, 6], ftptest: [253, 2.4], ride: [40, 2.5], swim: [1.5, 0.08], run: [5, 0.25] };
  for (const [id, [b, step]] of Object.entries(plan)) {
    const L = lib(id), e = S.exercises.find(x => x.id === id); e.logged = true; e.base = b;
    for (let w = 0; w < 8; w++) for (let k = 0; k < (L.type === 'strength' ? 2 : 1); k++) {
      const d = addDays(start, w * 7 + (k ? 4 : 1) + (id.length % 2)), v = b + step * (w * 2 + k) * (0.8 + Math.abs(rnd(w, id.length + k)) * 0.4) - (w === 5 ? step * 2 : 0);
      const sets = L.kind === 'weight' ? [{ reps: 5, kg: Math.round(v / (1 + 5 / 30) / 2.5) * 2.5 }, { reps: 5, kg: Math.round(v / (1 + 5 / 30) / 2.5) * 2.5 }, { reps: 8, kg: Math.round(v * 0.7 / 2.5) * 2.5 }]
        : L.kind === 'reps' ? [{ reps: Math.round(v) }, { reps: Math.round(v * 0.8) }] : L.kind === 'hold' ? [{ sec: Math.round(v / 5) * 5 }, { sec: Math.round(v * 0.7 / 5) * 5 }]
        : L.kind === 'power' ? [{ min: 20, watts: Math.round(v) }] : L.kind === 'endurance' ? [{ min: Math.round(v * 2.2), km: +v.toFixed(1), watts: 175 + w * 3 }] : [{ km: +v.toFixed(1), min: Math.round(v * (L.id === 'swim' ? 22 : L.id === 'run' ? 6.5 : 2)) }];
      const best = bestKey(id), key = keyOf(L.kind, sets);
      S.sessions.push({ id: uid(), t: w * 10 + k, exId: id, date: d, sets, key, vol: volumeOf(L.kind, sets), pb: best != null && key > best });
      if (best != null && key > best) S.pbCount++;
    }
  }
  S.metrics.ftp.current = Math.max(S.metrics.ftp.current, Math.round(bestKey('ftptest') * 0.95));
  S.log.forEach(e => e.ovr = Math.round(40 + (overall(S) - 40) * (0.35 + 0.65 * daysBetween(start, e.date) / 55)));
  S.log.at(-1).ovr = overall(S); S.lastCheckin = addDays(today(), -1);
  delete S.habits.days[today()];
  S.challenge.day = 18; S.challenge.lastDate = addDays(today(), -1); S.challenge.startDate = addDays(today(), -18);
  if (S.habits.slots > S.habits.active.length) S.habits.active.push('steps');
  S.habits.wishlist = [{ id: 'w_acv', label: 'Apple cider vinegar' }, { id: 'w_multi', label: 'Multivitamin' }];
  S.upgraded = false; checkBadges(); S.lastUnlock = S.habits.active.length > 3 ? `${habit(S.habits.active.at(-1)).icon} ${habit(S.habits.active.at(-1)).label}` : S.lastUnlock;
  // sample photos: simple silhouettes that slim down week by week
  try { await new Promise(r => { const q = indexedDB.deleteDatabase('fitquest-photos'); q.onsuccess = q.onerror = q.onblocked = r; }); idb.db = null; } catch (e) {}
  for (let w = 0; w < 8; w++) for (const pose of POSES) {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, '#3a3f52'); gr.addColorStop(1, '#1c1f2b'); g.fillStyle = gr; g.fillRect(0, 0, 600, 800);
    const k = 1 - w * 0.025, bw = (pose === 'side' ? 110 : 170) * k; g.fillStyle = '#c99a7a';
    g.beginPath(); g.arc(300, 150, 55, 0, 7); g.fill(); roundRect(g, 300 - bw, 215, bw * 2, 300, 60); g.fill();
    g.fillRect(300 - bw * 0.8, 500, bw * 0.7, 260); g.fillStyle = pose === 'back' ? '#c99a7a' : '#8892a6'; g.fillRect(300 + bw * 0.1, 500, bw * 0.7 * (pose === 'side' ? 0.6 : 1), 260);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '28px sans-serif'; g.fillText(`DEMO · week ${w + 1}`, 20, 780);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    await idb.put({ id: uid(), t: w * 3, date: addDays(start, w * 7 + 2), pose, blob, weight: +(102.8 - w * 0.65).toFixed(1), level: 1 + Math.floor(w * 0.8), ovr: 50 + w });
  }
  await loadPhotos(); checkBadges(); save();
}

(async function boot() {
  if (location.search.includes('demo')) { await seedDemo(); history.replaceState(null, '', location.pathname); }
  await loadPhotos(); applyMissedDays(); checkBadges(); save(); render();
})();
