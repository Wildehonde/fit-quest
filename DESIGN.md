# Fit Quest: design notes (v2, agreed with Matt 11 Oct 2026)

## Build status (12 Oct 2026)
v2 core is **BUILT** (static app, localStorage + IndexedDB, no backend). Marked inline as ✅ built, 🟡 partly, ⏳ later.
v1 saves (`fitquest-v1`) migrate automatically to `fitquest-v2`; the v1 key is kept as a backup.

## Avatar: bobblehead caricature ✅ built (12 Oct 2026)
- An inline SVG cartoon (big head, small body) animated with CSS only, so it works offline. It sits on the athlete Card, the reward screen, the Settings preview and the share cards (drawn into the PNG).
- **5 body stages from the overall rating**: 1 Couch Starter (<55), 2 Getting Going (55+), 3 Solid (62+), 4 Athlete (70+), 5 Elite Machine (80+). The build changes from soft and round (wide torso, belly, chubby cheeks, small shoulders) to lean and muscular (narrow waist, abs, big shoulders and arms). Stage changes ease with a springy 1.4 s transition (the last shown stage is stored as `avShown`).
- **Animations**: idle bob, breathing and blinking. A celebration (jump, arms up, confetti) plays for 15 min after a PB or level-up, and always on the reward screen. A sad slump (head down, desaturated, tear) shows on the day the streak breaks until you log a workout. Respects prefers-reduced-motion.
- **Kit unlocks** (auto-equipped once, toggle in Settings): headband (level 2), race shades (first PB), sweatbands (7-day streak), tri suit (level 5), cycling helmet (FTP 260 W or level 7), tri bike (level 8), finisher medal (Iron finish, a build-up distance or all baselines), Goggins hoodie (Goggins mode + 7-day streak), **carbon running blade (level 12)**, which replaces the pylon and foot on the prosthetic side.
- **Customisation** (Settings › Avatar): 6 skin tones, 5 hair styles × 6 colours, 5 beard options, and the prosthetic side (default **LEFT below-knee**, drawn on the avatar's left leg, i.e. the viewer's right).
- See `screenshots/avatar-stages.png`, `avatar-card.png` and `avatar-kit-moods.png`.

## Profile: prosthetic side ✅ built
- Matt has a **LEFT below-knee** prosthetic. `S.prosthetic` defaults to `'left'` (Settings › Profile: Left / Right / None). The sample photo silhouettes draw it on the subject's left (viewer's right from the front, viewer's left from the back). Any future avatar should read this field.

## Goals-based tracking (v3, 12 Oct 2026) ✅ built
Matt found the v2 metrics too broad, so tracking is now built around **specific benchmark goals** he picks up front.
- Onboarding: intensity → tracking depth → **sports** (Running, Cycling, Swimming, Rowing, Strength, Bodyweight) → **goals** per sport, each with an optional target (defaults scaled by intensity, times entered as mm:ss) → weight/FTP → habits. Editable later in Settings › Sports & goals or Train › Edit goals.
- Catalog: Running 400 m, 1 km, 1 mile, 3 km, 5 km, parkrun 5 km, 10 km, 15 km, 21.1 km, 42.2 km, furthest in 30/60 min. Cycling FTP (20-min test, FTP = 95%), 5-min and 1-min power, 10/20/40 km TT, 100 km ride. Swimming 50/100/200/400/750 m, 1.5/1.9/3.8 km, CSS pace. Rowing 500 m, 2 km, 5 km, 10 km erg. Strength 1RM and 5RM for squat, deadlift, trap-bar deadlift, bench, OHP, row, leg press, RDL, hip thrust. Bodyweight max push-ups/pull-ups/chin-ups/dips, plank/side-plank/wall-sit holds.
- Logging = pick the goal(s) attempted and enter the result: a time for distances (lower is better), watts for power, kg × reps for lifts (est. 1RM/5RM via Epley), reps or seconds for bodyweight. PBs, history charts (time charts are inverted, so up = faster) and progress are per goal; active goals' average progress is half of the overall rating (with weight, W/kg and consistency). The broad hours/sleep/steps/strength-per-week metrics were dropped from the score (sleep and steps live on as habits).
- **General training session**: sport + duration (+ optional km). Counts for XP, streak and "trained", no PB.
- **Two goal types and the 14-day baseline rule**:
  - *Test* goals (1–10 km runs, FTP, power, TTs, short swims, CSS, erg tests, lifts, bodyweight): need a real attempt within 14 days of being picked.
  - *Build-up* goals (15 km, half and full marathon, 1.5/1.9/3.8 km swims, 100 km ride, 10 km row): any logged session in that sport within 14 days is the stepping-stone baseline. Their chart shows the longest distance so far building toward the full distance (up to 80% of progress); the real PB is the finish time when you complete the distance (the last 20%).
  - Home shows a **Baseline week** checklist with a countdown per goal ("Set your 5 km baseline – 9 days left"); ≤3 days left turns red with ⚠️, and the log flow lists "Needs a baseline" first.
  - After 14 days with no baseline the goal is **Parked**: kept, shown dimmed in a Parked list, left out of the rating, no more prompts. One-tap **Re-activate** starts a fresh 14-day window.
  - 🎯 **Baselines Locked In** badge: every goal (min 3) got its baseline in time, with none ever parked. 🏅 Distance Finisher for completing a build-up distance.
- Migration from v2 exercises: lifts → the matching 1RM goal, pull-ups/push-ups/dips/plank/side plank → the matching bodyweight goal, FTP test → FTP (×0.95), 20-min and 5-min power efforts → FTP / 5-min power, runs/swims/rows within 10% of a goal distance → that goal (time scaled to the exact distance). Everything else becomes a general training session in the right sport. Migrated goals keep their first session as the baseline.
- Bug fixed: the log flow no longer asks about "Trained today" again. Logging implies it, and step 3 shows "✅ Trained today counted from this log". The Today check-in no longer has an "I trained today" box.

## Daily flow: built around "I just finished a workout" ✅ built (12 Oct 2026, from Matt's v2 feedback)
- The app opens on **Home**: one big **Log workout** button, the streak, the rating, Iron days, and a Today status (workout / habits / Iron day). There's a dismissible first-run hint.
- Log flow: 1) **Pick**: your sports as quick buttons, a General training session tile, Needs a baseline, Recent, Suggested today (oldest-done first, one per type, skipping types trained in the last day), and all my exercises. Multi-select.
  2) **Numbers**: prefilled from last time (or sensible seeds), big −/+ steppers per field, add/remove sets. Rides log duration + distance + avg watts (watts optional); runs and swims log distance + time.
  3) **Habits**: today's habits on the same flow, with "Trained today" auto-ticked, plus an optional weigh-in stepper (Detailed mode).
  4) **Reward**: XP gained (level-up callout), the streak, PBs with a comparison to last session, new badges or habit slots, then **Share** (opens the share card) or **Done**.
- Card, Train, Iron 75, Photos and More are secondary tabs. Today (the full habit screen with wishlist and override) is reached from Home › Habits.

## Onboarding ✅ built
1. Intensity: Beginner / Athlete / Goggins (can drop down or move up anytime; badge for moving up).
2. Tracking depth: High level (daily yes/no habits) or Detailed (workout metrics). Can switch later.

## Detailed mode: exercise tracker ✅ built in v2, replaced in v3 by goals-based tracking (see above) (was a 22-exercise library, 10 suggested, SVG history charts with PB markers, volume bars, target line, 4W/3M/All)
- Long exercise library grouped by type (strength, cardio, bodyweight, cycling).
- App suggests 10 exercises + targets (based on first log + intensity); user can change manually.
- Log sets x reps x weight (or time/distance/watts); instantly compare to last session (e.g. +10kg, volume +25%).
- PBs give bonus XP and a "PB!" moment.
- Per-exercise history chart (key feature Matt loves).
- Each exercise's progress bar to target rolls up into overall level/rating.

## Progress photos ✅ built (IndexedDB; live-camera ghost overlay where the browser allows, upload fallback; drag slider; time-lapse; tags; Goggins mandatory banner)
- Weekly photo day: front/side/back, ghost overlay of last photo for consistent pose.
- Side-by-side Week 1 vs now with drag slider; time-lapse playback.
- Tagged with that week's weight and level.
- Stored on device only by default.
- Goggins: weekly photo mandatory (part of challenge). Beginner: optional.

## Still to shape (🟡 high-level daily checks use the habit system for now)
- High-level mode daily checks (4-5 items).
- Challenge mode (own 75 Hard version) per intensity.

## Iron 75 ✅ built as tiers (30/60/75 days, pause/reset/strict)
- Beginner (30 days): 1 workout 30+ min, 2L water, no alcohol weekdays. Missed day pauses.
- Athlete (60 days): 1 workout/day 45+ min, 3L water, protein target, no alcohol, 10 pages. Missed day resets.
- Goggins (75 days): 2x45 min (indoor or outdoor), 4L water, strict diet, no alcohol, 10 pages, weekly photo. Any miss resets.
- High-level daily checks (draft): trained, ate clean, 7h+ sleep, steps, no alcohol.

## Later features (all wanted) ⏳ not built yet
- Social: friends, compare levels/streaks, shared Iron 75.
- Coach voice per mode (Goggins harsh, Beginner encouraging).
- Real rewards at levels (card skins, treat meal, kit).
- Planned rest/recovery days count as wins.
- Imports: Strava/TrainingPeaks, smart scale.
- AI coach: "Analyse my week" + ask-anything, using logged data. Needs small backend to hold the AI key (same backend as social). Start with one built-in coach; bring-your-own-AI later.

## Earn-your-habits progression (added 12 Oct 2026) ✅ built (10-habit catalog incl. stump/liner care; week = Mon–Sun)
- Default (overridable): start with 3 core habits (e.g. trained, 7h+ sleep, no alcohol); Goggins may start with 5.
- Hit current habits on 6 of 7 days for a week to unlock one new habit slot.
- New ideas (e.g. apple cider vinegar, multivitamins) go to a wishlist until a slot unlocks.
- Two weak weeks in a row pauses the newest habit instead of failing everything.
- Override: unlock all upfront with a warning; forfeits the "earned it" badge.

## Shareable output (added 12 Oct 2026) ✅ built (1080×1920 / 1080×1080 PNG; dark, light, transparent sticker; Web Share with download fallback; weight/photo opt-in)
- One-tap share card sized for Instagram/WhatsApp stories (9:16) and square posts: athlete card rating, XP level, streak, Iron 75 day count, newly unlocked habit or badge.
- Save-to-photos and native share sheet; clean branded look that screenshots well.
- Privacy: no body photos or weight on the card unless the user opts in.
- Overlay style (Strava/Apple Fitness/Whoop pattern): transparent-background PNG option for stickers over photos/videos; bold condensed sans (e.g. Inter/Barlow Condensed), white text with subtle drop shadow so it reads on any background; one accent colour; large numbers, small labels; light and dark variants.

## Hyrox (v3.2)
- **Sport** `hyrox` 🟨 in onboarding/Settings sport picker. 12 goals: 8 station times (`hx_ski`, `hx_push`, `hx_pull`, `hx_bbj`, `hx_row`, `hx_farmers`, `hx_lunges`, `hx_wb`), `hx_run` (avg compromised 1 km split), `hx_rox` (total roxzone), `hx_half` (half-sim, test) and `hx_full` (full race, **build-up**: half-sims/station practice in the sport count as baseline). Default targets scale with intensity via `newGoal`.
- **Division** `S.hyrox = {div: open|pro|adaptive, cat, adapt: llminor|llmajor}` set in the goal picker and Settings. `hxWeight(station)` shows the official load on goal rows, the goal detail page and the race form. Adaptive values come from the 25/26 adaptive rulebook; any value I couldn't confirm reads "see adaptive rulebook". Doubles Mixed reads "check event rulebook". Below-knee prosthetic users see a hint pointing to Adaptive · Lower Limb Minor.
- **Race log** (`hx_race`, kind `race`): a striped tile in Log step 1 opens a form with 8 runs, 8 stations and roxzone (m:ss), prefilled from the last race and showing a live total plus the delta. `saveRace()` stores `{runs, st, rox, total}` and creates derived sessions for each station, the run average, roxzone and the full race, so every goal updates. Each station PB earns +25 XP, and the count goes in `stationPBs`.
- **Chart** `raceChart(cur, prev)`: two stacked SVG bars (runs grey, stations yellow, roxzone orange) for this race vs the previous one, plus a split table with the delta and 🏆 marks. It shows on the reward screen and in Train → Hyrox races.
- **Accent**: `.hx` / `.hxpanel` use #ffe000 on black.
- **Badges**: First Hyrox, Half-sim, Sub-90, Sub-75, Station Sweep (8 station PBs in one race). **Kit**: Hyrox vest (yellow/black, "HYROX"), unlocked by First Hyrox and auto-equipped.

## Goal cap (v3.3)
- **Cap:** each sport allows 3 active goals (`GOAL_CAP`). `capFor(sp)` adds any slots earned in `S.goalSlots[sp]`. Parked goals don't count. Each sport header in onboarding, Sports & goals (Settings) and Train shows a **Goals n/cap** pill: amber when full, red when over.
- **4th pick:** opens a modal, "Are you sure? Building up works better."
  - **Build up instead** (primary) puts the goal in `S.goalWish[sp]`. The wishlist appears as chips under the sport.
  - **Override** (secondary) adds the goal with `overridden: true` and sets `S.goalOverride[sp]`, which gives up that sport's **Earned It** badge. It also shows a warning bar, an "over cap" tag on the row and a toast.
- **Earning slots:** `checkGoalSlots()` runs after `updateBaselines()`. When every active goal in a sport has a baseline and 14 days have passed since the later of the newest goal's start or the last unlock, the sport gets +1 slot. A toast names the next goal, taken from the wishlist first and the catalog after that, and the wishlist chip is marked "next up". The `earned_<sport>` badge is "🔓 Earned It: <Sport>".
- **Defaults and migration:** the defaults are ≤3 per sport (run 5k/10k/21k, cycle FTP/5-min/100 km, swim 400/CSS/1.9k, strength trap-bar DL, bodyweight pull-ups/plank). The demo has ≤3 per sport, with a wishlist. Saves without `capChecked` keep every goal; goals beyond the 3rd in a sport get `overridden` and the sport is flagged as overridden.

## Home overview (v3.4)
Home order: greeting → **Log workout** CTA (still first and largest) → Overall hero → How I'm tracking → Baseline week → Today → Last session. The old streak/rating/Iron tiles are gone; streak and Iron already appear under Today, and the rating is now the hero.
- **Overall hero** (`overallHero`):
  - The ring shows `overall()` (40–99, tier-coloured), with the level, the avatar stage name and ▲/▼ changes vs the `S.log` ovr from 7 and 30 days ago.
  - The explanation line comes from `overallParts()`, which uses the same weights as `overall()`: Goals 5, Weight 2, W/kg 2, Consistency 1 → **Goals 50% · Weight 20% · W/kg 20% · Consistency 10%**. With no goals (Simple mode), FTP 2 replaces Goals.
  - Tapping opens `ovSheet()`: each part's score (`statRating`), bar and share.
- **How I'm tracking** (`tracking`): the Weight and FTP · W/kg rows come first, then one row per active goal grouped by sport. Each row shows best → target, a progress bar coloured by status, a tiny sparkline and a status.
  - **Status** (`paceStatus`): gain = progress now − progress 28 days ago, where `progressAt` replays sessions up to that date and the metrics use the `S.log` history. Needed = remaining progress ÷ (4-week blocks left in a 6-month horizon from the goal's start, at least one block).
    - **On track** (green): gain ≥ 80% of needed, or the goal is done.
    - **Behind** (amber): some gain, but not enough.
    - **Stalled** (red): no gain.
    - **No baseline · Nd** (red): no baseline set yet.
  - Rows open the goal detail page; the body rows open the athlete card.

## How-to explainers (v3.5) · `howto.js`
- **Info button** `infoBtn(id)` (an ⓘ) appears on Train goal rows, on log step 1 tiles and on step 2 result panels. The goal detail page has a "ⓘ How to" pill instead. The button stops event propagation, so it opens the sheet rather than the row.
- **Sheet:** `howto(id)` → `modal()` bottom sheet with a grab handle. Swipe down more than 90 px, tap the backdrop or tap ✕ to close. This works for every modal.
- **Animation:** `moveSVG(key)` draws a stick/cartoon figure (avatar palette, orange torso, skin limbs) using two-link IK poses (`htPose`). It loops with SMIL `<animate>` on polyline points and circle centres, entirely inline and offline.
  - 19 shared movements in `MOVES`: run, ride, swim, row, ski, squat, deadlift, bench, press, pullup, pushup, plank, wallsit, sledpush, sledpull, bbj, farmers, lunges, wallball. Each has its own props and scene.
  - The prosthetic follows `S.prosthetic`: the default left below-knee leg is the far leg, drawn as a pylon and socket.
  - `prefers-reduced-motion` renders a single static frame.
- **Content:** `COACH[family]` holds 4 cues, 3 mistakes and an adaptive note (shown when a prosthetic is set) for 33 families. `testProtocol(L)` builds protocols per goal: FTP 20 min × 0.95, power tests, CSS (T400 − T200) ÷ 2, run, swim, row and bike TTs, build-ups, 1RM and 5RM ramps (Epley estimate), max reps, holds, and Hyrox station standards with the division weight. Each sheet ends with a "not medical advice" line.

## Bar charts (v3.5)
- `barChart(series, {target, fmt, invert, unit})` replaces the per-goal line chart; the body-metric history keeps its line chart.
  - One bar per attempt, normalised by `barScale` so better is always taller (times inverted) with a 35% floor.
  - PB bars are gold with an SVG glow, and the target is a dashed green line.
  - Bars grow in with a staggered CSS animation (off under reduced motion).
  - Tapping a bar shows its date and value in `.bartip`.
- More than 12 points shows the last 12, plus Last 12 / Weekly / Monthly filters (`R.agg`); weekly and monthly show the best attempt per period.
- Home `sparkline()` and `metricSpark()` now render `miniBars` (gold for PBs; weight and FTP use weekly values).

## v3.6 Mobile QA + offline
**QA pass** (`pwtest/qa.js`): 360×740 and 390×844, fresh and `?demo`, covering every tab, the More sub-tabs, Sports & goals, goal detail, how-to sheet, the log flow (3 steps + reward) and share. It audits overflow, tap targets under 44 px, mm:ss inputs without a numeric inputmode, and console errors. Screenshots are in `screenshots/qa/`. There were no console errors.

Fixes:
1. **Time fields opened the full text keyboard.** All mm:ss inputs now use `TIN`: `inputmode="numeric" pattern="[0-9:]*"`, select on focus, and the `tmask()` auto-format (2840 → 28:40, 12840 → 1:28:40). `parseTime` reads 3–6 bare digits as [h]mmss; 1–2 digits still mean minutes. Number fields got `inputmode="decimal"`.
2. **Sport tiles overflowed at 360 px** (the Cycling/Strength column was clipped in onboarding and Sports & goals). The grid now uses `minmax(0,1fr)` columns.
3. **Tap targets under 44 px:** back/✕ header buttons, More tabs, chips, inputs, range and segment buttons (hit-area pseudo-elements), the wishlist ✕, photo ✕ and checkboxes. Flags went from 790 to 100 across the 4 runs.
Also: the multi-item kit-unlock toast is now summarised ("🎁 8 avatar kit items unlocked · Settings → Avatar") and capped at 340 px wide.

**Offline / PWA:**
- `sw.js` (`VERSION = 'fq-v3.6.0'`) precaches index, JS, CSS, fonts, manifest and icons with `cache: 'reload'`, serves cache-first, sends navigations (including `?demo`) to the cached shell, and deletes old `fq-*` caches on activate. **Bump VERSION on every release.**
- `manifest.webmanifest`: standalone, portrait, dark theme, with 192/512/maskable icons plus apple-touch-icon and favicon in `icons/`.
- Google Fonts are self-hosted: `fonts.css` plus latin woff2 files in `fonts/` (Barlow Condensed 600/800/900, Inter variable), with system font fallbacks.
- `pwtest/offline.js` goes online once, then `setOffline(true)` and reloads. It checks that the app renders with data and fonts, that the chart, how-to sheet and log/save work, and that `?demo` loads. Chromium reports no installability errors.
