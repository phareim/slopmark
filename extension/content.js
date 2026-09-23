// Finds the larger text blocks on the page, sends those near the viewport to the backend
// (via background.js) and marks the ones flagged as obviously AI-written.
// Element states live in data-slopmark: queued | pending | ok | flag | error.

const MIN_CHARS = 280;
const MIN_DIRECT_DIV_CHARS = 200;
const MAX_CHARS = 4000;
const BATCH = 40;
const SELECTORS = 'p, li, blockquote, dd, figcaption, article div, main div, [role="article"] div, section div';
const EXCLUDED = 'nav, header, footer, aside, form, pre, code, textarea, [contenteditable], [aria-hidden="true"], script, style';

let nextId = 0;
const idToEl = new Map();
let queue = [];
let flushTimer;
let rescanTimer;

function directTextLength(el) {
  let n = 0;
  for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) n += node.textContent.trim().length;
  return n;
}

function qualifies(el) {
  if (el.hasAttribute('data-slopmark')) return false;
  // Cheap checks first; innerText forces layout.
  if (el.tagName === 'DIV' && directTextLength(el) < MIN_DIRECT_DIV_CHARS) return false;
  if ((el.textContent || '').length < MIN_CHARS) return false;
  if (el.closest(EXCLUDED)) return false;
  if (!el.getClientRects().length) return false;
  return el.innerText.trim().length >= MIN_CHARS;
}

// Innermost qualifying blocks only: a blockquote whose paragraphs qualify on their own is
// checked paragraph by paragraph, and nothing inside or around an already-handled block is added.
function findCandidates() {
  const found = Array.from(document.querySelectorAll(SELECTORS)).filter(qualifies);
  const set = new Set(found);
  return found.filter((el) => {
    for (const other of set) if (other !== el && el.contains(other)) return false;
    if (el.closest('[data-slopmark]')) return false;
    if (el.querySelector('[data-slopmark]')) return false;
    return true;
  });
}

function scan() {
  for (const el of findCandidates()) {
    el.setAttribute('data-slopmark', 'queued');
    visibility.observe(el);
  }
}

const visibility = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    visibility.unobserve(entry.target);
    queue.push(entry.target);
  }
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 400);
}, { rootMargin: '600px 0px' });

function flush() {
  const els = queue.splice(0, BATCH);
  if (queue.length) flushTimer = setTimeout(flush, 0);
  if (!els.length) return;
  const passages = els.map((el) => {
    const id = String(nextId++);
    idToEl.set(id, el);
    el.setAttribute('data-slopmark', 'pending');
    return { id, text: el.innerText.trim().slice(0, MAX_CHARS) };
  });
  chrome.runtime.sendMessage({ type: 'check', passages })
    .then((response) => {
      if (!response || response.error) return markAll(els, 'error');
      applyResults(response.results || []);
    })
    .catch(() => markAll(els, 'error'));
}

function markAll(els, state) {
  for (const el of els) el.setAttribute('data-slopmark', state);
}

function applyResults(results) {
  for (const result of results) {
    const el = idToEl.get(result.id);
    idToEl.delete(result.id);
    if (!el) continue;
    if (result.error) {
      el.setAttribute('data-slopmark', 'error');
    } else if (result.flag) {
      el.setAttribute('data-slopmark', 'flag');
      el.setAttribute('data-slopmark-p', String(result.p_ai));
      if (!el.title) el.title = `Likely AI-written (${Math.round(result.p_ai * 100)}%) — slopmark`;
    } else {
      el.setAttribute('data-slopmark', 'ok');
    }
  }
  const n = document.querySelectorAll('[data-slopmark="flag"]').length;
  chrome.runtime.sendMessage({ type: 'count', n }).catch(() => {});
}

async function init() {
  const allowed = await chrome.runtime.sendMessage({ type: 'allowed', host: location.hostname }).catch(() => false);
  if (!allowed || !document.body) return;
  scan();
  // Infinite scroll and SPAs: rescan when the page changes. Our own attribute changes are
  // attributes, not childList mutations, so they don't retrigger this.
  new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, 1000);
  }).observe(document.body, { childList: true, subtree: true });
}

init();
