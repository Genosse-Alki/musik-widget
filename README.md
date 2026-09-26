# Spotify Widget

Ein schlankes Electron-Widget für Windows: zeigt den aktuell laufenden Spotify-Song mit
Cover, Fortschrittsbalken und Play/Pause/Skip-Steuerung direkt auf dem Desktop.

## 1. Installieren & starten

```bash
npm install
npm start
```

Beim allerersten Start öffnet sich automatisch das Einstellungsfenster, weil noch keine
Spotify-Verbindung besteht.

## 2. Mit Spotify verbinden (einmalig)

Spotify verlangt für jede App eine eigene, kostenlose Registrierung:

1. Auf [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) mit dem
   eigenen Spotify-Account einloggen und **„Create app"** klicken.
2. Beliebigen Namen/Beschreibung eintragen.
3. Bei **Redirect URIs** genau folgendes eintragen (wichtig, muss exakt passen):
   ```
   http://127.0.0.1:8899/callback
   ```
4. Unter **APIs used** „Web API" auswählen, speichern.
5. Im App-Dashboard die **Client ID** kopieren.
6. Im Widget-Einstellungsfenster die Client-ID einfügen → „Client-ID speichern" →
   „Mit Spotify verbinden". Es öffnet sich der Browser zum Spotify-Login; danach ist die
   Verbindung aktiv (kein Client-Secret nötig, die App nutzt den sichereren PKCE-Flow).

**Hinweis:** Play/Pause/Skip funktionieren nur mit **Spotify Premium** und wenn Spotify
gerade aktiv auf irgendeinem Gerät läuft (App, Web Player, Lautsprecher …) – das ist eine
Einschränkung der Spotify-API, keine der App.

## 3. Widget bedienen

- **Rechtsklick auf das Widget** → Einstellungen, Verschieben/Skalieren, Sperren
- **„Widget verschieben/skalieren"**: solange aktiv, lässt sich das Widget frei ziehen und
  an der Ecke unten rechts in der Größe anpassen
- **„Sperren (klickdurchlässig)"**: macht das Widget klickdurchlässig, damit es beim
  normalen Arbeiten nicht im Weg ist (Klicks gehen zum Desktop durch)
- Erscheinungsbild (Deckkraft, Akzentfarbe, Eckenradius, Größe) im Einstellungsfenster

Die App läuft im Tray weiter, auch wenn das Einstellungsfenster geschlossen ist. Über das
Tray-Icon lassen sich dieselben Aktionen sowie „Beenden" aufrufen.

## Als eigenständige .exe verpacken

```bash
npm run dist
```

Ergebnis liegt danach in `dist/` als Windows-Installer.

## Technische Hinweise

- Nutzt den OAuth-2.0-**PKCE**-Flow (kein Client-Secret im Code/auf der Platte nötig)
- Song-Status wird alle 3 Sekunden über die Spotify Web API abgefragt
- Zugangsdaten (Client-ID, Tokens) liegen lokal unter
  `%APPDATA%/spotify-widget/spotify.json`
- Fensterposition/-größe und Erscheinungsbild unter
  `%APPDATA%/spotify-widget/widget-config.json`
