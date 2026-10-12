# Fit Quest v3 – gamified fitness tracker

Plain HTML/CSS/JS single-page app. No build step, no backend, no chart library. Data stays in the browser:
localStorage (`fitquest-v2`) for everything except progress photos, which live in IndexedDB (`fitquest-photos`) on the device only.

## Day-to-day use
Open the app after a workout and tap **Log workout** on Home. There are four quick steps: pick the goal(s) you attempted or a general training session, adjust the prefilled numbers with −/+, tick today's habits, then collect your reward (XP, PBs, streak, unlocks) and share it if you like. Everything else lives in the secondary tabs.

## Profile
The prosthetic side defaults to a left below-knee leg (Settings › Profile: Left / Right / None). The demo photo silhouettes and any future avatar use it.

## Avatar
Your bobblehead avatar on the Card gets more athletic as your rating climbs (5 stages). It earns kit through badges and levels (headband, shades, sweatbands, tri suit, helmet, bike, medal, Goggins hoodie, and a carbon running blade at level 12). It celebrates PBs and level-ups and slumps when a streak breaks. Customise skin, hair, beard and prosthetic side in Settings › Avatar. It's pure SVG and CSS, so it works offline, and it appears on share cards too.

## Goals and baselines
Pick your sports and specific benchmark goals (5 km, FTP, 400 m swim, bench 5RM, marathon...) during onboarding or in Settings › Sports & goals. Each goal has a target (times as mm:ss). **Test** goals need a first attempt within 14 days. **Build-up** goals (long distances) count any session in that sport as the baseline; their chart tracks your longest distance until you finish the full distance. Goals with no baseline after 14 days are **parked**: kept, but dimmed and left out of the rating, and one tap re-activates them. Home shows the Baseline week countdown.

## Features
- **Onboarding**: intensity (Beginner / Athlete / Goggins) and tracking depth (High level / Detailed), both switchable in More › Settings. Moving up a mode earns 📈.
- **Athlete card**: overall rating 40–99, bronze/silver/gold/elite tiers, PWR/END/STR/BOD/CON + W/kg.
- **Today**: earn-your-habits (3 core habits, 5 on Goggins; 6 of 7 perfect days unlocks a slot; wishlist; two weak weeks pauses the newest habit; "unlock everything" override forfeits the Earned It badges) plus the numbers check-in in Detailed mode.
- **Train › Goals** (Detailed): about 70 benchmark goals across 6 sports, grouped by sport, with Parked goals listed separately. Per-goal PBs, history charts (time charts inverted so up = faster), and progress bars that roll into the rating. The FTP test updates FTP (95% of 20-min power). General training sessions log sport, duration and optional km.
- **Iron 75 tiers**: Beginner 30 days (miss pauses), Athlete 60 (missed day resets), Goggins 75 (any miss resets).
- **Photos**: front/side/back, a ghost overlay of last week's photo on the camera, a Week 1 vs now drag slider, time-lapse, tagged with weight and level.
- **Share**: 9:16 or square PNG, dark/light/transparent overlay sticker, native share sheet or download. No weight or photo unless switched on.
- **History**: overall/weight/FTP/W/kg charts with range filters and habit-week bars. JSON export.

## Files
- `index.html` – shell, top XP bar, bottom nav.
- `styles.css` – mobile-first dark game theme.
- `app.js` – numbered sections (10b = Home + post-workout flow): 1 config (personas, Iron tiers, XP, exercise library, habits, badges; **start here to tweak the game**), 2 state + v1 migration, 3 scoring, 4 game rules, 5 exercises, 6 habits, 7 photos, 8 SVG charts, 9 share cards, 9b avatar, 10 views, 11 actions, 12 boot + demo.
- Data: localStorage key `fitquest-v2` (format v3: `sports`, `goals[]` with `status`/`since`/`baselineDate`, `sessions[]`); older v1/v2 saves migrate automatically.
- `screenshots/` – mobile (390×844 @2x) screenshots of the key screens and sample share PNGs.

## Run locally
    cd fit-quest
    python3 -m http.server 8787
Open http://localhost:8787. Add `?demo` to load 8 weeks of sample data and demo photos. **This replaces your saved data.** The camera needs HTTPS or localhost.

## Scoring
- Progress per metric or goal = (current − baseline) / (target − baseline), capped 0–100%. It works when lower is better too (weight).
- Overall = 40 + 59 × weighted average of weight progress (×2), W/kg (×2), consistency (×1) and the average progress of active goals (×5). Parked goals don't count. Build-up goals: longest distance ÷ full distance gives up to 80%, the finish time vs target the rest.
- PB measures: fastest time, best watts, est. 1RM/5RM (Epley) for lifts, max reps, longest hold, furthest distance.
- XP: check-in 20, workout 30, weigh-in 10, all habits done 15, session 30, PB 75, Iron day 40, photo week 25, earned slot 100. Multiplied by Beginner ×1, Athlete ×1.25, Goggins ×1.6. Level L needs 50·L·(L+1) XP.
- Missed days: Beginner keeps the streak. Athlete loses the streak. Goggins loses the streak and 50 XP per day.

## Not built yet (needs a backend)
Social, rewards, coach voice, planned rest days, Strava/TrainingPeaks imports, AI coach. See DESIGN.md.

## Hyrox
Add Hyrox under Sports. Pick your division (Open/Pro/Adaptive · Men/Women/Doubles/Relay) to see the official station weights. After a race, go to **Log workout → Hyrox race** and enter all 8 runs, 8 stations and roxzone. You get the total, per-station PBs and a split chart against your last race. Your first race unlocks the Hyrox vest for your avatar. Test: `node /workspace/pwtest/hx.js` (screenshots `screenshots/hyrox-*.png`).

## Goal cap
You can have up to 3 active goals per sport. Picking a 4th asks whether you'd rather build up: **Build up instead** saves it to that sport's wishlist, while **Override** adds it anyway and gives up that sport's Earned It badge. Once every goal in a sport has a baseline and 2 weeks have passed, the sport unlocks another slot and suggests your next goal. Test: `node /workspace/pwtest/cap.js` (screenshots `goal-cap-*.png`).
