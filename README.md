# Fit Quest v2 – gamified fitness tracker

Plain HTML/CSS/JS single-page app. No build step, no backend, no chart library. Data stays in the browser:
localStorage (`fitquest-v2`) for everything except progress photos, which live in IndexedDB (`fitquest-photos`) on the device only.

## Features
- **Onboarding**: intensity (Beginner / Athlete / Goggins) and tracking depth (High level / Detailed), both switchable in More › Settings. Moving up a mode earns 📈.
- **Athlete card**: overall rating 40–99, bronze/silver/gold/elite tiers, PWR/END/STR/BOD/CON + W/kg.
- **Today**: earn-your-habits (3 core habits, 5 on Goggins; 6 of 7 perfect days unlocks a slot; wishlist; two weak weeks pauses the newest habit; "unlock everything" override forfeits the Earned It badges) plus the numbers check-in in Detailed mode.
- **Train** (Detailed): 22-exercise library by type, 10 suggested with editable targets. Log sets × reps × kg, reps, holds, minutes × watts, or km × minutes. Instant comparison to the last session, PB bonus XP and a full-screen PB! moment, per-exercise history chart, progress bars that roll into the rating. The FTP test updates FTP (95% of 20-min power).
- **Iron 75 tiers**: Beginner 30 days (miss pauses), Athlete 60 (missed day resets), Goggins 75 (any miss resets).
- **Photos**: front/side/back, a ghost overlay of last week's photo on the camera, a Week 1 vs now drag slider, time-lapse, tagged with weight and level.
- **Share**: 9:16 or square PNG, dark/light/transparent overlay sticker, native share sheet or download. No weight or photo unless switched on.
- **History**: overall/weight/FTP/W/kg charts with range filters and habit-week bars. JSON export.

## Files
- `index.html` – shell, top XP bar, bottom nav.
- `styles.css` – mobile-first dark game theme.
- `app.js` – numbered sections: 1 config (personas, Iron tiers, XP, exercise library, habits, badges; **start here to tweak the game**), 2 state + v1 migration, 3 scoring, 4 game rules, 5 exercises, 6 habits, 7 photos, 8 SVG charts, 9 share cards, 10 views, 11 actions, 12 boot + demo.
- `screenshots/` – mobile (390×844 @2x) screenshots of the key screens and sample share PNGs.

## Run locally
    cd fit-quest
    python3 -m http.server 8787
Open http://localhost:8787. Add `?demo` to load 8 weeks of sample data and demo photos. **This replaces your saved data.** The camera needs HTTPS or localhost.

## Scoring
- Progress per metric or exercise = (current − baseline) / (target − baseline), capped 0–100%. It works when lower is better too (weight).
- Overall = 40 + 59 × the weighted average of the metrics, W/kg (×2), consistency (streak ÷ 30) and, in Detailed mode, the average exercise progress (×3).
- Exercise PB measures: est. 1RM (Epley) for weights, best set for reps, longest hold, best average watts, longest distance.
- XP: check-in 20, workout 30, weigh-in 10, all habits done 15, session 30, PB 75, Iron day 40, photo week 25, earned slot 100. Multiplied by Beginner ×1, Athlete ×1.25, Goggins ×1.6. Level L needs 50·L·(L+1) XP.
- Missed days: Beginner keeps the streak. Athlete loses the streak. Goggins loses the streak and 50 XP per day.

## Not built yet (needs a backend)
Social, rewards, coach voice, planned rest days, Strava/TrainingPeaks imports, AI coach. See DESIGN.md.
