// Collects human-written passages with a known pre-ChatGPT date (before Nov 2022)
// into eval/data/human.jsonl. Sources: HN comments, English and Norwegian Wikipedia
// revisions from 2021, and NRK articles and diskusjon.no forum posts via the Wayback Machine.
// Usage: node eval/collect-human.mjs               (all sources, rewrites the file)
//        node eval/collect-human.mjs diskusjon     (only these sources, appended)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(DIR, { recursive: true });
const UA = { 'User-Agent': 'slopmark-eval/0.1 (https://github.com/phareim/slopmark)' };
const MIN = 300, MAX = 1500;

const decode = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, '/')
  .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
const fits = (t) => t.length >= MIN && t.length <= MAX;
const getJson = async (url) => (await fetch(url, { headers: UA })).json();
const getText = async (url) => (await fetch(url, { headers: UA })).text();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hn(n) {
  const out = [];
  // Spread over 2019–2021, one window per request.
  for (let w = 0; out.length < n && w < 40; w++) {
    const start = 1546300800 + w * 2_300_000; // ~26 days apart
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=comment&hitsPerPage=50&numericFilters=created_at_i%3E${start},created_at_i%3C${start + 86400}`;
    const j = await getJson(url);
    const texts = (j.hits || []).map((h) => decode((h.comment_text || '').replace(/<p>/g, ' '))).filter(fits);
    out.push(...texts.slice(0, 3).map((text) => ({ source: 'hn', lang: 'en', text })));
  }
  return out.slice(0, n);
}

async function wiki(lang, n) {
  const out = [];
  while (out.length < n) {
    const r = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=20&format=json`);
    for (const { title } of r.query.random) {
      if (out.length >= n) break;
      const rv = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=revisions&titles=${encodeURIComponent(title)}&rvlimit=1&rvstart=2021-06-01T00:00:00Z&rvdir=older&rvprop=ids&format=json`);
      const page = Object.values(rv.query.pages)[0];
      const oldid = page.revisions?.[0]?.revid;
      if (!oldid) continue;
      const p = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=parse&oldid=${oldid}&prop=text&format=json&formatversion=2`);
      const html = p.parse?.text || '';
      const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1])).filter(fits);
      if (paras[0]) out.push({ source: `wiki-${lang}`, lang: lang === 'no' ? 'no' : 'en', text: paras[0] });
    }
  }
  return out;
}

async function nrk(n) {
  const cdx = await getJson('https://web.archive.org/cdx/search/cdx?url=nrk.no/*&from=2019&to=2021&filter=statuscode:200&filter=mimetype:text/html&filter=original:.*-1\\.\\d%2B$&collapse=urlkey&limit=400&output=json');
  const rows = cdx.slice(1).filter((r) => !/\/(sport|video|tv|radio)\//.test(r[2]));
  const out = [];
  for (let i = 0; out.length < n && i < rows.length; i += 3) {
    const [, ts, orig] = rows[i];
    try {
      const html = await getText(`https://web.archive.org/web/${ts}id_/${orig}`);
      const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1])).filter((t) => t.length > 60);
      // NRK paragraphs are short; join consecutive body paragraphs into one passage.
      let text = '';
      for (const p of paras.slice(1)) { text += (text ? ' ' : '') + p; if (text.length >= 450) break; }
      if (fits(text)) out.push({ source: 'nrk', lang: 'no', text, url: orig });
    } catch { /* skip dead snapshot */ }
    await sleep(300);
  }
  return out;
}

// Casual Norwegian: posts from diskusjon.no topics, quotes and signatures stripped.
async function diskusjon(n) {
  const cdx = await getJson('https://web.archive.org/cdx/search/cdx?url=diskusjon.no/topic/*&from=2019&to=2021&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=3000&output=json');
  const topics = [...new Set(cdx.slice(1).map((r) => r[2]).filter((u) => !/\/page\/|\?/.test(u)))];
  const rows = cdx.slice(1).filter((r) => topics.includes(r[2]));
  const out = [];
  for (let i = 0; out.length < n && i < rows.length; i += 7) {
    const [, ts, orig] = rows[i];
    try {
      const html = await getText(`https://web.archive.org/web/${ts}id_/${orig}`);
      const posts = html.split('data-role="commentContent"').slice(1).map((p) => {
        p = p.slice(p.indexOf('>') + 1);
        const end = p.search(/data-role="memberSignature"|class="ipsItemControls"|<\/article>/);
        return decode(p.slice(0, end > 0 ? end : 6000).replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ')).replace(/\s*Quote\s*$/, '');
      }).filter(fits);
      out.push(...posts.slice(0, 2).map((text) => ({ source: 'diskusjon', lang: 'no', text, url: orig })));
    } catch { /* skip dead snapshot */ }
    await sleep(300);
  }
  return out.slice(0, n);
}

const SOURCES = { hn: () => hn(40), 'wiki-en': () => wiki('en', 20), 'wiki-no': () => wiki('no', 20), nrk: () => nrk(25), diskusjon: () => diskusjon(40) };
const only = process.argv.slice(2);
const all = [];
for (const name of only.length ? only : Object.keys(SOURCES)) all.push(...(await SOURCES[name]()).map((s) => ({ label: 'human', ...s })));
const lines = all.map((s) => JSON.stringify(s)).join('\n') + '\n';
if (only.length) fs.appendFileSync(path.join(DIR, 'human.jsonl'), lines);
else fs.writeFileSync(path.join(DIR, 'human.jsonl'), lines);
const counts = all.reduce((m, s) => ((m[s.source] = (m[s.source] || 0) + 1), m), {});
console.log(all.length, counts);
