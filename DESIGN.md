# Fit Quest: design notes (v2, agreed with Matt 11 Oct 2026)

## Build status (12 Oct 2026)
v2 core is **BUILT** (static app, localStorage + IndexedDB, no backend). Marked inline as ✅ built, 🟡 partly, ⏳ later.
v1 saves (`fitquest-v1`) migrate automatically to `fitquest-v2`; the v1 key is kept as a backup.

## Daily flow: built around "I just finished a workout" ✅ built (12 Oct 2026, from Matt's v2 feedback)
- The app opens on **Home**: one big **Log workout** button, the streak, the rating, Iron days, and a Today status (workout / habits / Iron day). There's a dismissible first-run hint.
- Log flow: 1) **Pick**: Ride/Run/Swim/Strength/Bodyweight quick buttons, then Recent, Suggested today (oldest-done first, one per type, skipping types trained in the last day), and all my exercises. Multi-select.
  2) **Numbers**: prefilled from last time (or sensible seeds), big −/+ steppers per field, add/remove sets. Rides log duration + distance + avg watts (watts optional); runs and swims log distance + time.
  3) **Habits**: today's habits on the same flow, with "Trained today" auto-ticked, plus an optional weigh-in stepper (Detailed mode).
  4) **Reward**: XP gained (level-up callout), the streak, PBs with a comparison to last session, new badges or habit slots, then **Share** (opens the share card) or **Done**.
- Card, Train, Iron 75, Photos and More are secondary tabs. Today (the full habit screen with wishlist and override) is reached from Home › Habits.

## Onboarding ✅ built
1. Intensity: Beginner / Athlete / Goggins (can drop down or move up anytime; badge for moving up).
2. Tracking depth: High level (daily yes/no habits) or Detailed (workout metrics). Can switch later.

## Detailed mode: exercise tracker ✅ built (22-exercise library, 10 suggested, SVG history charts with PB markers, volume bars, target line, 4W/3M/All)
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
