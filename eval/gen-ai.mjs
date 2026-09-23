// Generates AI-written passages from the human set, so both sides cover the same topics.
// One passage per human sample; model and style rotate. Writes eval/data/ai.jsonl.
// Styles: blog (plain request), rewrite (paraphrase the human passage), imitate (new passage
// in the same register, the hard case). Models: GPT, Gemini and Grok via OpenRouter, Claude Haiku.
// Usage: node eval/gen-ai.mjs   (needs OPENROUTER_API_KEY and the claude CLI; ~$0.10 per run)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const human = fs.readFileSync(path.join(DIR, 'human.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const OUT = path.join(DIR, 'ai.jsonl');
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).from) : []);

const KIND = { hn: 'a Hacker News comment', 'wiki-en': 'a Wikipedia article', 'wiki-no': 'en Wikipedia-artikkel', nrk: 'en NRK-nyhetsartikkel', diskusjon: 'et innlegg på diskusjon.no (norsk diskusjonsforum)' };
const STYLES = {
  blog: (s) => `Write a blog-post paragraph (about 120 words) on the topic of the passage below. ${lang(s)}\n\n${s.text}`,
  rewrite: (s) => `Rewrite the passage below in your own words, same length. ${lang(s)}\n\n${s.text}`,
  imitate: (s) => `Below is a passage from ${KIND[s.source]}. Write a new passage of similar length on the same topic that would fit naturally in ${KIND[s.source]}. Do not copy phrases. ${lang(s)}\n\n${s.text}`,
};
const lang = (s) => (s.lang === 'no' ? 'Write it in Norwegian bokmål.' : 'Write it in English.') + ' Reply with the passage only: no title, no preamble, no quotes.';

async function openaiCompat(base, key, model, prompt) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.8 }),
    });
    if (res.ok) return (await res.json()).choices[0].message.content;
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  throw new Error(`${model} failed`);
}

// Headless Claude Code; JOURNAL_SUMMARIZER keeps these runs out of Sleeper's journal capture.
function claudeHaiku(prompt) {
  return new Promise((resolve, reject) => {
    const c = spawn('claude', ['-p', '--model', 'claude-haiku-4-5', '--setting-sources', ''], {
      cwd: '/tmp', env: { ...process.env, JOURNAL_SUMMARIZER: '1' },
    });
    let out = '';
    const timer = setTimeout(() => c.kill(), 120_000);
    c.stdout.on('data', (d) => (out += d));
    c.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`claude exit ${code}`)); });
    c.stdin.end(prompt);
  });
}

const openrouter = (model) => (p) => openaiCompat('https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY, model, p);
const MODELS = {
  gpt: openrouter('openai/gpt-5.6-luna'),
  gemini: openrouter('google/gemini-3.8-flash'),
  grok: openrouter('x-ai/grok-4.7'),
  haiku: (p) => claudeHaiku(p),
};

const models = Object.keys(MODELS), styles = Object.keys(STYLES);
const todo = human.map((s, i) => i).filter((i) => !done.has(i));
async function one(i) {
  const s = human[i];
  const model = models[i % models.length], style = styles[Math.floor(i / models.length) % styles.length];
  try {
    const text = (await MODELS[model](STYLES[style](s))).trim().replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ');
    fs.appendFileSync(OUT, JSON.stringify({ label: 'ai', source: s.source, lang: s.lang, model, style, from: i, text }) + '\n');
    process.stdout.write('.');
  } catch (e) {
    console.error(`\n${i} ${model}: ${e.message}`);
  }
}
// Four at a time; haiku runs through the CLI and is the slow one.
for (let k = 0; k < todo.length; k += 4) await Promise.all(todo.slice(k, k + 4).map(one));
console.log('\ndone');
