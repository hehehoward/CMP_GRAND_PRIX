# CMP 大獎賽 · Project Notes

This file explains what the game is, how it is built, and every rule that matters, in enough detail for someone new to rebuild or change it. Read this first.

---

## 1. What it is

A 20-minute team activity for a ~100-person TSMC CMP AI workshop. It is a Formula 1 game in which each car knob secretly stands for a CMP process parameter. Players run DOE-style tests on their phones, submit one final setup, and the host races everyone's setups on the big screen. The final reveal ("你調的其實不是賽車") maps every knob back to CMP.

**Teaching goals (the three debrief lessons):**
1. **練習賽 ≠ 量產.** The fastest setup on the practice track is often the most fragile on race day, when conditions change.
2. **用力越大，越難控制.** A full-power engine (pressure × speed) wins the straight but overshoots the hairpin (over-polish).
3. **時間就是 DOE 預算.** Every test costs real time. Stress tests cost more, but they are the only way to see what practice hides.

## 2. Two pages

| Page | File (live) | Who | Purpose |
|---|---|---|---|
| Garage | `index.html` | Players (phone or laptop) | Tune the car, run tests, submit the final setup |
| Race Control | `host.html` | Host (big screen) | Intro, live leaderboard, qualifying, weather, race, podium, results, debrief |

Live: https://hehehoward.github.io/CMP_GRAND_PRIX/ (players) and `/host.html` (host).

## 3. Folder layout

```
index.html, host.html   BUILT files. Never edit by hand; run the build.
src/garage.html         Player page source (HTML + CSS + JS in one file)
src/racecontrol.html    Host page source
src/sim.js              Race engine + track drawing (shared by both pages)
src/car3d.js            three.js 3D cars and podium
src/sfx.js              Sound effects (Web Audio, no sound files)
src/cloud.js            Supabase online sync
vendor/three.min.js     three.js r149
vendor/qrcode.js        qrcode-generator 1.4.4
supabase/01_tables.sql  Database tables + access rules
supabase/02_admin.sql   Host admin function (PIN protected)
tools/build.py          Combines src + vendor into the two built pages
docs/PROJECT_NOTES.md   This file
```

## 4. Build and publish

1. Edit files in `src/`.
2. Run `python tools/build.py`. It replaces three placeholders in each page:
   - `/*__SIM__*/` becomes sim.js + sfx.js + cloud.js
   - `/*__THREE__*/` becomes three.min.js + car3d.js
   - `/*__QR__*/` becomes qrcode.js

   It also sets `var NOID=true;` (name-only login, see §8).
3. Commit and push to `main`. GitHub Pages serves the repo root and updates within about a minute.

Each built page is fully standalone. It reads nothing from `src/` at run time, and the only outside connection is Supabase.

**Intranet version (optional):** the same source can be built with `NOID=false` (asks for name + employee ID) and a shared network folder instead of the cloud. The folder path in the public source is a placeholder (`\\server\share\Submission`). Never commit the real company path or colleague names to this public repo.

## 5. Game rules (the numbers that matter)

All in `src/sim.js` unless noted.

**Race:** 12 laps (`LAPS`). Lowest total time wins. DNFs rank behind all finishers, ordered by laps completed (`score()`).

**Knobs (`PARAMS`), defaults in `DEFAULT`:**

| Key | Knob | Range | Default |
|---|---|---|---|
| `rw` | 下壓力 (rear wing; front wing auto = rw−1) | 1–10 | 5 |
| `eng` | 引擎模式 | 1–5 | 3 |
| `susp` | 懸吊硬度 | 1–10 | 5 |
| `brk` | 煞車點 | 1–5 | 3 |
| `tire` | 輪胎 S / M / H | — | M |

- Fuel is auto-filled (`autoFuel`) and pit stops are automatic when tyre life drops below 5% (`PIT_AT`, costs `PIT_LOSS` = 12 s). Players never set these.
- Setup code format: `W5-E3-S5-B3-TM` (`code()` / `parseCode()`).

**Track:** "CMP 國際賽道", 1.90 km, 4 sectors:

| Sector | Name | CMP meaning |
|---|---|---|
| S1 | 長直道 | P1 bulk removal |
| S2 | 高速 S 彎 | P2 clearing |
| S3 | 髮夾彎 | Endpoint (lock-up = over-polish) |
| S4 | 顛簸減速彎 | Post-CMP clean (kerb = new defects) |

**Random events per lap** (only when `failures` is on):
- Wet spin: +4 s
- Hairpin lock-up: +2 s
- Kerb strike: +1 s
- Engine failure: DNF
- Tyre failure: DNF

The risks rise with high engine, late braking, stiff suspension, low downforce, heat and rain (see `lockRisk`, `kerbRisk`, `engFailRisk`).

**Player test conditions (`COND`):**

| Test | Weather | Laps | Garage time speed (`TSC`) |
|---|---|---|---|
| 練習賽 practice | dry 25°C | 1 | 5.3× |
| 高溫測試 hot | dry 36°C | 2 | 5.5× |
| 雨天測試 wet | rain 18°C | 2 | 7.4× |

**DOE batch test:** each player gets **1** batch (`BX_LIMIT` in garage.html). A batch runs several setups at once on practice and shows the main effect of each knob.

**Test result shown to players:** a single-lap time plus a **12-lap prediction** (the main number), from the dry, noise-free projection (`SIM.qualify`).

**Race-day weather (`RACE`), chosen secretly by the host:**

| ID | Name | Conditions |
|---|---|---|
| `same` | ☀️ 完美晴天 | Same as practice |
| `storm` | ⛈️ 午後雷陣雨 | 31°C, rain from lap 7 (default) |
| `heat` | 🔥 熱浪 | 38°C |
| `monsoon` | 🌧️ 梅雨季 | Rain all race, 17°C |

The host can also choose "random", picked by the seed.

**Qualifying → final grid (racecontrol.html):** every submitted final setup is re-run on practice conditions with no noise. The top **20** qualify, plus **10** lucky draws from the rest (`NFIN=30`, draw seeded by `'lucky'+seed`). The host can tick or untick cars by hand, up to 30.

**Race randomness** is fully repeatable. Each car uses the seed `hash(seed + '|race|' + playerId)`, and the default seed is `GP2026`. The same seed always gives the same race.

**Race playback:** about 62 s for 12 laps (`PLAY=62`). After the finish the leader stays hidden, and the page goes straight to the podium after ~3.4 s. The director camera follows only P1–P4.

## 6. Host flow (Race Control stages)

`開場 → 即時排行 → 排位 → 天氣 → 正賽 → 頒獎 → 成績 → 揭曉`. Use the ← → keys to move between stages.

1. **開場 (Intro), about 5 min, 9 slides.** Space steps through the animations, and ← → change slides.
   - Title
   - Goal: 12 laps, shortest total time wins
   - Track tour
   - Knobs: no knob is "the bigger the better"
   - Test time cost
   - Demo animation
   - Flow: qualifying → weather → race
   - Prizes: top 3
   - How to join: QR code in cloud mode
2. **即時排行 (Live).** Shows the live leaderboard, the countdown timer and the DOE map.
   - Timer: click to start or pause, double-click to reset. Choose 8, 10, 12 or 15 min (default 10).
   - The countdown reaches every phone. At 0, the Garage tells players to submit.
   - The DOE map cycles through knob pairs every 8 s.
3. **排位 (Qualifying).** Shows the 30-car grid (§5).
4. **天氣 (Weather).** Reveals the secret race weather.
5. **正賽 (Race).** Plays the 12 laps.
6. **頒獎 (Podium).** 3D podium for the top 3.
7. **成績 (Results).** Full results with grid → finish movement.
8. **揭曉 (Debrief).** Reveals the knob → CMP mapping one row at a time (Space), then the three lessons with live stats from this room.

**Host keys:**
- **H** shows or hides the host tools (weather select, seed, database).
- **Q** shows a big QR code to join.

**Knob → CMP mapping shown in the debrief:**

| Game | CMP |
|---|---|
| 引擎模式 | Down force × platen speed (Preston: RR ∝ P·V) |
| 下壓力 (wing) | Slurry inhibitor / selectivity |
| 懸吊硬度 | Pad hardness |
| 煞車點 | Over-polish time |
| 輪胎 + 磨耗 | Pad type and life |
| 自動進站 | Pad change / PM downtime |
| 引擎故障 | Scratch / defect excursion |
| 正賽天氣 | Incoming variation, new product, tool aging |
| 測試時間 | DOE budget: wafers, tool time, people |

## 7. Data and cloud (Supabase)

- **Project URL** and **publishable key** are in `src/cloud.js`. The publishable key is meant to be public. **Never** put the secret / service_role key in any page or in this repo.
- **Tables** (from `supabase/01_tables.sql`):
  - `cmpgp_players (event, id, name, payload jsonb, updated_at)`, primary key (event, id). One row per player, overwritten after every test.
  - `cmpgp_control (event, data, updated_at)`. The host countdown, one row per event.
  - Row-level security lets the public read, insert and update (with size limits) but **not delete**.
- **Admin** (`supabase/02_admin.sql`): the function `cmpgp_admin(pin, action, …)` with the actions `check`, `events`, `delete_player`, `delete_event` and `put`.
  - The PIN is stored hashed.
  - A wrong PIN waits 1 s before failing, which slows down guessing.
  - Host page: on the 即時排行 stage, press H for the host tools, then click ☁ 雲端資料庫. From there you can view, rename, clear the final setup, delete a player, delete a whole event, or download a backup.
- **Setup order:** run `01_tables.sql`, then `02_admin.sql` after changing the PIN on its last line.
- **Event codes:** add `?e=CODE` to both links to separate rehearsals from the real event (default `GP2026`). `?cloud=0` forces folder mode.
- **Sync timing:**
  - The Garage saves to the cloud after every test, with retries.
  - The host polls every 4 s, fetching only rows newer than the last poll. When the cloud is unreachable it backs off to ~30 s.
  - If the Garage can't reach the cloud within 4 s, it falls back to folder mode (File System Access API, Chrome or Edge only).
- **Player payload** (`payload()` in garage.html), version `v:3`:
  ```
  { v, player:{id,name}, runs:[{n,c,code,p,b,s,dnf,at}], final:{params,code,at},
    stats:{runs,practice,stress,testSeconds,aiUsed,batches,batchRuns,aiAdopted,bestPractice,testedFinal},
    updatedAt, check }
  ```
  `check = SIM.checksum(payload without check)`. The host flags edited files as 檔案遭修改. The admin tool re-signs any payload it edits.
- **Folder mode file names:** `CMPGP_<id>.json` per player, plus `CMPGP-CONTROL.json` for the countdown.
- **Browser storage:** the Garage keeps its state in `localStorage` key `cmpgp_garage_v5`, so a refresh keeps progress. The host keeps its own state in local storage too.

## 8. Decisions and why

| Decision | Why |
|---|---|
| Single-file built pages | Works offline, from a shared drive, or on GitHub Pages with nothing to install |
| Name-only login on the public build (`NOID=true`) | Not asking for employee IDs on a public site. A hidden random code `P` + 8 characters becomes the ID, and the host hides these codes on screen. |
| DOE batch limit = 1 | Keeps the time-budget lesson sharp |
| 30 finalists (top 20 + 10 lucky draws) | Room for underdogs. 30 cars is the most the screen shows clearly. |
| Race +30% speed (PLAY=62) | Keeps the race short and exciting |
| Skip the winner reveal, go straight to the podium | The podium is the reveal |
| Director camera on P1–P4 only | The battle at the front is what people care about |
| 2.5D tilt at 45° (CSS `perspective(1400px) rotateX(45deg)`) | 3D feel with 30 cars still readable |
| Downloads only in the Garage (`dlSave`) | Players keep their own file; the host page has no download |
| No AI-engineer button in the Garage | Removed from gameplay. `SIM.aiSuggest` and the `aiUsed` / `aiAdopted` fields are leftovers kept for file compatibility. |

## 9. Testing checklist before the event

1. Open host + 2–3 phones with `?e=TEST1`. Check that players appear on the host within ~5 s.
2. Start the timer on the host and confirm the phones show it.
3. Submit finals, then run Qualifying → Weather → Race → Podium → Debrief.
4. Delete event `TEST1` from the host database manager.
5. On the day, use the plain links (event `GP2026`) or a fresh code.

## 10. Rebuilding from scratch (outline)

1. Make a Supabase project and run the two SQL files.
2. Put the project URL and publishable key in `src/cloud.js`.
3. `python tools/build.py`, then publish `index.html` and `host.html` on any static host (GitHub Pages, Netlify, or an intranet web server).
4. Everything else (engine, track, art, sound) is plain JavaScript in `src/`, with no frameworks except three.js.
