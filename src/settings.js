const clientIdInput = document.getElementById('client-id-input');
const saveClientIdBtn = document.getElementById('save-client-id-btn');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusLine = document.getElementById('status-line');

const opacityInput = document.getElementById('opacity-input');
const opacityValue = document.getElementById('opacity-value');
const accentInput = document.getElementById('accent-input');
const radiusInput = document.getElementById('radius-input');
const radiusValue = document.getElementById('radius-value');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');

async function refreshStatus() {
  const status = await window.api.spotifyStatus();
  clientIdInput.value = status.clientId || '';
  if (status.connected) {
    statusLine.textContent = 'Status: verbunden ✓';
    disconnectBtn.hidden = false;
  } else if (status.clientId) {
    statusLine.textContent = 'Status: Client-ID gespeichert, noch nicht verbunden';
    disconnectBtn.hidden = true;
  } else {
    statusLine.textContent = 'Status: noch keine Client-ID hinterlegt';
    disconnectBtn.hidden = true;
  }
}

saveClientIdBtn.addEventListener('click', async () => {
  await window.api.spotifySetClientId(clientIdInput.value.trim());
  await refreshStatus();
});

connectBtn.addEventListener('click', async () => {
  await window.api.spotifySetClientId(clientIdInput.value.trim());
  statusLine.textContent = 'Status: Anmeldung im Browser öffnet sich …';
  const result = await window.api.spotifyConnect();
  if (result.ok) {
    statusLine.textContent = 'Status: verbunden ✓';
  } else {
    statusLine.textContent = 'Fehler: ' + result.error;
  }
  await refreshStatus();
});

disconnectBtn.addEventListener('click', async () => {
  await window.api.spotifyDisconnect();
  await refreshStatus();
});

function pushAppearance() {
  window.api.updateConfig({
    opacity: Number(opacityInput.value),
    accentColor: accentInput.value,
    borderRadius: Number(radiusInput.value),
    size: { width: Number(widthInput.value), height: Number(heightInput.value) },
  });
}

opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; pushAppearance(); });
accentInput.addEventListener('input', pushAppearance);
radiusInput.addEventListener('input', () => { radiusValue.textContent = radiusInput.value; pushAppearance(); });
widthInput.addEventListener('change', pushAppearance);
heightInput.addEventListener('change', pushAppearance);

async function init() {
  const cfg = await window.api.getConfig();
  opacityInput.value = cfg.opacity ?? 62;
  opacityValue.textContent = opacityInput.value;
  accentInput.value = cfg.accentColor || '#1db954';
  radiusInput.value = cfg.borderRadius ?? 20;
  radiusValue.textContent = radiusInput.value;
  widthInput.value = cfg.size.width;
  heightInput.value = cfg.size.height;
  await refreshStatus();
}

init();
