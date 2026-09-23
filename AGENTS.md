# slopmark

Chrome extension + tiny backend that marks obviously AI-written paragraphs. Overview, API and privacy model: `README.md`. Threshold evidence: `eval/README.md`, `eval/RESULTS.md`.

- Live: PM2 `slopmark` on Sleeper, port 3029, nginx `sleeper.phareim.no/slopmark/` (block in `/etc/nginx/sites-enabled/sleeper`). Secrets in `server/.env` (mode 600): `SLOPMARK_KEY`, `TYPESAFE_API_KEY`.
- `server/src/classify.mjs` is shared by the server and `eval/run.mjs`. Changing `QUESTIONS` means bumping `QUESTION_VERSION` (it is in the cache key) and rerunning the eval before touching the threshold.
- Server: zero npm deps, `cd server && npm test`. Extension: plain JS, no build; check with `node --check extension/*.js`.
- Public repo: never commit `server/.env`, `server/data/` or `eval/data/` (scraped text).
