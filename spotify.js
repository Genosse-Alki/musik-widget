// Spotify-Anbindung für den Hauptprozess: PKCE-OAuth (kein Client-Secret nötig),
// Token-Refresh, "aktuell läuft"-Abfrage inkl. Fortschritt und Wiedergabesteuerung.

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { shell } = require('electron');

const REDIRECT_URI = 'http://127.0.0.1:8899/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function formPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body.toString();
    const req = https.request(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : {} }); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

class SpotifyClient {
  constructor(getTokens, setTokens, getClientId) {
    this.getTokens = getTokens;
    this.setTokens = setTokens;
    this.getClientId = getClientId;
  }

  connect() {
    const clientId = (this.getClientId() || '').trim();
    if (!clientId) throw new Error('Keine Spotify Client-ID hinterlegt.');
    const { verifier, challenge } = createPkcePair();
    const state = base64url(crypto.randomBytes(16));

    return new Promise((resolve, reject) => {
      let settled = false;
      const server = http.createServer((req, res) => {
        let url;
        try { url = new URL(req.url, REDIRECT_URI); } catch (e) { res.end(); return; }
        if (url.pathname !== '/callback') { res.end(); return; }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;background:#101116;color:#f1f1f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p>Spotify verbunden – dieses Fenster kannst du schließen.</p></body></html>');
        server.close();
        if (settled) return;
        settled = true;

        const err = url.searchParams.get('error');
        const returnedState = url.searchParams.get('state');
        const authCode = url.searchParams.get('code');
        if (err) return reject(new Error(err));
        if (returnedState !== state) return reject(new Error('Ungültiger State-Wert.'));
        if (!authCode) return reject(new Error('Kein Code erhalten.'));

        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: verifier,
        });

        formPost('accounts.spotify.com', '/api/token', body)
          .then(({ status, json }) => {
            if (status !== 200) return reject(new Error('Token-Austausch fehlgeschlagen.'));
            this.setTokens({
              accessToken: json.access_token,
              refreshToken: json.refresh_token,
              expiresAt: Date.now() + json.expires_in * 1000,
            });
            resolve(true);
          })
          .catch(reject);
      });

      server.on('error', () => {
        if (!settled) { settled = true; reject(new Error('Port 8899 ist belegt. Bitte andere Anwendung schließen und erneut versuchen.')); }
      });

      server.listen(8899, '127.0.0.1', () => {
        const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: REDIRECT_URI,
          code_challenge_method: 'S256',
          code_challenge: challenge,
          scope: SCOPES,
          state,
        }).toString();
        shell.openExternal(authUrl);
      });

      setTimeout(() => {
        if (settled) return;
        settled = true;
        try { server.close(); } catch (e) { /* noop */ }
        reject(new Error('Zeitüberschreitung – Anmeldung nicht abgeschlossen.'));
      }, 120000);
    });
  }

  async ensureAccessToken() {
    const tokens = this.getTokens();
    if (!tokens || !tokens.refreshToken) throw new Error('Nicht mit Spotify verbunden.');
    if (tokens.accessToken && tokens.expiresAt > Date.now() + 5000) return tokens.accessToken;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.getClientId(),
    });
    const { status, json } = await formPost('accounts.spotify.com', '/api/token', body);
    if (status !== 200) throw new Error('Token-Erneuerung fehlgeschlagen.');
    const updated = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    this.setTokens(updated);
    return updated.accessToken;
  }

  apiRequest(method, apiPath) {
    return this.ensureAccessToken().then((accessToken) => new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.spotify.com', path: apiPath, method, headers: { Authorization: `Bearer ${accessToken}` } },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode === 204 || !data) return resolve({ status: res.statusCode, json: null });
            try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
            catch (e) { resolve({ status: res.statusCode, json: null }); }
          });
        }
      );
      req.on('error', reject);
      req.end();
    }));
  }

  async getCurrentlyPlaying() {
    const { status, json } = await this.apiRequest('GET', '/v1/me/player/currently-playing');
    if (status !== 200 || !json || !json.item) {
      return { active: false, isPlaying: false, trackName: '', artist: '', albumArt: '', progressMs: 0, durationMs: 0 };
    }
    const item = json.item;
    return {
      active: true,
      isPlaying: !!json.is_playing,
      trackName: item.name || '',
      artist: (item.artists || []).map((a) => a.name).join(', '),
      albumArt: (item.album && item.album.images && item.album.images[0] && item.album.images[0].url) || '',
      progressMs: json.progress_ms || 0,
      durationMs: item.duration_ms || 0,
    };
  }

  playPause(isPlaying) {
    return this.apiRequest('PUT', isPlaying ? '/v1/me/player/pause' : '/v1/me/player/play');
  }
  next() { return this.apiRequest('POST', '/v1/me/player/next'); }
  previous() { return this.apiRequest('POST', '/v1/me/player/previous'); }
}

module.exports = { SpotifyClient };
