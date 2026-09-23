importScripts('settings.js');

// In-memory cache for the worker's lifetime: SHA-256 of text -> { p_ai, flag, cached }. Errors are not cached.
const textCache = new Map();

// Track flagged counts per tab
const tabCounts = new Map();

async function hashText(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function checkPassages(passages, backendUrl, key) {
  const chunks = [];
  for (let i = 0; i < passages.length; i += 40) {
    chunks.push(passages.slice(i, i + 40));
  }

  const allResults = [];

  for (const chunk of chunks) {
    try {
      const response = await fetch(`${backendUrl}/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ passages: chunk })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      allResults.push(...(data.results || []));
    } catch (err) {
      console.error('Error checking passages:', err);
      for (const p of chunk) {
        allResults.push({ id: p.id, error: err.message });
      }
    }
  }

  return allResults;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'check') {
    handleCheckMessage(request, sender, sendResponse);
  } else if (request.type === 'allowed') {
    handleAllowedMessage(request, sender, sendResponse);
  } else if (request.type === 'count') {
    handleCountMessage(request, sender);
  }
  return true;
});

async function handleCheckMessage(request, sender, sendResponse) {
  const settings = await getSettings();

  if (!settings.key || !settings.enabled) {
    sendResponse({ error: 'not_configured' });
    return;
  }

  const passages = request.passages || [];
  const hashes = await Promise.all(passages.map((p) => hashText(p.text)));
  // Cached results are stored without an id; each reply carries the id the page asked with.
  const results = passages.map((p, i) => (textCache.has(hashes[i]) ? { ...textCache.get(hashes[i]), id: p.id } : null));
  const missing = passages.map((p, i) => i).filter((i) => results[i] === null);

  if (missing.length > 0) {
    const checked = await checkPassages(missing.map((i) => passages[i]), settings.backendUrl, settings.key);
    const byId = new Map(checked.map((r) => [r.id, r]));
    for (const i of missing) {
      const result = byId.get(passages[i].id) || { id: passages[i].id, error: 'missing' };
      if (!result.error) {
        const { id, ...rest } = result;
        textCache.set(hashes[i], rest);
      }
      results[i] = result;
    }
  }

  sendResponse({ results });
}

async function handleAllowedMessage(request, sender, sendResponse) {
  const settings = await getSettings();
  const allowed = isHostAllowed(request.host, settings.enabled, settings.blocklist);
  sendResponse(allowed);
}

function handleCountMessage(request, sender) {
  const tabId = sender.tab.id;
  tabCounts.set(tabId, request.n);
  updateBadge(tabId, request.n);
}

function updateBadge(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#b58900', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCounts.delete(tabId);
});
