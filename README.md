# ShonenX — Read. Watch. Track. (Web Edition)

ShonenX is an open-source, ad-free anime & manga discovery, streaming, reading, and tracking client rewritten from the Flutter repository (`senpai85xe/ShonenX`) into **React 19 + TypeScript + Vite + Tailwind CSS v4**.

## Features Preserved

- **Multi-Provider Discovery & Search**: Real-time catalog feeds and search across **AniList GraphQL**, **MyAnimeList (Jikan v4)**, and **Kitsu REST**, with advanced filters (genres, season, year, status, format, sort), outage fallback notices, and quick genre tiles.
- **Media Details & Episode/Chapter Lists**: Parallax cover hero, synopsis, studios, characters & voice actors, relations, recommendations, real Jikan episode titles, downloads queue integration, and in-app comments/discussion drawer.
- **Library & Tracker Sync**: Local browser persistence (`localStorage`) plus **AniList Personal Access Token** cloud sync, status shelves (`CURRENT`, `PLANNING`, `COMPLETED`, `PAUSED`, `DROPPED`, `REPEATING`), and Continue Watching / Reading history.
- **Video Player (`/player`)**: HLS (`hls.js`) & MP4 playback, **AniSkip v2** OP/ED skip markers, custom caption overlay, server switcher, episode drawer, speed/volume/fullscreen controls, and keyboard shortcuts (`Space/K`, `Left/Right`, `M`, `F`, `N`).
- **Manga Reader (`/reader`)**: Vertical Webtoon scroll, Single Page, and Double Page spreads, LTR/RTL toggle, fit modes (`width`, `height`, `original`), and canvas backdrops (`black`, `dark`, `white`, `sepia`).
- **Airing Calendar & Downloads**: Weekly airing schedule (`/calendar`) and background download queue manager (`/downloads`).
- **Theming & Customization Suite**: 23 exclusive color schemes, 5 built-in theme presets (`Blood`, `Frostbite`, `Neon Pulse`, `Sakura Dream`, `animestream Ultra`), Dark/Light/AMOLED surfaces, gradients + noise overlay, 9 media card styles, 5 nav styles, TV mode (`useNewUi`), Home section editor, PIN lock (`SecurityGate`), Backup/Restore JSON manifest, and Logs viewer.

## Scripts

```bash
npm install
npm run dev      # Starts Vite dev server on 0.0.0.0:3000
npm run lint     # Runs TypeScript type-checking (tsc --noEmit)
npm run build    # Type-checks and builds production bundle
```

## Web Runtime Adaptations

- **Local Storage**: Native Isar / SharedPreferences storage is replaced by `localStorage` (`shonenx_state_v2`) and JSON Backup Manifest import/export.
- **Media Playback**: Native `libmpv` / `media_kit` is replaced by `hls.js` + HTML5 `<video>`.
- **Extension Bridges**: Native Android APK / Dart bytecode extension runtimes are adapted into web-safe stream/chapter sources and repository manifests.
- **Discord Rich Presence**: Runs as a configuration & live activity preview in the browser (native IPC requires desktop OS sockets).
