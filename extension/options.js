async function init() {
  const settings = await getSettings();

  document.getElementById('backendUrl').value = settings.backendUrl || '';
  document.getElementById('key').value = settings.key || '';
  document.getElementById('blocklist').value = (settings.blocklist || []).join('\n');
}

document.getElementById('save').addEventListener('click', async () => {
  const backendUrl = document.getElementById('backendUrl').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('key').value.trim();
  const blocklist = document.getElementById('blocklist').value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  await saveSettings({
    backendUrl: backendUrl || DEFAULTS.backendUrl,
    key,
    blocklist
  });

  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Settings saved!';
  statusDiv.classList.add('success');
  setTimeout(() => {
    statusDiv.classList.remove('success');
  }, 3000);
});

init();
