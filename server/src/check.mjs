import { cacheKey } from './classify.mjs';

const round3 = (n) => Math.round(n * 1000) / 1000;

export async function checkPassages(
  passages,
  { cache, classify, threshold, dailyLimit, concurrency }
) {
  const results = new Array(passages.length);
  const missIdx = [];

  for (let i = 0; i < passages.length; i++) {
    const { id, text } = passages[i];
    const hit = cache.get(cacheKey(text));
    if (hit) {
      const p_ai = round3(hit.p_ai);
      results[i] = { id, p_ai, flag: p_ai >= threshold, cached: true };
    } else {
      missIdx.push(i);
    }
  }

  const n = Math.max(1, Math.floor(concurrency) || 1);
  let cursor = 0;
  // Slots reserved by this batch but not yet bumped in the DB.
  // Prevents concurrent workers overshooting dailyLimit.
  let inFlight = 0;
  let gate = Promise.resolve();
  const withGate = (fn) => {
    const p = gate.then(fn);
    gate = p.catch(() => {});
    return p;
  };

  async function worker() {
    while (true) {
      const k = cursor++;
      if (k >= missIdx.length) return;
      const i = missIdx[k];
      const { id, text } = passages[i];
      const allowed = await withGate(() => {
        if (cache.countToday() + inFlight >= dailyLimit) return false;
        inFlight++;
        return true;
      });
      if (!allowed) {
        results[i] = { id, error: 'daily_limit' };
        continue;
      }
      let r;
      try {
        r = await classify(text);
      } catch {
        await withGate(() => {
          inFlight--;
        });
        results[i] = { id, error: 'upstream' };
        continue;
      }
      const p_ai = round3(r.p_ai);
      await withGate(() => {
        cache.put(cacheKey(text), p_ai, r.model);
        cache.bumpToday();
        inFlight--;
      });
      results[i] = { id, p_ai, flag: p_ai >= threshold, cached: false };
    }
  }

  if (missIdx.length > 0) {
    await Promise.all(Array.from({ length: Math.min(n, missIdx.length) }, worker));
  }
  return results;
}
