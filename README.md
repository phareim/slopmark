# slopmark

A Chrome extension that puts a thin amber bar next to paragraphs that are *obviously* AI-written. It leaves everything else alone.

Each paragraph gets one call to [TypeSafe](https://typesafe.ai)'s Jev model, a fast and cheap classifier for typed decisions. The call asks whether the passage was written by a human or an AI and returns a probability. A paragraph is marked when that probability is at least 0.95 for English or 0.8 for Norwegian. Jev scores Norwegian AI text lower than English AI text, and no human-written Norwegian passage in the eval scored above 0.64.

On the eval set (2026-09-23), those thresholds flagged none of 145 human passages written before ChatGPT and caught 32% of 135 AI passages in both English and Norwegian. It caught 67% of plain blog-style AI text and 9–16% of paraphrases and imitations: typical AI prose gets marked, careful AI prose gets through. Details in [eval/RESULTS.md](eval/RESULTS.md).

```
extension/   Manifest V3, plain JS, no build step — finds text blocks, marks flagged ones
server/      Node 22, zero deps — POST /check, Jev calls, SQLite cache, daily cap
eval/        human vs AI test set and the script that picks the threshold
```

## How it works

1. `extension/content.js` finds blocks of at least 280 characters: `p`, `li`, `blockquote`, and text-bearing `div`s inside `article`, `main` and `section`. It keeps the innermost qualifying block and skips navigation, forms, code and editable areas. Only blocks within 600 px of the viewport are sent, in batches of up to 40, and pages that change after loading are scanned again.
2. `extension/background.js` posts each batch to the backend with the user's key.
3. `server/` hashes each passage (SHA-256 over normalized text plus the question variant). It answers repeated passages from a SQLite cache and calls Jev for the rest, six at a time. Every result comes back as `{ id, p_ai, flag }`, where `flag` uses the Norwegian threshold if a function-word count says the passage is Norwegian.
4. Flagged blocks get `data-slopmark="flag"`: a 3 px amber bar in the left margin, drawn as a `::before` so the text doesn't move, and a hover tooltip showing the percentage. The toolbar badge counts the flagged blocks on the page.

## Privacy

Paragraph text from every site that isn't on the blocklist goes to the backend and on to TypeSafe. The default blocklist covers mail, calendars, office suites, Slack, Atlassian, Zaptec, Miles and Norwegian banks. You can change it in the extension's settings, and the popup has a per-site toggle. The server stores only hashes and scores, never the text itself.

## Running it

**Backend** (on Sleeper: PM2 app `slopmark`, port 3029, `https://sleeper.phareim.no/slopmark/`):

```sh
cd server && cp .env.example .env   # SLOPMARK_KEY, TYPESAFE_API_KEY; chmod 600
npm test
pm2 start ecosystem.config.cjs && pm2 save
```

- `GET /health` needs no key.
- `POST /check` takes `Authorization: Bearer $SLOPMARK_KEY` and a body of `{ passages: [{ id, text }] }` (1–40 passages, each 50–20 000 characters).
- `SLOPMARK_DAILY_LIMIT` (default 5000) caps fresh Jev calls per UTC day. Passages beyond the cap come back with `error: "daily_limit"`.

**Extension:** open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select `extension/`. Then open Settings and paste the key. See [extension/README.md](extension/README.md).

**Thresholds:** set them with `SLOPMARK_THRESHOLD` (English, default 0.95) and `SLOPMARK_THRESHOLD_NO` (Norwegian, default 0.8) in `server/.env`. A new question is a new variant in `server/src/classify.mjs` (`SLOPMARK_VARIANT`). Compare variants with `node eval/run.mjs --variants v1,vN --split tune`, and confirm the winner on `--split test` before switching.

## When to retire it

slopmark becomes redundant if Chrome or a reliable third-party extension starts marking AI-written text on its own, or if Jev stops being cheap or accurate enough for this (check with `eval/`). To retire it: `pm2 delete slopmark && pm2 save`, remove the `/slopmark/` locations from `/etc/nginx/sites-enabled/sleeper`, and mark it retired in `~/github/sleeper/docs/agent-environment-reference.md`.
