const DEFAULT_BLOCKLIST = [
  'mail.google.com',
  'calendar.google.com',
  'docs.google.com',
  'drive.google.com',
  'outlook.office.com',
  'outlook.live.com',
  'teams.microsoft.com',
  '*.sharepoint.com',
  '*.atlassian.net',
  '*.slack.com',
  'app.slack.com',
  '*.zaptec.com',
  '*.miles.no',
  '*.bank.no',
  '*.dnb.no',
  '*.sparebank1.no',
  '*.nordea.no',
  'localhost',
  '*.phareim.no'
];

const DEFAULTS = {
  backendUrl: 'https://sleeper.phareim.no/slopmark',
  key: '',
  enabled: true,
  blocklist: DEFAULT_BLOCKLIST,
  threshold: null
};

async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULTS);
  return result;
}

async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

// Pattern matching: exact host or *.example.com matches example.com and subdomains
function hostMatches(host, pattern) {
  if (pattern.startsWith('*.')) {
    const domain = pattern.slice(2);
    return host === domain || host.endsWith('.' + domain);
  }
  return host === pattern;
}

function isHostAllowed(host, enabled, blocklist) {
  if (!enabled) return false;
  for (const pattern of blocklist) {
    if (hostMatches(host, pattern)) {
      return false;
    }
  }
  return true;
}
