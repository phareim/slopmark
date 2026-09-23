// Minimal client for TypeSafe Jev (typed decisions: choice/score). No dependencies.
const URL_ = process.env.TYPESAFE_URL || 'https://api.typesafe.ai/v1/systemone';

export async function systemOne({ state, questions, model = 'jev-latest', timeoutMs = 15_000 }) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('TYPESAFE_API_KEY missing');
  const res = await fetch(URL_, {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`typesafe ${res.status}: ${JSON.stringify(j.detail ?? j).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return j;
}
