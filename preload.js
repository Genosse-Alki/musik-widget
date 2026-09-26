const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (patch) => ipcRenderer.invoke('update-config', patch),
  getMoveMode: () => ipcRenderer.invoke('get-move-mode'),
  getNowPlaying: () => ipcRenderer.invoke('get-now-playing'),

  spotifySetClientId: (id) => ipcRenderer.invoke('spotify-set-client-id', id),
  spotifyStatus: () => ipcRenderer.invoke('spotify-status'),
  spotifyConnect: () => ipcRenderer.invoke('spotify-connect'),
  spotifyDisconnect: () => ipcRenderer.invoke('spotify-disconnect'),
  spotifyControl: (action) => ipcRenderer.invoke('spotify-control', action),
  showContextMenu: () => ipcRenderer.send('widget-context-menu'),

  onNowPlaying: (cb) => ipcRenderer.on('now-playing', (e, data) => cb(data)),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (e, cfg) => cb(cfg)),
  onMoveModeChanged: (cb) => ipcRenderer.on('move-mode-changed', (e, val) => cb(val)),
});
