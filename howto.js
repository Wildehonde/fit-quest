/* Fit Quest · How-to explainers: animated stick-figure movements, form cues, common mistakes and test protocols.
   Loaded before app.js. Uses app globals (S, goalDef, hxWeight, hxDivLabel, modal) only at call time. */
'use strict';
// ---------- figure kinematics (two-link IK, figure faces right, ground y=108) ----------
const HT = { torso: 28, head: 10, arm: 13, leg: 17 };
function htIK(o, T, L, pick) {
  let dx = T[0] - o[0], dy = T[1] - o[1], d = Math.hypot(dx, dy); const m = 2 * L - 0.01;
  if (d > m) { dx *= m / d; dy *= m / d; d = m; T = [o[0] + dx, o[1] + dy]; }
  const b = Math.atan2(dy, dx), off = Math.acos(Math.min(1, d / (2 * L)));
  const c = [b + off, b - off].map(a => [o[0] + Math.cos(a) * L, o[1] + Math.sin(a) * L]);
  const J = pick === 'fwd' ? (c[0][0] > c[1][0] ? c[0] : c[1]) : pick === 'back' ? (c[0][0] < c[1][0] ? c[0] : c[1])
    : pick === 'up' ? (c[0][1] < c[1][1] ? c[0] : c[1]) : (c[0][1] > c[1][1] ? c[0] : c[1]);
  return [J, T];
}
// pose: {x, y (hip), t (torso lean, deg from vertical, + = forward), h1, h2 (hand targets), f1, f2 (foot targets), e, e2, k, k2 (joint bend picks)}
function htPose(p) {
  const r = (p.t || 0) * Math.PI / 180, P = [p.x, p.y], N = [P[0] + Math.sin(r) * HT.torso, P[1] - Math.cos(r) * HT.torso], H = [N[0] + Math.sin(r) * HT.head, N[1] - Math.cos(r) * HT.head];
  const [E1, W1] = htIK(N, p.h1, HT.arm, p.e || 'down'), [E2, W2] = htIK(N, p.h2 || p.h1, HT.arm, p.e2 || p.e || 'down');
  const [K1, F1] = htIK(P, p.f1, HT.leg, p.k || 'fwd'), [K2, F2] = htIK(P, p.f2 || p.f1, HT.leg, p.k2 || p.k || 'fwd');
  return { H, N, P, E1, W1, E2, W2, K1, F1, K2, F2, p };
}
const F2 = a => a.map(v => v.toFixed(1)).join(',');
// ---------- movement library (shared across similar goals) ----------
const fx = (o, k, dx = 0, dy = 0) => [o[k][0] + dx, o[k][1] + dy];
const MOVES = {
  run: { dur: 0.75, frames: [
    { x: 55, y: 76, t: 12, h1: [71, 58], h2: [44, 70], f1: [72, 107], f2: [36, 94] },
    { x: 55, y: 73, t: 12, h1: [44, 70], h2: [71, 58], f1: [36, 94], f2: [72, 107] }], scene: 'track' },
  ride: { dur: 1, frames: [0, 90, 180, 270].map(a => { const c = [56, 92], q = a * Math.PI / 180;
    return { x: 50, y: 66, t: 60, h1: [88, 62], h2: [88, 63], f1: [c[0] + 9 * Math.cos(q), c[1] + 9 * Math.sin(q)], f2: [c[0] - 9 * Math.cos(q), c[1] - 9 * Math.sin(q)] }; }), scene: 'bike' },
  swim: { dur: 1.4, frames: [
    { x: 40, y: 72, t: 90, h1: [93, 72], h2: [44, 76], f1: [7, 69], f2: [7, 76] },
    { x: 40, y: 73, t: 90, h1: [66, 95], h2: [62, 50], f1: [7, 76], f2: [7, 69], e2: 'up' },
    { x: 40, y: 72, t: 90, h1: [44, 76], h2: [93, 72], f1: [7, 69], f2: [7, 76] },
    { x: 40, y: 73, t: 90, h1: [62, 50], h2: [66, 95], f1: [7, 76], f2: [7, 69], e: 'up' }], scene: 'water' },
  row: { dur: 1.8, frames: [
    { x: 40, y: 96, t: 25, h1: [86, 72], f1: [76, 100], k: 'up' },
    { x: 28, y: 96, t: 5, h1: [66, 74], f1: [76, 100], k: 'up' },
    { x: 20, y: 96, t: -25, h1: [24, 80], f1: [76, 100], k: 'up', e: 'back' },
    { x: 30, y: 96, t: 10, h1: [70, 76], f1: [76, 100], k: 'up' }], scene: 'erg' },
  ski: { dur: 1.4, frames: [
    { x: 55, y: 74, t: 0, h1: [72, 24], h2: [70, 26], f1: [58, 108], f2: [52, 108] },
    { x: 48, y: 82, t: 45, h1: [64, 90], h2: [62, 90], f1: [58, 108], f2: [52, 108] }], scene: 'skierg' },
  squat: { dur: 2.2, frames: [
    { x: 52, y: 74, t: 5, h1: [50, 47], f1: [58, 108], f2: [55, 108] },
    { x: 37, y: 93, t: 35, h1: [51, 69], f1: [58, 108], f2: [55, 108] }], prop: 'backbar' },
  deadlift: { dur: 2.2, frames: [
    { x: 40, y: 85, t: 52, h1: [61, 94], f1: [58, 108], f2: [56, 108] },
    { x: 52, y: 74, t: 0, h1: [54, 73], f1: [58, 108], f2: [56, 108] }], prop: 'handbar' },
  bench: { dur: 2.2, frames: [
    { x: 62, y: 76, t: -90, h1: [36, 50], f1: [88, 108], k: 'up' },
    { x: 62, y: 76, t: -90, h1: [37, 68], f1: [88, 108], k: 'up' }], prop: 'handbar', scene: 'bench' },
  press: { dur: 2, frames: [
    { x: 52, y: 74, t: 0, h1: [59, 45], f1: [57, 108], f2: [50, 108] },
    { x: 52, y: 74, t: -3, h1: [53, 20], f1: [57, 108], f2: [50, 108] }], prop: 'handbar' },
  pullup: { dur: 2.2, frames: [
    { x: 55, y: 74, t: 0, h1: [56, 20], h2: [54, 20], f1: [54, 106], f2: [52, 106] },
    { x: 55, y: 52, t: 0, h1: [56, 20], h2: [54, 20], f1: [52, 84], f2: [50, 84], e: 'fwd', e2: 'fwd' }], scene: 'pullbar' },
  pushup: { dur: 1.6, frames: [
    { x: 44.3, y: 93.1, t: 66.6, h1: [70, 108], f1: [10, 108], k: 'up' },
    { x: 38.3, y: 104, t: 81.9, h1: [70, 108], f1: [10, 108], e: 'back', k: 'up' }] },
  plank: { dur: 3, frames: [
    { x: 42.6, y: 100.9, t: 77.8, h1: [84, 108], f1: [10, 108], k: 'up' },
    { x: 42.6, y: 99.6, t: 77.8, h1: [84, 108], f1: [10, 108], k: 'up' }] },
  sledpush: { dur: 0.9, frames: [
    { x: 40, y: 80, t: 60, h1: [84, 63], h2: [83, 65], f1: [58, 107], f2: [28, 100] },
    { x: 40, y: 79, t: 60, h1: [84, 63], h2: [83, 65], f1: [28, 100], f2: [58, 107] }], scene: 'sled' },
  sledpull: { dur: 1.1, frames: [
    { x: 38, y: 76, t: -15, h1: [58, 58], h2: [32, 72], f1: [50, 108], f2: [26, 108], e2: 'back' },
    { x: 38, y: 76, t: -15, h1: [32, 72], h2: [58, 58], f1: [50, 108], f2: [26, 108], e: 'back' }], scene: 'sledrope' },
  bbj: { dur: 2.6, frames: [
    { x: 30, y: 74, t: 0, h1: [34, 72], f1: [33, 108], f2: [30, 108] },
    { x: 34, y: 90, t: 45, h1: [56, 108], f1: [36, 108], f2: [34, 108] },
    { x: 44, y: 105, t: 84, h1: [74, 108], f1: [14, 108], k: 'up' },
    { x: 36, y: 90, t: 45, h1: [58, 108], f1: [38, 108], f2: [36, 108] },
    { x: 58, y: 60, t: 10, h1: [70, 24], h2: [68, 26], f1: [56, 92], f2: [52, 94] },
    { x: 74, y: 90, t: 35, h1: [94, 82], f1: [82, 108], f2: [79, 108] }] },
  farmers: { dur: 0.9, frames: [
    { x: 55, y: 74, t: 0, h1: [58, 75], h2: [53, 75], f1: [64, 108], f2: [46, 105] },
    { x: 55, y: 73, t: 0, h1: [58, 75], h2: [53, 75], f1: [46, 105], f2: [64, 108] }], prop: 'kbs' },
  lunges: { dur: 2.6, frames: [
    { x: 50, y: 74, t: 2, h1: [47, 46], f1: [53, 108], f2: [48, 108] },
    { x: 48, y: 91, t: 2, h1: [45, 63], f1: [70, 108], f2: [22, 106], k2: 'down' },
    { x: 50, y: 74, t: 2, h1: [47, 46], f1: [53, 108], f2: [48, 108] },
    { x: 48, y: 91, t: 2, h1: [45, 63], f1: [22, 106], f2: [70, 108], k: 'down' }], prop: 'bag' },
  wallball: { dur: 2, frames: [
    { x: 38, y: 92, t: 35, h1: [64, 70], ball: [66, 66] },
    { x: 52, y: 74, t: 0, h1: [62, 40], ball: [64, 36] },
    { x: 53, y: 72, t: -2, h1: [64, 22], ball: [93, 16] }].map(p => ({ f1: [58, 108], f2: [54, 108], ...p })), scene: 'wall', prop: 'ball' },
};
MOVES.wallsit = { dur: 3, frames: [{ x: 36, y: 82, t: 0, h1: [50, 80], f1: [58, 108] }, { x: 36, y: 82.6, t: 0, h1: [50, 80], f1: [58, 108] }], scene: 'wallL' };
// ---------- renderer (SVG + SMIL; one static frame when reduced motion is on) ----------
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function moveSVG(key, size = 220) {
  const M = MOVES[key] || MOVES.run, still = reduceMotion(), js = M.frames.map(htPose), loop = still ? [js[0]] : [...js, js[0]];
  const dur = `${M.dur}s`, A = (attr, vals) => still || new Set(vals).size === 1 ? '' : `<animate attributeName="${attr}" values="${vals.join(';')}" dur="${dur}" repeatCount="indefinite"/>`;
  const pl = (keys, cls) => { const v = loop.map(j => keys.map(k => F2(j[k])).join(' ')); return `<polyline class="${cls}" points="${v[0]}">${A('points', v)}</polyline>`; };
  const circ = (fn, r, cls) => { const v = loop.map(fn); return `<circle class="${cls}" r="${r}" cx="${v[0][0].toFixed(1)}" cy="${v[0][1].toFixed(1)}">${A('cx', v.map(x => x[0].toFixed(1)))}${A('cy', v.map(x => x[1].toFixed(1)))}</circle>`; };
  const line = (a, b, cls) => { const va = loop.map(a), vb = loop.map(b); return `<line class="${cls}" x1="${va[0][0].toFixed(1)}" y1="${va[0][1].toFixed(1)}" x2="${vb[0][0].toFixed(1)}" y2="${vb[0][1].toFixed(1)}">${A('x1', va.map(x => x[0].toFixed(1)))}${A('y1', va.map(x => x[1].toFixed(1)))}${A('x2', vb.map(x => x[0].toFixed(1)))}${A('y2', vb.map(x => x[1].toFixed(1)))}</line>`; };
  const scene = {
    track: '<line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/><line class="dash" x1="0" y1="113" x2="120" y2="113"/>',
    bike: '<g class="eq"><circle cx="24" cy="92" r="15"/><circle cx="94" cy="92" r="15"/><polyline points="24,92 56,92 46,64 82,64 94,92"/><line x1="56" y1="92" x2="82" y2="64"/><line x1="44" y1="64" x2="54" y2="64" class="thick"/><polyline points="82,64 86,58 92,60"/><circle cx="56" cy="92" r="3"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    water: '<path class="water" d="M0,67 q7,-4 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"/><rect class="pool" x="0" y="68" width="120" height="44"/>',
    erg: '<g class="eq"><line x1="6" y1="100" x2="100" y2="100" class="thick"/><circle cx="100" cy="86" r="11"/><line x1="78" y1="92" x2="78" y2="104"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    skierg: '<g class="eq"><rect x="88" y="18" width="10" height="90" rx="2"/><circle cx="93" cy="22" r="3"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    bench: '<g class="eq"><rect x="16" y="80" width="62" height="6" rx="2"/><line x1="24" y1="86" x2="24" y2="108"/><line x1="70" y1="86" x2="70" y2="108"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    pullbar: '<g class="eq"><line x1="26" y1="20" x2="86" y2="20" class="thick"/><line x1="26" y1="20" x2="26" y2="6"/><line x1="86" y1="20" x2="86" y2="6"/></g>',
    sled: '<g class="eq hxeq"><rect x="80" y="86" width="26" height="20" rx="2"/><line x1="84" y1="86" x2="84" y2="62" class="thick"/><line x1="78" y1="106" x2="110" y2="106" class="thick"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/><line class="dash" x1="0" y1="113" x2="120" y2="113"/>',
    sledrope: '<g class="eq hxeq"><rect x="94" y="90" width="22" height="16" rx="2"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    wall: '<g class="eq"><rect x="100" y="0" width="20" height="108"/><circle cx="96" cy="16" r="6" class="tgt"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
    wallL: '<g class="eq"><rect x="0" y="0" width="12" height="108"/></g><line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>',
  }[M.scene] || '<line class="gnd" x1="0" y1="108.5" x2="120" y2="108.5"/>';
  const prop = {
    backbar: () => circ(j => fx(j, 'N', -3, 1), 9, 'plate'),
    handbar: () => circ(j => j.W1, 9, 'plate'),
    kbs: () => circ(j => fx(j, 'W1', 0, 5), 4.5, 'kb') + circ(j => fx(j, 'W2', 0, 5), 4.5, 'kb'),
    bag: () => `<g>${circ(j => fx(j, 'N', -2, 0), 6, 'bag')}</g>`,
    ball: () => circ(j => j.p.ball, 6, 'ball'),
  }[M.prop];
  const ropes = M.scene === 'sledrope' ? line(j => j.W1, () => [94, 98], 'rope') : M.scene === 'skierg' ? line(j => j.W1, () => [93, 22], 'rope') : M.scene === 'erg' ? line(j => j.W1, () => [92, 86], 'rope') : '';
  // prosthetic: Matt's LEFT below-knee by default. Facing right, the left leg is the far one (leg 2).
  const pr = (typeof S !== 'undefined' && S.prosthetic) || 'left', farPro = pr === 'left', nearPro = pr === 'right';
  const leg = (n, far) => { const pro = far ? farPro : nearPro, K = 'K' + n, Fk = 'F' + n;
    return `${pl(['P', K], `limb ${far ? 'far' : ''}`)}${pro ? pl([K, Fk], 'pylon') + circ(j => j[K], 3.6, 'socket') : pl([K, Fk], `limb ${far ? 'far' : ''}`)}`; };
  return `<svg class="move" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${key} animation">${scene}
    ${pl(['N', 'E2', 'W2'], 'limb far')}${leg(2, true)}${pl(['P', 'N'], 'torso')}${leg(1, false)}${ropes}${prop ? prop() : ''}${pl(['N', 'E1', 'W1'], 'limb')}${circ(j => j.H, 8, 'head')}</svg>`;
}
// ---------- goal -> movement + coaching family ----------
function moveFor(L) {
  const id = L.id;
  if (id.startsWith('hx_')) return { ski: 'ski', push: 'sledpush', pull: 'sledpull', bbj: 'bbj', row: 'row', farmers: 'farmers', lunges: 'lunges', wb: 'wallball' }[L.station] || 'run';
  if (L.sport === 'run') return 'run'; if (L.sport === 'cycle') return 'ride'; if (L.sport === 'swim') return 'swim'; if (L.sport === 'row') return 'row';
  const m = id.match(/^str_([a-z]+)_/); if (m) return { squat: 'squat', legpress: 'squat', hip: 'squat', deadlift: 'deadlift', trapdl: 'deadlift', rdl: 'deadlift', row: 'deadlift', bench: 'bench', ohp: 'press' }[m[1]] || 'squat';
  return { bw_pushup: 'pushup', bw_dips: 'pushup', bw_pullup: 'pullup', bw_chinup: 'pullup', bw_plank: 'plank', bw_side: 'plank', bw_wallsit: 'wallsit' }[id] || 'run';
}
function familyFor(L) {
  if (L.id.startsWith('hx_')) return L.station ? 'hx_' + L.station : 'hx_run';
  const m = L.id.match(/^str_([a-z]+)_/); if (m) return { squat: 'squat', legpress: 'legpress', hip: 'hip', deadlift: 'deadlift', trapdl: 'trapdl', rdl: 'rdl', row: 'brow', bench: 'bench', ohp: 'press' }[m[1]];
  if (L.sport === 'bodyweight') return { bw_pushup: 'pushup', bw_dips: 'dips', bw_pullup: 'pullup', bw_chinup: 'pullup', bw_plank: 'plank', bw_side: 'sideplank', bw_wallsit: 'wallsit' }[L.id];
  return { run: 'run', cycle: 'ride', swim: 'swim', row: 'row' }[L.sport] || 'run';
}
const PRO = 'With a below-knee prosthetic: ';
const COACH = {
  run: { cues: ['Tall posture, slight lean forward from the ankles', 'Land with your foot under your hips, not out in front', 'Quick, light steps (around 170–180 per min is a common range)', 'Relaxed shoulders, arms swing front to back'],
    mistakes: ['Overstriding: heel landing far in front of the body', 'Going out too fast in the first km', 'Tense shoulders and clenched fists'],
    adaptive: PRO + 'a running-specific blade returns energy far better than a walking foot. Check socket fit and liner, and check your skin after long runs. Build mileage gradually, because the residual limb needs time to adapt too.' },
  ride: { cues: ['Saddle height: slight knee bend at the bottom of the stroke', 'Smooth circles: push over the top, pull through the bottom', 'Relaxed upper body, elbows soft, flat back', 'Steady cadence, 85–95 rpm for most efforts'],
    mistakes: ['Saddle too low or too high (knee pain, rocking hips)', 'Death grip on the bars', 'Mashing a big gear at low cadence'],
    adaptive: PRO + 'a bike fit is worth it. Many riders set the cleat further back on the prosthetic side and adjust saddle height for the prosthetic foot. The intact leg usually does more of the work, so watch for one-sided fatigue.' },
  swim: { cues: ['Long, flat body line with your head neutral, looking down', 'Reach forward, then catch with a high elbow and push back past the hip', 'Rotate the hips and shoulders together', 'Exhale steadily underwater, then take a quick breath to the side'],
    mistakes: ['Lifting the head to breathe, which drops the hips', 'Crossing over the centre line on entry', 'A big, tiring kick'],
    adaptive: PRO + 'most below-knee swimmers swim without the prosthesis, so the kick is asymmetric and less important. Put the focus on pull and body position. A pull buoy can help balance. Use a crutch or a water leg on deck.' },
  row: { cues: ['Sequence: legs → body swing → arms, then reverse on the way back', 'Drive through the heels with a straight back', 'Handle travels in a straight horizontal line', 'Recovery about twice as long as the drive'],
    mistakes: ['Pulling with the arms before the legs finish', 'Rushing up the slide on the recovery', 'Over-reaching and rounding the back at the catch'],
    adaptive: PRO + 'strap the prosthetic foot securely. Some athletes reduce knee flexion on that side or use an adaptive footplate, so check the shoe does not slip out.' },
  squat: { cues: ['Feet about shoulder width, toes slightly out', 'Brace your core before going down (big breath, tight belly)', 'Knees track over the toes; sit between your hips', 'Drive up with your chest and hips rising together'],
    mistakes: ['Knees caving in', 'Heels lifting or weight on the toes', 'Losing the brace and rounding at the bottom'],
    adaptive: PRO + 'a prosthetic foot has limited ankle bend. A small heel raise, a slightly wider stance or a box to set depth helps you squat deep with control. Load evenly and use a mirror to check the hips stay level.' },
  legpress: { cues: ['Feet mid-platform, hip width', 'Lower until your hips stay down on the pad (no tail-tuck)', 'Press through the whole foot', "Don't lock the knees hard at the top"],
    mistakes: ['Going so deep that the lower back lifts off the pad', 'Pushing with the toes only', 'Bouncing out of the bottom'],
    adaptive: PRO + 'place the prosthetic foot securely, flat on the plate. A single-leg set on the intact side is a useful extra test.' },
  hip: { cues: ['Upper back on the bench edge, bar over the hip crease (pad it)', 'Shins vertical at the top', 'Tuck the chin and ribs, squeeze the glutes to lock out', 'Pause briefly at the top'],
    mistakes: ['Arching the lower back instead of extending the hips', 'Feet too far forward (hamstrings take over)', 'Partial reps'],
    adaptive: PRO + 'set both feet flat. The prosthetic side may need the foot slightly closer to stay stable.' },
  deadlift: { cues: ['Bar over mid-foot, shins close', 'Hinge to grip; flat back, lats tight ("bend the bar")', 'Push the floor away; the bar stays in contact with the legs', 'Stand tall and lock out the hips; no lean-back'],
    mistakes: ['Rounding the lower back', 'Hips shooting up first', 'Bar drifting away from the body'],
    adaptive: PRO + 'grip and set your stance with the prosthetic foot fully flat. Many below-knee lifters prefer the trap bar because it keeps the load centred.' },
  trapdl: { cues: ['Stand centred in the trap bar with handles in line with the ankle bone', 'Hinge and bend the knees; chest up, flat back', 'Push through the floor, hips and shoulders rise together', 'Stand tall; squeeze the glutes at lockout'],
    mistakes: ['Standing off-centre so the bar tips', 'Squatting it with a vertical torso and a rounded back', 'Jerking the bar off the floor'],
    adaptive: PRO + 'the trap bar keeps the load centred, which suits a prosthetic. Check both feet are flat and you are standing centred before the pull.' },
  rdl: { cues: ['Soft knees, hips push back', 'Bar slides down the thighs', 'Lower until you feel the hamstrings stretch (around mid-shin)', 'Flat back throughout'],
    mistakes: ['Turning it into a squat', 'Rounding the back to go lower', 'Bar drifting forward'],
    adaptive: PRO + 'balance can shift toward the intact leg, so film yourself to check the hips stay square.' },
  brow: { cues: ['Hinge to about 45° with a flat back', 'Pull the bar to the lower ribs', 'Elbows drive back, shoulder blades squeeze', 'Lower under control'],
    mistakes: ['Standing up as you pull', 'Using momentum (hip jerk)', 'Shrugging the shoulders up to the ears'],
    adaptive: PRO + 'a staggered or wider stance helps the hinge feel stable.' },
  bench: { cues: ['Eyes under the bar, shoulder blades pinched and down', 'Feet planted, slight arch, glutes on the bench', 'Lower to the lower chest with elbows about 45–70° from the body', 'Press up and slightly back over the shoulders'],
    mistakes: ['Bouncing the bar off the chest', 'Hips lifting off the bench', 'Elbows flared at 90°'],
    adaptive: PRO + 'make sure the prosthetic foot has good grip on the floor for leg drive. A plate under that foot can help it reach the floor if needed.' },
  press: { cues: ['Bar in the front rack, grip just outside the shoulders', 'Squeeze the glutes and brace; no leaning back', 'Move your head back and press straight up, then head "through" at the top', 'Lock out with the bar over mid-foot'],
    mistakes: ['Big lean-back (turns into a standing incline press)', 'Using leg drive (that makes it a push press)', 'Pressing the bar out in front'],
    adaptive: PRO + 'take a slightly wider stance for balance.' },
  pullup: { cues: ['Start from a dead hang with arms fully straight', 'Shoulders down and back first, then pull the elbows to the ribs', 'Chin clearly over the bar', 'Lower all the way under control'],
    mistakes: ['Half reps (not getting chin over the bar or not straightening the arms)', 'Kipping or swinging', 'Shrugging into the ears'],
    adaptive: PRO + 'remove the prosthesis or keep it on, but do the same each test because it changes your bodyweight.' },
  pushup: { cues: ['Hands under the shoulders, body straight from head to heels', 'Brace the core and squeeze the glutes', 'Lower until the chest is about a fist from the floor', 'Elbows about 45° from the body; full lockout at the top'],
    mistakes: ['Hips sagging or piking', 'Half reps', 'Head dropping before the chest'],
    adaptive: PRO + 'balance on the toes of the intact foot and the prosthetic foot (or the socket on a pad). Keep it the same for every test.' },
  dips: { cues: ['Start locked out, shoulders down', 'Lean slightly forward', 'Lower until the upper arm is at least parallel to the floor', 'Press back up to full lockout'],
    mistakes: ['Shallow reps', 'Shoulders rolling forward at the bottom', 'Swinging the legs'],
    adaptive: PRO + 'test with or without the prosthesis, but do it the same way each time.' },
  plank: { cues: ['Elbows under the shoulders, forearms parallel', 'Straight line from head to heels', 'Brace as if about to be poked in the belly; squeeze the glutes', 'Breathe steadily'],
    mistakes: ['Hips sagging', 'Hips piked high', 'Holding your breath'],
    adaptive: PRO + 'set the prosthetic foot on a non-slip mat. The time stops the moment your form breaks.' },
  sideplank: { cues: ['Elbow under the shoulder', 'Hips lifted in a straight line', 'Stack the feet (or stagger them for balance)', 'Test both sides; the weaker side counts'],
    mistakes: ['Hips dropping', 'Rolling forward', 'Testing only your stronger side'],
    adaptive: PRO + 'staggered feet are fine. Keep them the same each test.' },
  wallsit: { cues: ['Back flat on the wall', 'Thighs parallel to the floor, knees over the ankles', 'Hands off the legs', 'Weight even through both feet'],
    mistakes: ['Sitting too high', 'Pushing with the hands on the thighs', 'Shifting all the load to one leg'],
    adaptive: PRO + 'it is normal to load the intact leg more. Try to keep it even and note how it feels.' },
  hx_run: { cues: ['Settle into goal pace within 200 m of leaving the station', 'Shorter, quicker steps on heavy legs', 'Use the run to breathe down and plan the next station', 'Even splits: run 1 shouldn’t be your fastest by much'],
    mistakes: ['Sprinting run 1', 'Walking out of the Roxzone', 'Ignoring fuel and water (races last 60–120 min)'],
    adaptive: PRO + 'HYROX has Adaptive divisions (e.g. Lower Limb Minor) with their own classification and modified standards. Check the current adaptive rulebook.' },
  hx_ski: { cues: ['Arms high, hinge at the hips, pull the handles down past the thighs', 'Use body weight, not just the arms', 'Small knee bend; return tall', 'Hold a steady 500 m split you can sustain'],
    mistakes: ['Arms-only pulling', 'Squatting deep every stroke', 'Starting too hard'],
    adaptive: PRO + 'a slightly staggered stance helps stability.' },
  hx_push: { cues: ['Low body angle with straight arms (or hands high on the poles)', 'Short, powerful steps driving through the balls of the feet', 'Keep it moving; restarting a stopped sled is the hardest part', 'Turn at each 12.5 m lane end quickly'],
    mistakes: ['Standing too upright', 'Long strides that slip', 'Stopping mid-lane'],
    adaptive: PRO + 'grip on the prosthetic foot matters, so wear a good shoe. In the Adaptive divisions the distance and weight can differ; the screen shows yours.' },
  hx_pull: { cues: ['Stay behind the line/box while pulling', 'Hand-over-hand with a strong hip hinge, using legs and back', 'Keep the rope tidy in the box', 'Walk back and repeat for each 12.5 m length'],
    mistakes: ['Pulling only with the arms', 'Stepping outside the area (penalty)', 'Rope tangled at the feet'],
    adaptive: PRO + 'a wider, staggered stance gives a stable base to pull from.' },
  hx_bbj: { cues: ['Chest and thighs touch the floor every rep', 'Step or jump the feet back up, then jump forward', 'Both feet take off and land together', 'Find a rhythm; don’t over-jump'],
    mistakes: ['Jumps that aren’t two-footed', 'Landing staggered or stepping into the jump (take off and land on both feet)', 'Going out too fast and blowing up'],
    adaptive: PRO + 'landing loads the prosthetic side hard. Adaptive divisions may modify this station, so check the rulebook and practise short, controlled jumps.' },
  hx_row: { cues: ['Legs → body → arms, then back again', 'Damper is your choice (many use about 5–7)', 'Hold a steady split; strokes around 26–30 per min', 'Use it to bring your heart rate down a little'],
    mistakes: ['Rushing the slide', 'Arms bending too early', 'Feet not strapped firmly'],
    adaptive: PRO + 'strap the prosthetic foot tightly. Some need a little less knee bend on that side.' },
  hx_farmers: { cues: ['Pick up with a hinge and a flat back', 'Tall posture, shoulders packed', 'Quick, short steps', 'If you drop, put the bells down and restart from the same spot'],
    mistakes: ['Long strides that swing the bells', 'Shrugging and gripping too tight from the start', 'Dropping without a plan'],
    adaptive: PRO + 'shorter steps keep the carry stable on the prosthetic side.' },
  hx_lunges: { cues: ['Sandbag over the shoulders (not held in front)', 'Back knee touches the floor every rep', 'Stand fully upright between steps', 'Keep the torso upright'],
    mistakes: ['Back knee not touching (no-rep)', 'Bag slipping off the shoulders', 'Steps too short to balance'],
    adaptive: PRO + 'kneeling on the prosthetic side needs a pad or liner protection. Adaptive divisions may modify this station, so check the rulebook.' },
  hx_wb: { cues: ['Squat until the hip crease is below the knee', 'Drive up and throw in one motion', 'Ball must hit the target (3.0 m men / 2.7 m women)', 'Catch and go straight into the next squat'],
    mistakes: ['Shallow squats (no-rep)', 'Ball missing the target', 'Big unplanned breaks; plan sets like 20s or 25s'],
    adaptive: PRO + 'Adaptive divisions may use a different ball and target, shown under your division.' },
};
// Test protocols per goal (kind/sport aware). Plain-English, conservative.
function testProtocol(L) {
  const id = L.id, k = L.kind, n = L.n;
  if (id === 'cyc_ftp') return ['Warm up about 20 min including 3 × 1 min at high cadence. Optional: the classic protocol adds a 5-min hard effort, then 10 min easy.', 'Ride 20 min as hard as you can hold evenly. Start a little conservative and finish strong.', 'Use the same power meter or trainer each time, with ERG mode off.', 'Enter your 20-min average power. FTP ≈ 95% of it (the app does this).', 'Cool down 10 min. Retest every 4–8 weeks.'];
  if (id === 'cyc_5s') return ['Warm up 15–20 min, including 2–3 short 5–6 s spin-ups with full recovery.', 'Pick a big-ish gear (or set the trainer to level/slope mode, ERG off) and start rolling at about 20–30 km/h.', 'Sprint all-out for 5–8 s: seated if you want repeatability, or out of the saddle for max watts. Note which you used and keep it the same.', 'Rest 3–5 min fully, then do one more. Enter your best 5 s peak power.', 'Test fresh, before any hard intervals.'];
  if (id === 'cyc_1min') return ['Warm up 15–20 min with 2–3 short openers.', 'From a rolling start, go hard for 60 s: strong but not a flat sprint for the first 10 s, then hold on.', 'Same trainer/power meter each time, ERG off.', 'Enter the 1-min average power. Rest at least 10 min before any repeat.'];
  if (id === 'cyc_20min') return ['Warm up about 20 min on the trainer, including 3 × 1 min at high cadence and 5 min easy after.', 'Ride 20 min at the highest power you can hold evenly. Start slightly conservative, build in the last 5 min.', 'Use the same trainer or power meter each test, ERG mode off, fan on.', 'Enter your raw 20-min average power. Tip: 20-min power × 0.95 ≈ FTP (the FTP goal does this for you).', 'Cool down 10 min. Retest every 4–8 weeks.'];
  if (L.sport === 'cycle' && k === 'watts') return ['Warm up 15–20 min with 2–3 short openers.', `Ride ${L.name.split(' ')[0]} at the highest average power you can hold. Pace evenly and don’t sprint the first 20 s.`, 'Use the same device and setup each test.', 'Enter the average power for the effort.'];
  if (id === 'swim_css') return ['Warm up about 400 m easy, plus 4 × 50 m building pace.', 'Swim 400 m all-out from a push start. Record T400.', 'Recover 5–10 min with easy swimming.', 'Swim 200 m all-out from a push start. Record T200.', 'CSS per 100 m = (T400 − T200) ÷ 2. Enter that pace.'];
  if (L.hx) {
    if (id === 'hx_run') return ['Comes from the 8 run splits of a race or simulation (log a Hyrox race and it fills in automatically).', 'In training, test it as 1 km run straight after a station effort, not fresh.', 'Use a measured 1 km (track or treadmill at 1% incline).'];
    if (id === 'hx_rox') return ['Roxzone is the total transition time in a race (from your official results).', 'In a sim, time from finishing each run to starting each station and back.'];
    if (id === 'hx_half') return ['4 × (1 km run + station), using stations 1–4 or 5–8 at your division weights.', 'Warm up 10–15 min including a few strides and light station reps.', 'Race pace, stopwatch running the whole time, transitions included.', 'Use the same half each time so results compare.'];
    if (id === 'hx_full') return ['Build-up goal: half-sims and station sessions count as stepping stones.', 'The PB is set by a full race: 8 × (1 km run + station) with roxzone.', 'Log it via Log workout → Hyrox race to capture every split.'];
    const st = { ski: 'SkiErg 1000 m on the monitor.', push: '50 m sled push in 4 × 12.5 m lengths.', pull: '50 m sled pull in 4 × 12.5 m lengths, hand-over-hand, staying behind the line.', bbj: '80 m burpee broad jumps: chest and thighs to the floor, two-footed jump forward.', row: 'Row 1000 m on the monitor.', farmers: '200 m farmers carry with two kettlebells.', lunges: '100 m sandbag lunges: back knee touches every rep, bag on the shoulders.', wb: '100 wall balls: hip crease below the knee, ball hits the target.' }[L.station];
    return [`Standard: ${st}${hxWeight(L.station) ? ` Weight for ${hxDivLabel()}: ${hxWeight(L.station)}.` : ''}`, 'Warm up 10–15 min including light reps of the station.', 'For race-realistic numbers, run 1 km at race pace first, then go straight into the station.', 'Time from the first rep or step to the last. Breaks count.', 'Standards change between seasons, so check the current HYROX rulebook.'];
  }
  if (k === 'rm') return n === 1
    ? ['General warm-up 5–10 min, then bar × 10.', 'Ramp: about 50% × 5, 70% × 3, 80% × 2, 90% × 1 (of your expected max).', 'Then singles in 2.5–5 kg jumps with 3–5 min rest. Aim to find the max within about 3 attempts after 90%.', 'Counts: full range to standard depth or lockout, with no help. Use safeties or a spotter.', 'Stop when bar speed drops sharply or form breaks.']
    : ['General warm-up, then bar × 10.', 'Ramp: about 50% × 8, 65% × 5, 75% × 3.', 'Work sets of 5, adding 2.5–5 kg each time with 3–4 min rest. Take at most 3–4 working attempts.', 'Counts: 5 clean reps at full range with no grinding breakdowns. The app estimates 1RM (Epley).', 'Use safeties or a spotter.'];
  if (k === 'reps') return ['Warm up 5 min plus a few easy reps; rest 3 min.', 'One all-out set to failure of good reps.', 'Only full-range reps count (see the form cues). No rest at the bottom or top beyond a breath.', 'Test fresh, ideally before other training.'];
  if (k === 'hold') return ['Warm up 5 min (light mobility and a short practice hold), then rest 2 min.', 'Start the clock in a good position.', 'Stop the time the moment form breaks (hips sag or pike, knee touches, hands leave).', L.id === 'bw_side' ? 'Test both sides and log the weaker one.' : 'One attempt per session.'];
  if (k === 'far') return ['Warm up 10–15 min easy plus 3–4 strides.', 'Run the full time on a measured track or reliable GPS.', 'Pace evenly; the distance at the bell counts.'];
  if (L.type === 'build') return [`Build-up: every ${L.sport === 'cycle' ? 'ride' : L.sport} session counts toward your longest distance.`, 'Increase your longest session by roughly 10% a week, and ease back every 3–4 weeks.', 'The PB is set when you complete the full distance in one continuous effort (event or solo).', 'Practise fuelling and pacing on the long sessions.'];
  if (L.sport === 'swim') return ['Warm up 300–400 m mixed, plus 4 × 25 m building pace.', 'Push start (no dive) unless you always dive. Be consistent.', 'Count lengths carefully (25 m vs 50 m pool), or use a lap counter.', 'Pace evenly and record total time.'];
  if (L.sport === 'row') return ['Warm up 10 min including 3 × 20 s building pace.', 'Set the damper you always use (drag factor about 110–130 is common), with the monitor on distance.', 'Pace evenly: settle into the target split after the start.', 'The monitor time counts.'];
  if (L.sport === 'cycle') return ['Use a flat out-and-back route, or the same trainer course each time.', 'Warm up 15–20 min with a few short openers.', 'Ride at a steady effort. No drafting.', 'Moving time over the full distance counts.'];
  return [`Warm up 10–15 min easy, plus drills and 3–4 × 20 s strides${L.dist && L.dist <= 1.7 ? ', plus 1–2 short race-pace efforts' : ''}.`, 'Use a measured track or flat certified route (parkrun is fine). GPS can be off by about 2%.', L.dist && L.dist <= 1.7 ? 'Run all-out but controlled for the first 200 m.' : 'First km no faster than goal pace; aim for even or slightly negative splits.', 'Counts: the full distance with the watch running the whole time. Retest every 4–6 weeks, not the day after a hard session.'];
}
function howtoHTML(id) {
  const L = goalDef(id), mv = moveFor(L), fam = COACH[familyFor(L)] || COACH.run, pro = typeof S !== 'undefined' && S.prosthetic && S.prosthetic !== 'none';
  return `<div class="howto ${L.hx ? 'hx' : ''}"><div class="grab"></div><h2>${L.name}</h2><p class="muted">How to · ${sportName(L.sport)}${L.station && hxWeight(L.station) ? ` · ${hxWeight(L.station)}` : ''}</p>
    <div class="movebox">${moveSVG(mv)}</div>
    <h3>✅ Key form cues</h3><ul class="cues">${fam.cues.map(c => `<li>${c}</li>`).join('')}</ul>
    <h3>⚠️ Common mistakes</h3><ul class="mist">${fam.mistakes.map(c => `<li>${c}</li>`).join('')}</ul>
    <h3>⏱️ How to test this properly</h3><ol class="proto">${testProtocol(L).map(c => `<li>${c}</li>`).join('')}</ol>
    ${fam.adaptive && pro ? `<div class="adapt">♿ ${fam.adaptive}</div>` : ''}
    <p class="muted small">General guidance, not medical advice. Stop if you feel pain.</p></div>`;
}
window.howto = (id, ev) => { if (ev) { ev.stopPropagation(); ev.preventDefault(); } modal(howtoHTML(id)); };
const infoBtn = id => `<span class="info" role="button" tabindex="0" aria-label="How to" onclick="howto('${id}',event)">i</span>`;
