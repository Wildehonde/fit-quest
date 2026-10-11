# Fit Quest – gamified fitness tracker

A plain HTML/CSS/JS single-page app. No build step, no backend. Data is saved in your browser's localStorage.

## Files
- `index.html` – page shell, top XP bar, bottom nav. Loads Chart.js from a CDN.
- `styles.css` – dark game theme, athlete card tiers (bronze/silver/gold/elite).
- `app.js` – all logic, in numbered sections:
  1. CONFIG – personas, default metrics, Iron 75 tasks, XP values, badges. **Start here to tweak the game.**
  2. STATE – load/save to localStorage.
  3. SCORING – progress %, stat ratings, overall rating, levels.
  4. GAME RULES – XP, missed-day penalties, badges, persona switching.
  5. VIEWS – each tab is a function that returns HTML.

## Run locally
    cd fit-quest
    python3 -m http.server 8787     # or: npx serve .
Then open http://localhost:8787. Add `?demo` to the URL to load 3 weeks of sample data. This replaces your saved data.

## Open in Cursor
File → Open Folder → pick `fit-quest`. Ask the agent things like "add a sleep stat to the card" or "sync weight from Apple Health".

## Scoring
- Each metric gives a progress score: (current − baseline) / (target − baseline), capped between 0 and 100%. It also works for weight, where a lower number is better.
- The overall rating is 40 + 59 × the weighted average of every metric, plus W/kg and consistency (streak ÷ 30), so it runs from 40 to 99.
- Card tiers: Bronze below 60, Silver 60 to 74, Gold 75 to 87, Elite 88 and up.
- XP is earned for a check-in (20), a workout (30), a weigh-in (10), a PB (75) and each Iron 75 day (40). It's multiplied by the persona: Beginner ×1, Athlete ×1.25, Goggins ×1.6. Reaching level L takes 50·L·(L+1) XP.
- Missed days: Beginner keeps the streak. Athlete loses the streak. Goggins loses the streak and 50 XP per missed day.
- Iron 75: Beginner pauses if you miss a day. Athlete resets if you skip a day. Goggins resets if you skip a day or try to bank a day with any task unticked.
