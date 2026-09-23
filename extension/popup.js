
async function init() {
  const settings = await getSettings();
  const contentDiv = document.getElementById('content');

  if (!settings.key) {
    contentDiv.innerHTML = `
      <div class="warning">Set your key in <a href="#" id="settingsLink">Settings</a></div>
    `;
    document.getElementById('settingsLink').addEventListener('click', openSettings);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(tab.url).hostname;

  const flaggedCount = await chrome.action.getBadgeText({ tabId: tab.id });
  const count = parseInt(flaggedCount) || 0;

  const isHostBlocked = settings.blocklist.some(pattern =>
    hostMatches(host, pattern)
  );

  contentDiv.innerHTML = `
    <div class="section">
      <div>${count} passages marked on this page</div>
    </div>
    <div class="section">
      <div class="checkbox-group">
        <input type="checkbox" id="siteToggle" ${!isHostBlocked ? 'checked' : ''}>
        <label for="siteToggle">Check <code>${host}</code></label>
      </div>
    </div>
    <div class="section">
      <div class="checkbox-group">
        <input type="checkbox" id="enableToggle" ${settings.enabled ? 'checked' : ''}>
        <label for="enableToggle">slopmark enabled</label>
      </div>
    </div>
    <div class="section">
      <a href="#" id="settingsLink">Settings</a>
    </div>
  `;

  document.getElementById('siteToggle').addEventListener('change', async (e) => {
    const newBlocklist = [...settings.blocklist];
    if (!e.target.checked) {
      if (!newBlocklist.includes(host)) {
        newBlocklist.push(host);
      }
    } else {
      const idx = newBlocklist.indexOf(host);
      if (idx >= 0) {
        newBlocklist.splice(idx, 1);
      }
    }
    await saveSettings({ blocklist: newBlocklist });
  });

  document.getElementById('enableToggle').addEventListener('change', async (e) => {
    await saveSettings({ enabled: e.target.checked });
  });

  document.getElementById('settingsLink').addEventListener('click', openSettings);
}

function openSettings(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

init();
