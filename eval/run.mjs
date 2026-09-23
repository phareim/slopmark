// Scores eval/data/{human,ai}.jsonl with the same classify() the server runs and reports
// false alarms on human text and hit rate on AI text. Scores are cached in eval/data/scores.jsonl
// by cache key (variant + text), so reruns only pay for new passages.
//
// The set is split by a hash of the text: tune on "tune", report on "test", so a question
// isn't judged on the passages it was written against.
//
// Usage: node eval/run.mjs [--variants v1,v3] [--split all|tune|test] [--md]
//   One variant: full report (--md writes eval/RESULTS.md). Several: a comparison table.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, cacheKey, ACTIVE } from '../server/src/classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const variants = arg('variants', ACTIVE).split(',');
const split = arg('split', 'all');
const T = Number(process.env.SLOPMARK_THRESHOLD || 0.95);
const T_NO = Number(process.env.SLOPMARK_THRESHOLD_NO || T);
const thresholdFor = (s) => (s.lang === 'no' ? T_NO : T);

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
const REFUSAL = /^(I can['’]?t|I cannot|I won['’]t|I'm sorry|Sorry|Beklager|Jeg kan ikke)/i;
const half = (s) => (crypto.createHash('md5').update(s.text).digest()[0] % 2 ? 'test' : 'tune');
const samples = [
  ...read(path.join(DATA, 'human.jsonl')),
  ...read(path.join(DATA, 'ai.jsonl')).filter((s) => !REFUSAL.test(s.text)),
].filter((s) => split === 'all' || half(s) === split);

const SCORES = path.join(DATA, 'scores.jsonl');
const scores = new Map(read(SCORES).map((r) => [r.key, r.p_ai]));

async function scoreAll(variant) {
  const todo = samples.filter((s) => !scores.has(cacheKey(s.text, variant)));
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const s = todo[cursor++];
      const key = cacheKey(s.text, variant);
      try {
        const { p_ai } = await classify(s.text, { variant });
        scores.set(key, p_ai);
        fs.appendFileSync(SCORES, JSON.stringify({ key, variant, p_ai }) + '\n');
      } catch (e) {
        console.error('classify failed:', e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return samples.map((s) => ({ ...s, p: scores.get(cacheKey(s.text, variant)) })).filter((s) => typeof s.p === 'number');
}

// t = null means each passage's own language threshold.
const flagged = (xs, t) => xs.filter((s) => s.p >= (t ?? thresholdFor(s))).length;
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const rate = (xs, t) => `${pct(flagged(xs, t), xs.length)} (${flagged(xs, t)}/${xs.length})`;
const groupBy = (xs, k) => xs.reduce((m, s) => ((m[s[k]] ||= []).push(s), m), {});
function auc(ai, human) {
  let wins = 0;
  for (const a of ai) for (const h of human) wins += a.p > h.p ? 1 : a.p === h.p ? 0.5 : 0;
  return wins / (ai.length * human.length);
}

const lines = [];
const out = (l = '') => lines.push(l);
const results = {};
for (const v of variants) results[v] = await scoreAll(v);

if (variants.length > 1) {
  out(`Split: ${split}. Threshold ${T}. FA = human passages flagged (false alarms), hit = AI passages flagged.`);
  out();
  out('| variant | AUC en | AUC no | FA en | FA no | hit en | hit no | hit no @0.9 | FA no @0.9 |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (const v of variants) {
    const g = (label, lang) => results[v].filter((s) => s.label === label && s.lang === lang);
    out(`| ${v} | ${auc(g('ai', 'en'), g('human', 'en')).toFixed(3)} | ${auc(g('ai', 'no'), g('human', 'no')).toFixed(3)} | ${rate(g('human', 'en'), T)} | ${rate(g('human', 'no'), T)} | ${rate(g('ai', 'en'), T)} | ${rate(g('ai', 'no'), T)} | ${rate(g('ai', 'no'), 0.9)} | ${rate(g('human', 'no'), 0.9)} |`);
  }
} else {
  const scored = results[variants[0]];
  const human = scored.filter((s) => s.label === 'human');
  const ai = scored.filter((s) => s.label === 'ai');
  out(`Variant ${variants[0]}, split ${split}. Samples: ${human.length} human, ${ai.length} AI. AUC ${auc(ai, human).toFixed(3)}.`);
  out();
  out('| threshold | false alarms en | hits en | false alarms no | hits no |');
  out('|---|---|---|---|---|');
  const by = (xs, lang) => xs.filter((s) => s.lang === lang);
  for (const t of [0.5, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98]) {
    out(`| ${t} | ${rate(by(human, 'en'), t)} | ${rate(by(ai, 'en'), t)} | ${rate(by(human, 'no'), t)} | ${rate(by(ai, 'no'), t)} |`);
  }
  out();
  out(`At threshold ${T} (English) / ${T_NO} (Norwegian):`);
  out();
  out('| group | flagged |');
  out('|---|---|');
  for (const [k, xs] of Object.entries(groupBy(human, 'source'))) out(`| human · ${k} | ${rate(xs, null)} |`);
  for (const key of ['style', 'model', 'lang']) {
    for (const [k, xs] of Object.entries(groupBy(ai, key))) out(`| AI · ${key} ${k} | ${rate(xs, null)} |`);
  }
  const fa = human.filter((s) => s.p >= 0.8).sort((a, b) => b.p - a.p);
  if (fa.length) {
    out();
    out('Human passages scoring ≥ 0.8:');
    for (const s of fa) out(`- ${s.p.toFixed(3)} · ${s.source} · ${s.text.slice(0, 140)}…`);
  }
}

console.log(lines.join('\n'));
if (process.argv.includes('--md') && variants.length === 1) {
  const header = `# Eval results\n\nGenerated by \`node eval/run.mjs --md\` on ${new Date().toISOString().slice(0, 10)}. Data: see eval/README.md.\n\n`;
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), header + lines.join('\n') + '\n');
}
