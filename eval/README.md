# Eval

Measures how often slopmark flags human text (false alarms) and how much AI text it catches, so the threshold in `server/.env` is a measured choice.

## Data

`eval/data/` is gitignored: the human side is scraped text, and the AI side is regenerated per run.

- **Human** (`collect-human.mjs` → `human.jsonl`): passages with a known date before ChatGPT (Nov 2022). Hacker News comments from 2019–2021, English and Norwegian Wikipedia as of June 2021, plus NRK articles and diskusjon.no forum posts (casual Norwegian, quotes stripped) from 2019–2021 via the Wayback Machine. NRK paragraphs are short, so 2–4 consecutive ones are joined into one passage.
- **AI** (`gen-ai.mjs` → `ai.jsonl`): one passage per human passage, on the same topic and in the same language. The script rotates through four models (GPT-5.6 Luna, Gemini 3.8 Flash and Grok 4.7 via OpenRouter, plus Claude Haiku 4.5) and three styles:
  - `blog`: "write a blog paragraph about this topic". This is the everyday case.
  - `rewrite`: a paraphrase of the human passage.
  - `imitate`: a new passage written to fit the source (an HN comment, Wikipedia, NRK). This is the hard case.

  Refusals ("I can't…") are dropped before scoring.

## Run

```sh
source ~/.config/sleeper/secrets.zsh     # TYPESAFE_API_KEY, OPENROUTER_API_KEY
node eval/collect-human.mjs
node eval/gen-ai.mjs                     # resumable; ~$0.10 on OpenRouter
node eval/run.mjs --md                   # scores via server/src/classify.mjs, writes RESULTS.md
```

`run.mjs` caches scores in `data/scores.jsonl` by the same key the server uses, so a rerun only pays for new passages.

## Tuning

The set is split in two by a hash of each passage. Try question variants against the `tune` half, and look at `test` only to confirm the winner:

```sh
node eval/run.mjs --variants v1,v2,v3 --split tune     # comparison table
node eval/run.mjs --split test                          # threshold sweep per language
SLOPMARK_THRESHOLD_NO=0.8 node eval/run.mjs --md        # full report with live thresholds
```

Norwegian (2026-09-23): writing Norwegian tells into the question made results worse (v2, v3). Jev already separates Norwegian human from AI text well (AUC 0.89 on tune), but it scores Norwegian AI text lower. Lowering the Norwegian threshold to 0.8, chosen on `tune` and confirmed on `test` with 0 false alarms in either half, raised Norwegian hits from 14% to 32%.
