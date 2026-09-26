const card = document.getElementById('card');
const moveBadge = document.getElementById('move-badge');
const playingView = document.getElementById('playing-view');
const emptyView = document.getElementById('empty-view');
const emptyText = document.getElementById('empty-text');
const coverImg = document.getElementById('cover');
const trackEl = document.getElementById('track');
const artistEl = document.getElementById('artist');
const progressFill = document.getElementById('progress-fill');
const prevBtn = document.getElementById('prev-btn');
const playPauseBtn = document.getElementById('playpause-btn');
const nextBtn = document.getElementById('next-btn');

let moveMode = false;
let connected = false;
let current = { active: false, isPlaying: false, progressMs: 0, durationMs: 0 };
let localProgress = 0;
let progressTimer = null;

function applyConfig(cfg) {
  document.documentElement.style.setProperty('--accent', cfg.accentColor || '#1db954');
  document.documentElement.style.setProperty('--radius', (cfg.borderRadius ?? 20) + 'px');
  const op = (cfg.opacity ?? 62) / 100;
  document.documentElement.style.setProperty('--bg', `rgba(16,17,22,${op.toFixed(2)})`);
}

function renderMoveMode() {
  card.classList.toggle('move-region', moveMode);
  moveBadge.hidden = !moveMode;
}

function setEmptyText() {
  emptyText.textContent = connected ? 'Kein Song aktiv' : 'Nicht verbunden';
}

function renderNowPlaying() {
  if (current.active) {
    playingView.hidden = false;
    emptyView.hidden = true;
    trackEl.textContent = current.trackName || '–';
    artistEl.textContent = current.artist || '';
    if (coverImg.src !== current.albumArt) coverImg.src = current.albumArt || '';
    playPauseBtn.textContent = current.isPlaying ? '⏸' : '▶';
    localProgress = current.progressMs || 0;
    updateProgressBar();
  } else {
    playingView.hidden = true;
    emptyView.hidden = false;
    setEmptyText();
  }
}

function updateProgressBar() {
  const duration = current.durationMs || 0;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (localProgress / duration) * 100)) : 0;
  progressFill.style.width = pct + '%';
}

// lokal zwischen den Abfragen weiterlaufen lassen, für einen flüssigeren Balken
function tickProgress() {
  if (!current.active || !current.isPlaying) return;
  localProgress += 1000;
  updateProgressBar();
}

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.showContextMenu();
});

prevBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.spotifyControl('previous'); });
nextBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.spotifyControl('next'); });
playPauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  current.isPlaying = !current.isPlaying;
  playPauseBtn.textContent = current.isPlaying ? '⏸' : '▶';
  window.api.spotifyControl('playpause');
});

window.api.onNowPlaying((data) => {
  current = data;
  renderNowPlaying();
});

window.api.onConfigUpdated((cfg) => applyConfig(cfg));

window.api.onMoveModeChanged((val) => {
  moveMode = val;
  renderMoveMode();
});

async function init() {
  const cfg = await window.api.getConfig();
  applyConfig(cfg);
  moveMode = await window.api.getMoveMode();
  renderMoveMode();

  const status = await window.api.spotifyStatus();
  connected = status.connected;

  current = await window.api.getNowPlaying();
  renderNowPlaying();

  progressTimer = setInterval(tickProgress, 1000);
}

init();
