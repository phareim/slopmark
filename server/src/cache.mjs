import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const todayUTC = () => new Date().toISOString().slice(0, 10);

export function openCache(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS results(
    key TEXT PRIMARY KEY, p_ai REAL, model TEXT, created_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS usage(
    day TEXT PRIMARY KEY, calls INTEGER
  )`);

  const qGet = db.prepare('SELECT p_ai, model FROM results WHERE key = ?');
  const qPut = db.prepare(
    'INSERT OR REPLACE INTO results(key, p_ai, model, created_at) VALUES(?, ?, ?, ?)'
  );
  const qCalls = db.prepare('SELECT calls FROM usage WHERE day = ?');
  const qBump = db.prepare(
    'INSERT INTO usage(day, calls) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1'
  );

  return {
    get(key) {
      const row = qGet.get(key);
      return row ? { p_ai: row.p_ai, model: row.model } : null;
    },
    put(key, p_ai, model) {
      qPut.run(key, p_ai, model ?? null, new Date().toISOString());
    },
    countToday() {
      const row = qCalls.get(todayUTC());
      return row ? row.calls : 0;
    },
    bumpToday() {
      qBump.run(todayUTC());
    },
    close() {
      db.close();
    },
  };
}
