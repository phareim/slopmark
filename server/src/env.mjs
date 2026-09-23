import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// .env wins over inherited env (house rule: dotenv override: true).
try {
  Object.assign(process.env, parseEnv(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')));
} catch {
  // no .env file — env comes from the environment
}

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const key = process.env.SLOPMARK_KEY;
if (!key) {
  console.error('SLOPMARK_KEY missing: set it in server/.env or the environment');
  process.exit(1);
}

export const config = {
  port: num('SLOPMARK_PORT', 3029),
  key,
  threshold: { en: num('SLOPMARK_THRESHOLD', 0.95), no: num('SLOPMARK_THRESHOLD_NO', 0.8) },
  dailyLimit: num('SLOPMARK_DAILY_LIMIT', 5000),
  concurrency: num('SLOPMARK_CONCURRENCY', 6),
};
