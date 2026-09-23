import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { openCache } from './cache.mjs';
import { checkPassages } from './check.mjs';
import { classify } from './classify.mjs';
import { ROOT, config } from './env.mjs';

const BODY_LIMIT = 512 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const cache = openCache(path.join(ROOT, 'data', 'cache.sqlite'));

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function authed(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(config.key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        tooBig = true;
        reject(Object.assign(new Error('too big'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!tooBig) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64;
const validText = (t) => typeof t === 'string' && t.length >= 50 && t.length <= 20000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      threshold: config.threshold,
      today: cache.countToday(),
      limit: config.dailyLimit,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/check') {
    const t0 = Date.now();
    if (!authed(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      json(res, e.status || 400, { error: e.status === 413 ? 'body_too_large' : 'bad_body' });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw || '');
    } catch {
      json(res, 400, { error: 'bad_json' });
      return;
    }
    const list = body?.passages;
    if (!Array.isArray(list) || list.length < 1 || list.length > 40) {
      json(res, 400, { error: 'passages must be an array of 1-40 items' });
      return;
    }

    const valid = [];
    const pre = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      if (!validId(p.id) || !validText(p.text)) {
        pre[i] = { id: typeof p.id === 'string' ? p.id.slice(0, 64) : null, error: 'invalid' };
      } else {
        valid.push({ out: i, id: p.id, text: p.text });
      }
    }

    const out = [...pre];
    if (valid.length > 0) {
      const got = await checkPassages(valid, {
        cache,
        classify,
        threshold: config.threshold,
        dailyLimit: config.dailyLimit,
        concurrency: config.concurrency,
      });
      for (let k = 0; k < valid.length; k++) out[valid[k].out] = got[k];
    }

    const ok = out.filter((r) => r && !r.error);
    const ms = Date.now() - t0;
    console.log(
      `/check n=${list.length} hits=${ok.filter((r) => r.cached).length} ` +
        `fresh=${ok.filter((r) => !r.cached).length} ` +
        `flagged=${ok.filter((r) => r.flag).length} errors=${list.length - ok.length} ms=${ms}`
    );
    json(res, 200, { threshold: config.threshold, results: out });
    return;
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`slopmark listening on 127.0.0.1:${config.port}`);
});
