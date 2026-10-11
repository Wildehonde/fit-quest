/* =====================================================================
   Fit Quest – gamified fitness tracker (plain JS, no build step)
   All data lives in the browser's localStorage under STORE_KEY.
   Sections: 1) config  2) state  3) scoring  4) game rules  5) views
   ===================================================================== */

/* ---------- 1) CONFIG ---------- */
const STORE_KEY = 'fitquest-v1';

// Personas: rank orders them (higher = harder). xpMult scales XP earned.
const PERSONAS = {
  beginner: { rank: 1, name: 'Beginner', icon: '🌱', xpMult: 1.0, missPenalty: 0,
    streakBreaks: false, desc: 'Gentle targets. A missed day pauses your streak instead of breaking it.' },
  athlete:  { rank: 2, name: 'Athlete',  icon: '⚡', xpMult: 1.25, missPenalty: 0,
    streakBreaks: true,  desc: 'Stretch goals. Miss a day and your streak resets.' },
  goggins:  { rank: 3, name: 'Goggins Mode', icon: '💀', xpMult: 1.6, missPenalty: 50,
    streakBreaks: true,  desc: 'Stay hard. Daily check-in required; a missed day breaks the streak and costs 50 XP.' },
};

// Default metrics prefilled for Matt. higher=true means bigger is better.
const DEFAULT_METRICS = {
  ftp:      { label: 'FTP (W)',            base: 240,   target: 300, current: 240,   weight: 2 },
  weight:   { label: 'Weight (kg)',        base: 102.8, target: 90,  current: 102.8, weight: 2 },
  hours:    { label: 'Training h / week',  base: 5,     target: 10,  current: 5,     weight: 1.5 },
  strength: { label: 'Strength / week',    base: 1,     target: 3,   current: 1,     weight: 1 },
  sleep:    { label: 'Sleep (h/night)',    base: 6,     target: 8,   current: 6,     weight: 1 },
  steps:    { label: 'Steps / day',        base: 6000,  target: 10000, current: 6000, weight: 0.5 },
};

// Iron 75 – our own 75 Hard. Items scale with persona.
const CHALLENGE_ITEMS = {
  beginner: ['1 workout (any length)', 'Drink 2L water', 'Read 10 pages', 'No alcohol (optional)'],
  athlete:  ['Workout #1', 'Workout #2 – at least 45 min', 'Drink 3L water', 'Hit protein target', 'Read 10 pages', 'No alcohol'],
  goggins:  ['Workout #1 – 45 min', 'Workout #2 – 45 min OUTDOORS', 'Drink 4L water', 'Strict diet, zero cheats',
             'No alcohol', 'Progress photo', 'Read 10 pages'],
};
const CHALLENGE_LENGTH = 75;

// XP rewards (before persona multiplier)
const XP = { checkin: 20, workout: 30, weighin: 10, pb: 75, challengeDay: 40 };

// Badges: id -> [icon, title, test(state)]
const BADGES = {
  first_checkin: ['👣', 'First Step',     s => s.log.length >= 1],
  streak7:       ['🔥', '7-Day Streak',   s => s.bestStreak >= 7],
  streak30:      ['🌋', '30-Day Streak',  s => s.bestStreak >= 30],
  kg4:           ['⚖️', 'First 4kg Lost', s => s.metrics.weight.base - s.metrics.weight.current >= 4],
  kg10:          ['🪶', '10kg Down',      s => s.metrics.weight.base - s.metrics.weight.current >= 10],
  ftp260:        ['🚴', 'FTP 260W',       s => s.metrics.ftp.current >= 260],
  ftp300:        ['🚀', 'FTP 300W',       s => s.metrics.ftp.current >= 300],
  wkg3:          ['⚡', '3.0 W/kg',       s => wkg(s) >= 3],
  level5:        ['⭐', 'Level 5',        s => levelInfo(s.xp).level >= 5],
  upgrade:       ['📈', 'Moved Up a Mode', s => s.upgraded],
  iron7:         ['🛡️', 'Iron 75: Week 1', s => s.challenge.day >= 7],
  iron75:        ['👑', 'Iron 75 Finisher', s => s.challenge.day >= 75],
  gold:          ['🥇', 'Gold Card',      s => overall(s) >= 75],
};

/* ---------- 2) STATE (load/save) ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function freshState() {
  return { persona: null, name: 'Matt', xp: 0, metrics: structuredClone(DEFAULT_METRICS),
    log: [], streak: 0, bestStreak: 0, lastCheckin: null, badges: [], upgraded: false,
    challenge: { day: 0, lastDate: null, todays: {}, todaysDate: null } };
}
let S = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || freshState();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));

/* ---------- 3) SCORING ---------- */
const clamp01 = x => Math.max(0, Math.min(1, x));
// Progress 0..1 from baseline to target. Works for "down is good" (weight) too.
function progress(m) {
  if (m.target === m.base) return 1;
  return clamp01((m.current - m.base) / (m.target - m.base));
}
const wkg = s => s.metrics.ftp.current / s.metrics.weight.current;
function wkgProgress(s) {
  const m = s.metrics;
  return progress({ base: m.ftp.base / m.weight.base, target: m.ftp.target / m.weight.target, current: wkg(s) });
}
// Stat groups shown on the athlete card (each 0..1)
function stats(s) {
  const p = k => progress(s.metrics[k]);
  return {
    PWR: (p('ftp') + wkgProgress(s)) / 2,
    ENG: (p('hours') * 2 + p('sleep') + p('steps')) / 4,
    STR: p('strength'),
    BOD: p('weight'),
    CON: clamp01(s.streak / 30),
  };
}
// Overall = weighted average of metric progress (+ W/kg and consistency), mapped to a 40..99 rating.
function overall(s) {
  let sum = 0, w = 0;
  for (const m of Object.values(s.metrics)) { sum += progress(m) * m.weight; w += m.weight; }
  sum += wkgProgress(s) * 2; w += 2;                 // W/kg is the cyclist's key number
  sum += clamp01(s.streak / 30) * 1; w += 1;         // consistency
  return Math.round(40 + 59 * (sum / w));
}
const statRating = v => Math.round(40 + 59 * v);
const tier = r => r >= 88 ? 'elite' : r >= 75 ? 'gold' : r >= 60 ? 'silver' : 'bronze';

// Levels: reaching level L needs 50*L*(L+1) XP total (each level a bit longer)
function levelInfo(xp) {
  let L = 0; while (50 * (L + 1) * (L + 2) <= xp) L++;
  const lo = 50 * L * (L + 1), hi = 50 * (L + 1) * (L + 2);
  return { level: L + 1, pct: Math.round((xp - lo) / (hi - lo) * 100) };
}

/* ---------- 4) GAME RULES ---------- */
function addXP(base, why) {
  const gained = Math.round(base * PERSONAS[S.persona].xpMult);
  const before = levelInfo(S.xp).level;
  S.xp += gained;
  const after = levelInfo(S.xp).level;
  toast(after > before ? `LEVEL UP! Level ${after} 🎉` : `+${gained} XP · ${why}`);
}

// Run on app load: apply missed-day rules for streak and challenge.
function applyMissedDays() {
  if (!S.persona) return;
  const P = PERSONAS[S.persona];
  if (S.lastCheckin) {
    const missed = daysBetween(S.lastCheckin, today()) - 1;
    if (missed > 0 && !S._penalised?.[today()]) {
      if (P.streakBreaks) S.streak = 0;
      if (P.missPenalty) S.xp = Math.max(0, S.xp - P.missPenalty * missed);
      S._penalised = { [today()]: true };
      if (P.streakBreaks) toast(`Missed ${missed} day(s) – streak reset${P.missPenalty ? `, -${P.missPenalty * missed} XP` : ''}`);
    }
  }
  // Challenge: Athlete/Goggins reset if a day was skipped; Beginner just pauses.
  const c = S.challenge;
  if (c.lastDate && c.day > 0 && daysBetween(c.lastDate, today()) > 1 && S.persona !== 'beginner') {
    c.day = 0; toast('Iron 75 reset – a day was missed. Start again at Day 1.');
  }
  if (c.todaysDate !== today()) { c.todays = {}; c.todaysDate = today(); }
  save();
}

function checkBadges() {
  for (const [id, [icon, title, test]] of Object.entries(BADGES)) {
    if (!S.badges.includes(id) && test(S)) { S.badges.push(id); setTimeout(() => toast(`${icon} Badge unlocked: ${title}`), 1200); }
  }
}

function setPersona(p) {
  if (S.persona && PERSONAS[p].rank > PERSONAS[S.persona].rank) S.upgraded = true;
  S.persona = p; checkBadges(); save();
}

/* ---------- 5) VIEWS ---------- */
const $ = sel => document.querySelector(sel);
let tab = 'card', chart;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2500); }

function render() {
  $('#nav').style.display = S.persona ? 'flex' : 'none';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const li = levelInfo(S.xp);
  $('#levelbox').innerHTML = S.persona ? `<b>Level ${li.level}</b> · ${li.pct}% to ${li.level + 1} · ${S.xp} XP
    <div class="xpbar"><i style="width:${li.pct}%"></i></div>` : '';
  $('#view').innerHTML = S.persona ? VIEWS[tab]() : personaPicker(true);
  AFTER[tab]?.();
}

function personaPicker(onboarding) {
  return `<h2>${onboarding ? 'Choose your mode' : 'Switch mode'}</h2>
  <p class="muted">${onboarding ? 'Pick how hard the game plays. You can drop down any time; moving up earns a badge.' : ''}</p>
  ${Object.entries(PERSONAS).map(([k, p]) => `
    <div class="panel persona ${S.persona === k ? 'sel' : ''}" onclick="pickPersona('${k}')">
      <h4>${p.icon} ${p.name}</h4><div class="muted">${p.desc}</div>
      <div class="muted">XP ×${p.xpMult} · Iron 75: ${CHALLENGE_ITEMS[k].length} daily tasks</div></div>`).join('')}`;
}
window.pickPersona = p => { setPersona(p); tab = 'card'; applyMissedDays(); render(); toast(`${PERSONAS[p].icon} ${PERSONAS[p].name} activated`); };

const VIEWS = {
  card() {
    const r = overall(S), st = stats(S), t = tier(r), P = PERSONAS[S.persona];
    return `<div class="card ${t}">
      <div class="tier">${t.toUpperCase()} · ${P.icon} ${P.name.toUpperCase()}</div>
      <div class="ovr">${r}</div><div class="muted" style="color:inherit">OVERALL</div>
      <div class="name">${S.name}</div>
      <div class="stats">${Object.entries(st).map(([k, v]) => `<div><b>${statRating(v)}</b>${k}</div>`).join('')}
        <div><b>${wkg(S).toFixed(2)}</b>W/KG</div></div></div>
      <div class="panel"><h3>Progress to target</h3>
      ${Object.values(S.metrics).map(m => bar(m.label, progress(m), `${m.current} → ${m.target}`)).join('')}
      ${bar('W/kg', wkgProgress(S), wkg(S).toFixed(2))}</div>
      <div class="panel muted">🔥 Streak: <b>${S.streak}</b> days (best ${S.bestStreak}) · Iron 75: Day <b>${S.challenge.day}</b>/75</div>`;
  },
  checkin() {
    const m = S.metrics, done = S.lastCheckin === today();
    const f = (k, step) => `<div><label>${m[k].label}</label><input type="number" step="${step}" id="in-${k}" value="${m[k].current}"></div>`;
    return `<h2>Daily check-in</h2>
      ${done ? '<div class="panel">✅ Already checked in today. You can still update numbers (no extra check-in XP).</div>' : ''}
      <div class="panel grid2">${f('weight', 0.1)}${f('ftp', 1)}${f('sleep', 0.5)}${f('steps', 100)}${f('hours', 0.5)}${f('strength', 1)}</div>
      <label class="check"><input type="checkbox" id="in-workout"> I trained today</label>
      <button style="width:100%;margin-top:10px" onclick="doCheckin()">Log it 💪</button>`;
  },
  challenge() {
    const c = S.challenge, items = CHALLENGE_ITEMS[S.persona], doneToday = c.lastDate === today();
    const rule = S.persona === 'goggins' ? 'Miss ANY item and you restart at Day 1.' :
      S.persona === 'athlete' ? 'Skip a whole day and you restart.' : 'Miss a day and the challenge pauses – no reset.';
    return `<h2>🔥 Iron 75</h2><div class="panel" style="text-align:center">
      <div class="big">Day ${c.day}</div><div class="muted">of ${CHALLENGE_LENGTH} · ${PERSONAS[S.persona].name} rules: ${rule}</div>
      <div class="xpbar"><i style="width:${c.day / CHALLENGE_LENGTH * 100}%"></i></div></div>
      ${items.map((it, i) => `<label class="check ${c.todays[i] ? 'done' : ''}">
        <input type="checkbox" ${c.todays[i] ? 'checked' : ''} ${doneToday ? 'disabled' : ''} onchange="tickItem(${i},this.checked)"> ${it}</label>`).join('')}
      ${doneToday ? '<div class="panel">✅ Today is banked. See you tomorrow.</div>'
        : `<button style="width:100%;margin-top:10px" onclick="completeDay()">Complete Day ${c.day + 1}</button>`}`;
  },
  badges() {
    return `<h2>Badges</h2><p class="muted">${S.badges.length}/${Object.keys(BADGES).length} unlocked</p><div class="badges">
      ${Object.entries(BADGES).map(([id, [ic, t]]) => `<div class="badge ${S.badges.includes(id) ? 'on' : ''}"><div class="ic">${ic}</div>${t}</div>`).join('')}</div>`;
  },
  history() {
    return `<h2>History</h2>${S.log.length < 2 ? '<p class="muted">Check in a few days to see your trend.</p>' : ''}
      <div class="panel"><canvas id="chart" height="260"></canvas></div>`;
  },
  settings() {
    const rows = Object.entries(S.metrics).map(([k, m]) => `<div class="panel"><b>${m.label}</b><div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
      <div><label>Baseline</label><input type="number" step="any" value="${m.base}" onchange="setMetric('${k}','base',this.value)"></div>
      <div><label>Target</label><input type="number" step="any" value="${m.target}" onchange="setMetric('${k}','target',this.value)"></div>
      <div><label>Weight in score</label><input type="number" step="0.5" value="${m.weight}" onchange="setMetric('${k}','weight',this.value)"></div></div></div>`).join('');
    return `${personaPicker(false)}<h3>Metrics</h3><div class="panel"><label>Name on card</label>
      <input value="${S.name}" onchange="S.name=this.value;save()"></div>${rows}
      <button class="ghost" onclick="if(confirm('Wipe all data?')){localStorage.removeItem(STORE_KEY);location.reload()}">Reset all data</button>`;
  },
};

// Hooks that run after a view is drawn (e.g. charts)
const AFTER = {
  history() {
    if (typeof Chart === 'undefined' || !$('#chart')) return;
    chart?.destroy();
    chart = new Chart($('#chart'), {
      type: 'line',
      data: { labels: S.log.map(e => e.date.slice(5)), datasets: [
        { label: 'Overall', data: S.log.map(e => e.ovr), borderColor: '#ff5a1f', yAxisID: 'y' },
        { label: 'FTP (W)', data: S.log.map(e => e.ftp), borderColor: '#ffb020', yAxisID: 'y1' },
        { label: 'Weight (kg)', data: S.log.map(e => e.weight), borderColor: '#2ee59d', yAxisID: 'y' } ] },
      options: { plugins: { legend: { labels: { color: '#e8ecf5' } } },
        scales: { x: { ticks: { color: '#8a93a8' } }, y: { ticks: { color: '#8a93a8' } },
                  y1: { position: 'right', ticks: { color: '#ffb020' }, grid: { display: false } } } },
    });
  },
};

const bar = (lbl, v, note) => `<div class="metricrow"><div class="lbl">${lbl}<div class="muted">${note}</div></div>
  <div class="bar"><i style="width:${v * 100}%"></i></div><div class="pct">${Math.round(v * 100)}%</div></div>`;

/* ---------- Actions ---------- */
window.setMetric = (k, field, val) => { S.metrics[k][field] = parseFloat(val); save(); };

window.doCheckin = () => {
  const m = S.metrics, num = k => parseFloat($('#in-' + k).value);
  const first = S.lastCheckin !== today();
  // Personal bests: FTP above best ever, or weight below lowest ever
  const pbFtp = num('ftp') > Math.max(m.ftp.current, ...S.log.map(e => e.ftp));
  const pbWt = num('weight') < Math.min(m.weight.current, ...S.log.map(e => e.weight));
  const weighedIn = num('weight') !== m.weight.current;
  for (const k of ['weight', 'ftp', 'sleep', 'steps', 'hours', 'strength']) m[k].current = num(k);
  if (first) {
    S.streak = (S.lastCheckin && daysBetween(S.lastCheckin, today()) === 1) || !PERSONAS[S.persona].streakBreaks ? S.streak + 1 : 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak); S.lastCheckin = today();
    addXP(XP.checkin, 'check-in');
    if ($('#in-workout').checked) addXP(XP.workout, 'workout');
    if (weighedIn) addXP(XP.weighin, 'weigh-in');
  }
  if (pbFtp || pbWt) addXP(XP.pb, 'NEW PB!');
  // One history point per day (overwrite today's if re-logged)
  S.log = S.log.filter(e => e.date !== today());
  S.log.push({ date: today(), ovr: overall(S), ftp: m.ftp.current, weight: m.weight.current });
  checkBadges(); save(); tab = 'card'; render();
};

window.tickItem = (i, on) => { S.challenge.todays[i] = on; save(); render(); };
window.completeDay = () => {
  const c = S.challenge, items = CHALLENGE_ITEMS[S.persona];
  // Beginner: "No alcohol (optional)" item doesn't need ticking
  const required = items.map((t, i) => i).filter(i => !items[i].includes('optional'));
  const allDone = required.every(i => c.todays[i]);
  if (!allDone) {
    if (S.persona === 'goggins') { c.day = 0; c.todays = {}; save(); render(); return toast('💀 Item missed. Back to Day 0. Stay hard.'); }
    return toast('Tick every task to bank the day');
  }
  c.day = Math.min(CHALLENGE_LENGTH, c.day + 1); c.lastDate = today();
  addXP(XP.challengeDay, `Iron 75 Day ${c.day}`); checkBadges(); save(); render();
};

document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
applyMissedDays();
render();

/* Demo data: open index.html?demo to seed 3 weeks of sample check-ins (overwrites local data) */
if (location.search.includes('demo')) {
  S = freshState(); S.persona = 'athlete';
  for (let d = 20; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10), t = 20 - d;
    Object.assign(S.metrics.ftp, { current: 240 + t }); Object.assign(S.metrics.weight, { current: +(102.8 - t * 0.2).toFixed(1) });
    S.metrics.hours.current = 7; S.metrics.strength.current = 2; S.metrics.sleep.current = 7; S.metrics.steps.current = 8500;
    S.streak = t + 1; S.bestStreak = S.streak; S.lastCheckin = date; S.xp += 60;
    S.log.push({ date, ovr: overall(S), ftp: S.metrics.ftp.current, weight: S.metrics.weight.current });
  }
  S.challenge.day = 12; S.challenge.lastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  checkBadges(); save(); history.replaceState(null, '', location.pathname); render();
}
