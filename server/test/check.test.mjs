import test from 'node:test';
import assert from 'node:assert/strict';
import { openCache } from '../src/cache.mjs';
import { cacheKey } from '../src/classify.mjs';
import { checkPassages } from '../src/check.mjs';

const TEXT_A = 'a '.repeat(100) + 'human-written passage with idiosyncrasies';
const TEXT_B = 'b '.repeat(100) + 'polished generic phrasing with stock transitions';
const TEXT_C = 'c '.repeat(100) + 'another passage for the batch';

const base = {
  threshold: 0.95,
  dailyLimit: 5000,
  concurrency: 6,
};
const fake = (p_ai, model = 'test-model') => async () => ({ p_ai, model });

test('cache hit path returns cached:true without calling classify', async () => {
  const cache = openCache(':memory:');
  cache.put(cacheKey(TEXT_A), 0.12, 'm');
  let calls = 0;
  const res = await checkPassages([{ id: 'x1', text: TEXT_A }], {
    ...base,
    cache,
    classify: async () => {
      calls++;
      return { p_ai: 0.99, model: 'm' };
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(res, [{ id: 'x1', p_ai: 0.12, flag: false, cached: true }]);
  cache.close();
});

test('flag threshold: above flags, below does not; p_ai rounded to 3 decimals', async () => {
  const cache = openCache(':memory:');
  const res = await checkPassages(
    [
      { id: 'hi', text: TEXT_A },
      { id: 'lo', text: TEXT_B },
      { id: 'round', text: TEXT_C },
    ],
    {
      ...base,
      cache,
      classify: async (text) => {
        if (text === TEXT_A) return { p_ai: 0.97, model: 'm' };
        if (text === TEXT_B) return { p_ai: 0.5, model: 'm' };
        return { p_ai: 0.123456, model: 'm' };
      },
    }
  );
  assert.deepEqual(res, [
    { id: 'hi', p_ai: 0.97, flag: true, cached: false },
    { id: 'lo', p_ai: 0.5, flag: false, cached: false },
    { id: 'round', p_ai: 0.123, flag: false, cached: false },
  ]);
  cache.close();
});

test('daily limit: misses return daily_limit without calling classify', async () => {
  const cache = openCache(':memory:');
  cache.bumpToday();
  cache.bumpToday();
  let calls = 0;
  const res = await checkPassages([{ id: 'q', text: TEXT_A }], {
    ...base,
    dailyLimit: 2,
    cache,
    classify: async () => {
      calls++;
      return { p_ai: 0.9, model: 'm' };
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(res, [{ id: 'q', error: 'daily_limit' }]);
  cache.close();
});

test('upstream error is isolated to that item', async () => {
  const cache = openCache(':memory:');
  const res = await checkPassages(
    [
      { id: 'bad', text: TEXT_A },
      { id: 'good', text: TEXT_B },
    ],
    {
      ...base,
      cache,
      classify: fake(0.96),
    }
  );
  // both succeed with the shared fake; now one that throws for TEXT_A
  const res2 = await checkPassages(
    [
      { id: 'bad', text: TEXT_C },
      { id: 'good2', text: TEXT_B },
    ],
    {
      ...base,
      cache,
      classify: async (text) => {
        if (text === TEXT_C) throw Object.assign(new Error('boom'), { status: 500 });
        return { p_ai: 0.1, model: 'm' };
      },
    }
  );
  assert.equal(res[0].p_ai, 0.96);
  assert.deepEqual(res2[0], { id: 'bad', error: 'upstream' });
  assert.equal(res2[1].cached, true); // TEXT_B cached by first batch
  cache.close();
});

test('concurrency never exceeds the limit', async () => {
  const cache = openCache(':memory:');
  const limit = 3;
  let live = 0;
  let maxLive = 0;
  const classify = async () => {
    live++;
    maxLive = Math.max(maxLive, live);
    await new Promise((r) => setTimeout(r, 20));
    live--;
    return { p_ai: 0.1, model: 'm' };
  };
  const passages = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i}`,
    text: `passage number ${i} ` + 'x '.repeat(100),
  }));
  const res = await checkPassages(passages, { ...base, concurrency: limit, cache, classify });
  assert.equal(res.length, 9);
  assert.ok(res.every((r) => r.p_ai === 0.1 && r.cached === false));
  assert.ok(maxLive <= limit, `maxLive=${maxLive} exceeds ${limit}`);
  assert.ok(maxLive > 1, `expected parallelism, maxLive=${maxLive}`);
  cache.close();
});

test('per-language threshold: Norwegian passages use threshold.no', async () => {
  const cache = openCache(':memory:');
  const no = 'Dette er et avsnitt på norsk som ikke er skrevet av et menneske, men det er vel ikke så farlig.';
  const en = 'This is a paragraph in English that was not written by a person, and that is fine for the test.';
  const res = await checkPassages(
    [{ id: 'no', text: no }, { id: 'en', text: en }],
    { ...base, cache, threshold: { en: 0.95, no: 0.8 }, classify: async () => ({ p_ai: 0.85, model: 'fake' }) }
  );
  assert.equal(res[0].flag, true);
  assert.equal(res[1].flag, false);
});
