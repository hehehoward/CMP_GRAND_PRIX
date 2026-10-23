# CMP 大獎賽 (CMP Grand Prix)

A 20-minute DOE game for the CMP AI workshop. Players tune a car on their phone; the host runs the race on the big screen.

- Players: https://hehehoward.github.io/CMP_GRAND_PRIX/
- Host: https://hehehoward.github.io/CMP_GRAND_PRIX/host.html
- Rehearsal: add `?e=TEST1` to both links to keep data separate.

Full details (rules, data format, decisions): [docs/PROJECT_NOTES.md](docs/PROJECT_NOTES.md)

## Folders
- `src/` source (garage = player page, racecontrol = host page, sim = race engine, cloud = Supabase sync)
- `vendor/` three.js r149, qrcode-generator 1.4.4
- `supabase/` run `01_tables.sql`, then `02_admin.sql` (change the PIN on its last line first) in Supabase SQL Editor
- `tools/build.py` rebuilds `index.html` and `host.html` from `src/`

## Update
1. Edit files in `src/`
2. `python tools/build.py`
3. Commit and push. GitHub Pages updates in about a minute.

Only the Supabase publishable key lives in the pages. Never commit the secret / service_role key.
