# Head Tilt Controller for YouTube — Chrome Extension

Port of the standalone PWA to a Manifest V3 browser extension. Instead of pasting
URLs into a separate page, the controller lives directly on youtube.com and drives
the page's own `<video>` element.

## Install (developer mode)

1. Open `chrome://extensions` in Chrome (or `brave://extensions`, `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extension/` folder.
4. Go to any YouTube video — a small "🎬 Tilt" widget appears at the bottom-right.

## Use

1. Click **Start Camera** in the widget and allow camera access
   (the prompt is attributed to youtube.com; all processing is local).
2. Tilt your head lightly left/right → speed down / up (0.5× … 4×).
3. Tilt past ~90% of "Max tilt" → skip backward / forward (default 10s).
4. Look away → video pauses after 1s; look back → it resumes.
5. Click ⚙ for settings: idle zone, max tilt, skip seconds, camera visibility,
   plus the live tilt gauge. Settings persist across sessions.

## Files

- `manifest.json` — MV3 manifest (content script on youtube.com only).
- `content.js` — controller logic (ported from `../app.js`): face tracking,
  tilt → speed mapping with hysteresis, skip, auto-pause.
- `ui.css` — injected widget styles (all selectors `htc-` prefixed).
- `vendor/face_mesh/` — MediaPipe Face Mesh, bundled locally so nothing is
  fetched from a CDN at runtime (store-review friendly, works offline).
- `icons/` — generated from `../icon-generator.html`.

## Notes & known limitations

- The widget follows YouTube fullscreen (it re-parents itself into the
  fullscreen element).
- YouTube sometimes re-applies its own playback rate (quality change, its speed
  menu); the extension re-enforces the tilt-selected rate while the camera is on.
- Firefox: MV3 is supported, but `chrome.storage`/`chrome.runtime` need no
  changes (Firefox provides the `chrome.*` aliases). Load via
  `about:debugging` → "Load Temporary Add-on".
- Not yet handled: YouTube Shorts player, embedded players on other sites,
  miniplayer positioning.

## Publishing checklist (when ready)

- [ ] Icons: have 128px; add 16/48 (done) + optional promo tile 1400×560
- [ ] Screenshots 1280×800 (1–5)
- [ ] Host `PRIVACY.md` content at a public URL (GitHub Pages works)
- [ ] Chrome Web Store developer account ($5 one-time)
- [ ] Justify permissions in the listing form: `storage` (settings),
      camera (core functionality, local-only), host access to youtube.com
- [ ] Version bump in `manifest.json` for each upload
