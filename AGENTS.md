# slopmark

Chrome extension + tiny backend that marks obviously AI-written paragraphs. Overview, API and privacy model: `README.md`. Threshold evidence: `eval/README.md`, `eval/RESULTS.md`.

- Live: PM2 `slopmark` on Sleeper, port 3029, nginx `sleeper.phareim.no/slopmark/` (block in `/etc/nginx/sites-enabled/sleeper`). Secrets in `server/.env` (mode 600): `SLOPMARK_KEY`, `TYPESAFE_API_KEY`.
- `server/src/classify.mjs` is shared by the server and `eval/run.mjs`. Questions are variants (`v1` live); the variant id is in the cache key, so add a new variant instead of editing one. Tune on `--split tune`, confirm on `--split test`.
- Thresholds are per language: English 0.95, Norwegian 0.8 (`SLOPMARK_THRESHOLD`, `SLOPMARK_THRESHOLD_NO`). Jev is more cautious on Norwegian; see `eval/RESULTS.md`.
- Server: zero npm deps, `cd server && npm test`. Extension: plain JS, no build; check with `node --check extension/*.js`.
- Public repo: never commit `server/.env`, `server/data/` or `eval/data/` (scraped text).
