const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { SpotifyClient } = require('./spotify');

const CONFIG_PATH = path.join(app.getPath('userData'), 'widget-config.json');
const SPOTIFY_PATH = path.join(app.getPath('userData'), 'spotify.json');

const DEFAULT_CONFIG = {
  position: null, // null = beim ersten Start unten rechts platzieren
  size: { width: 300, height: 150 },
  opacity: 62,
  accentColor: '#1db954',
  borderRadius: 20,
  locked: false, // true = klickdurchlässig
};

let config = { ...DEFAULT_CONFIG };
let spotifyConfig = { clientId: '', tokens: null };

let widgetWin = null;
let settingsWin = null;
let tray = null;
let moveMode = false;
let lastNowPlaying = { active: false, isPlaying: false };

// ---------- persistence ----------

function loadJson(filePath, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
  } catch (e) {
    return { ...fallback };
  }
}

function saveJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Konnte nicht speichern:', filePath, e);
  }
}

function saveConfig() { saveJson(CONFIG_PATH, config); }
function saveSpotifyConfig() { saveJson(SPOTIFY_PATH, spotifyConfig); }

const spotifyClient = new SpotifyClient(
  () => spotifyConfig.tokens,
  (tokens) => { spotifyConfig.tokens = tokens; saveSpotifyConfig(); },
  () => spotifyConfig.clientId
);

// ---------- widget window ----------

function defaultPosition(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - size.width - 40,
    y: workArea.y + workArea.height - size.height - 40,
  };
}

function createWidgetWindow() {
  const pos = config.position || defaultPosition(config.size);
  widgetWin = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: config.size.width,
    height: config.size.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    minWidth: 220,
    minHeight: 110,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widgetWin.setAlwaysOnTop(true, 'desktop');
  widgetWin.loadFile(path.join(__dirname, 'src', 'widget.html'));

  widgetWin.on('moved', () => {
    const [x, y] = widgetWin.getPosition();
    config.position = { x, y };
    saveConfig();
  });
  widgetWin.on('resized', () => {
    const [width, height] = widgetWin.getSize();
    config.size = { width, height };
    saveConfig();
  });
  widgetWin.on('closed', () => { widgetWin = null; });

  widgetWin.webContents.once('did-finish-load', () => applyClickThrough());
}

function applyClickThrough() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const shouldIgnore = !moveMode && config.locked;
  widgetWin.setIgnoreMouseEvents(shouldIgnore, { forward: true });
}

function pushConfig() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('config-updated', config);
}

function pushMoveMode() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('move-mode-changed', moveMode);
  applyClickThrough();
}

// ---------- settings window ----------

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 420,
    height: 560,
    resizable: false,
    title: 'Spotify Widget – Einstellungen',
    backgroundColor: '#101116',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- tray ----------

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Spotify Widget');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Einstellungen', click: () => createSettingsWindow() },
    { label: moveMode ? 'Verschieben beenden' : 'Widget verschieben/skalieren', click: toggleMoveMode },
    { label: config.locked ? 'Entsperren (klickbar)' : 'Sperren (klickdurchlässig)', click: () => { config.locked = !config.locked; saveConfig(); applyClickThrough(); rebuildTrayMenu(); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function toggleMoveMode() {
  moveMode = !moveMode;
  pushMoveMode();
  rebuildTrayMenu();
}

ipcMain.on('widget-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: 'Einstellungen', click: () => createSettingsWindow() },
    { label: moveMode ? 'Verschieben beenden' : 'Widget verschieben/skalieren', click: toggleMoveMode },
    { label: config.locked ? 'Entsperren (klickbar)' : 'Sperren (klickdurchlässig)', click: () => { config.locked = !config.locked; saveConfig(); applyClickThrough(); rebuildTrayMenu(); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
  menu.popup();
});

// ---------- spotify polling ----------

async function pollNowPlaying() {
  if (!spotifyConfig.tokens || !spotifyConfig.tokens.refreshToken) return;
  try {
    const data = await spotifyClient.getCurrentlyPlaying();
    lastNowPlaying = data;
    if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('now-playing', data);
  } catch (e) {
    // stiller Fehlschlag, z. B. kein aktives Gerät gerade
  }
}

// ---------- IPC ----------

ipcMain.handle('get-config', () => config);
ipcMain.handle('get-move-mode', () => moveMode);

ipcMain.handle('update-config', (evt, patch) => {
  config = { ...config, ...patch };
  saveConfig();
  pushConfig();
  applyClickThrough();
  if (patch.size && widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.setSize(Math.round(patch.size.width), Math.round(patch.size.height));
  }
  return config;
});

ipcMain.handle('get-now-playing', () => lastNowPlaying);

ipcMain.handle('spotify-set-client-id', (evt, clientId) => {
  spotifyConfig.clientId = (clientId || '').trim();
  saveSpotifyConfig();
  return true;
});

ipcMain.handle('spotify-status', () => ({
  clientId: spotifyConfig.clientId,
  connected: !!(spotifyConfig.tokens && spotifyConfig.tokens.refreshToken),
}));

ipcMain.handle('spotify-connect', async () => {
  try {
    await spotifyClient.connect();
    pollNowPlaying();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('spotify-disconnect', () => {
  spotifyConfig.tokens = null;
  saveSpotifyConfig();
  lastNowPlaying = { active: false, isPlaying: false };
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('now-playing', lastNowPlaying);
  return true;
});

ipcMain.handle('spotify-control', async (evt, action) => {
  try {
    if (action === 'next') await spotifyClient.next();
    else if (action === 'previous') await spotifyClient.previous();
    else if (action === 'playpause') await spotifyClient.playPause(!!lastNowPlaying.isPlaying);
    setTimeout(pollNowPlaying, 500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- lifecycle ----------

app.whenReady().then(() => {
  config = loadJson(CONFIG_PATH, DEFAULT_CONFIG);
  spotifyConfig = loadJson(SPOTIFY_PATH, { clientId: '', tokens: null });
  createTray();
  createWidgetWindow();
  pollNowPlaying();
  setInterval(pollNowPlaying, 3000);
  if (!spotifyConfig.clientId) createSettingsWindow();
});

app.on('window-all-closed', () => {
  // App bleibt im Tray aktiv, auch wenn Einstellungen geschlossen werden.
});

app.on('before-quit', () => {
  saveConfig();
  saveSpotifyConfig();
});
