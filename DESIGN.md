# Fit Quest: design notes (v2, agreed with Matt 11 Oct 2026)

## Build status (12 Oct 2026)
v2 core is **BUILT** (static app, localStorage + IndexedDB, no backend). Marked inline as ✅ built, 🟡 partly, ⏳ later.
v1 saves (`fitquest-v1`) migrate automatically to `fitquest-v2`; the v1 key is kept as a backup.

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
