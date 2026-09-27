// Head Tilt Controller for YouTube — content script
// Ported from the standalone PWA (app.js). Controls the page's HTML5 <video>
// directly instead of the YouTube IFrame API.

(function () {
  'use strict';

  // Avoid double-injection on YouTube SPA navigations
  if (window.__htcInjected) return;
  window.__htcInjected = true;

  const HTC_VERSION = '0.1.0';

  class HeadTiltExtension {
    constructor() {
      // HTML5 video on the YouTube page
      this.video = null;

      // MediaPipe Face Mesh
      this.faceMesh = null;
      this.faceMeshReady = false;
      this.cameraActive = false;
      this._rafId = null;
      this._sending = false;

      // State
      this.currentTilt = 0;
      this.currentSpeed = 1.0;

      // Face detection state
      this.faceDetected = false;
      this.lastFaceDetectedTime = Date.now();
      this.isPausing = false;
      this.lastSkipTime = 0;

      // Rate-change enforcement guard (YouTube sometimes re-applies its own rate)
      this._settingRate = false;

      // Settings (persisted via chrome.storage.local)
      this.settings = {
        sensitivity: 1.0,
        deadZone: 3, // degrees (idle zone)
        maxTilt: 25, // degrees — beyond this triggers skip
        pauseDelay: 1.0, // seconds without face → pause
        showCamera: true,
        skipSeconds: 10,
      };

      // Discrete speed levels
      this.speedLevels = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
      this.currentLevelIndex = 2; // 1.0x
      this.skipThreshold = 0.9; // 90% of maxTilt triggers skip
      this.hysteresisMargin = 0.15;

      this.wakeLock = null;

      this.init();
    }

    async init() {
      this.injectUI();
      await this.loadSettings();
      this.attachVideo();
      this.setupEventListeners();
      this.initializeFaceMesh();

      // YouTube is a SPA — re-attach on navigation
      window.addEventListener('yt-navigate-finish', () => this.attachVideo());

      // Keep overlay visible during YouTube fullscreen
      document.addEventListener('fullscreenchange', () => this.handleFullscreen());
    }

    // ---------- UI ----------

    injectUI() {
      const root = document.createElement('div');
      root.id = 'htc-root';
      root.innerHTML = `
        <div id="htc-head">
          <span id="htc-title">🎬 Tilt</span>
          <button id="htc-toggle" class="htc-btn">Start Camera</button>
          <button id="htc-gear" class="htc-btn htc-icon" title="Settings">⚙</button>
        </div>
        <div id="htc-cam">
          <video id="htc-feed" autoplay playsinline muted></video>
          <canvas id="htc-overlay"></canvas>
          <div id="htc-angle">0°</div>
        </div>
        <div id="htc-speed">1.0x</div>
        <div id="htc-status">Idle</div>
        <div id="htc-panel">
          <label class="htc-row">
            <input type="checkbox" id="htc-showCam" checked /> Show camera feed
          </label>
          <div class="htc-row">
            <span>Idle zone</span>
            <input type="range" id="htc-deadZone" min="0" max="15" step="0.5" value="3" />
            <b id="htc-deadZoneVal">3°</b>
          </div>
          <div class="htc-row">
            <span>Max tilt (skip)</span>
            <input type="range" id="htc-maxTilt" min="15" max="40" step="1" value="25" />
            <b id="htc-maxTiltVal">25°</b>
          </div>
          <div class="htc-row">
            <span>Skip seconds</span>
            <input type="range" id="htc-skipSec" min="5" max="30" step="5" value="10" />
            <b id="htc-skipSecVal">10s</b>
          </div>
          <canvas id="htc-gauge" width="280" height="150"></canvas>
          <div class="htc-credit">Cesar Lamschtein &amp; Alvaro Cassinelli 2025</div>
        </div>
      `;
      document.body.appendChild(root);
      this.root = root;
    }

    setupEventListeners() {
      const $ = (id) => document.getElementById(id);

      $('htc-toggle').addEventListener('click', () => this.toggleCamera());
      $('htc-gear').addEventListener('click', () => {
        this.root.classList.toggle('htc-open');
        this.updateCalibrationDisplay();
      });

      $('htc-showCam').addEventListener('change', (e) => {
        this.settings.showCamera = e.target.checked;
        $('htc-cam').classList.toggle('htc-hidden', !e.target.checked);
        this.saveSettings();
      });

      $('htc-deadZone').addEventListener('input', (e) => {
        this.settings.deadZone = parseFloat(e.target.value);
        $('htc-deadZoneVal').textContent = e.target.value + '°';
        this.updateCalibrationDisplay();
        this.saveSettings();
      });

      $('htc-maxTilt').addEventListener('input', (e) => {
        this.settings.maxTilt = parseFloat(e.target.value);
        $('htc-maxTiltVal').textContent = e.target.value + '°';
        this.updateCalibrationDisplay();
        this.saveSettings();
      });

      $('htc-skipSec').addEventListener('input', (e) => {
        this.settings.skipSeconds = parseFloat(e.target.value);
        $('htc-skipSecVal').textContent = e.target.value + 's';
        this.saveSettings();
      });
    }

    async loadSettings() {
      try {
        const stored = await chrome.storage.local.get('htcSettings');
        if (stored && stored.htcSettings) {
          Object.assign(this.settings, stored.htcSettings);
          const $ = (id) => document.getElementById(id);
          $('htc-deadZone').value = this.settings.deadZone;
          $('htc-deadZoneVal').textContent = this.settings.deadZone + '°';
          $('htc-maxTilt').value = this.settings.maxTilt;
          $('htc-maxTiltVal').textContent = this.settings.maxTilt + '°';
          $('htc-skipSec').value = this.settings.skipSeconds;
          $('htc-skipSecVal').textContent = this.settings.skipSeconds + 's';
          $('htc-showCam').checked = this.settings.showCamera;
          $('htc-cam').classList.toggle('htc-hidden', !this.settings.showCamera);
        }
      } catch (e) {
        console.warn('[HTC] settings load failed', e);
      }
    }

    saveSettings() {
      try {
        chrome.storage.local.set({ htcSettings: this.settings });
      } catch (e) {
        /* storage unavailable (e.g. Firefox private mode) */
      }
    }

    handleFullscreen() {
      const fs = document.fullscreenElement;
      if (fs && !fs.contains(this.root)) {
        fs.appendChild(this.root);
      } else if (!fs && this.root.parentElement !== document.body) {
        document.body.appendChild(this.root);
      }
    }

    // ---------- Video control ----------

    attachVideo() {
      const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (!v || v === this.video) return;

      if (this.video) this.video.removeEventListener('ratechange', this._onRateChange);
      this.video = v;

      this._onRateChange = () => {
        if (this._settingRate) {
          this._settingRate = false;
          return;
        }
        // YouTube re-applied its own rate — restore ours if user is tilting
        if (this.cameraActive && this.faceDetected && this.video.playbackRate !== this.currentSpeed) {
          this._applyRate(this.currentSpeed);
        } else if (!this.cameraActive) {
          // Follow the page's own rate when we're not controlling
          this.currentSpeed = this.video.playbackRate || 1.0;
          this.currentLevelIndex = this.nearestLevelIndex(this.currentSpeed);
          this.updateSpeedOverlay();
        }
      };
      this.video.addEventListener('ratechange', this._onRateChange);

      this.currentSpeed = this.video.playbackRate || 1.0;
      this.currentLevelIndex = this.nearestLevelIndex(this.currentSpeed);
      this.updateSpeedOverlay();
      this.updateStatus('Video found');
    }

    nearestLevelIndex(rate) {
      let best = 0;
      for (let i = 0; i < this.speedLevels.length; i++) {
        if (Math.abs(this.speedLevels[i] - rate) < Math.abs(this.speedLevels[best] - rate)) best = i;
      }
      return best;
    }

    _applyRate(rate) {
      if (!this.video) return;
      this._settingRate = true;
      this.video.playbackRate = rate;
    }

    // ---------- Face mesh ----------

    initializeFaceMesh() {
      if (typeof FaceMesh === 'undefined') {
        this.updateStatus('FaceMesh failed to load');
        return;
      }
      this.faceMesh = new FaceMesh({
        locateFile: (file) => chrome.runtime.getURL('vendor/face_mesh/' + file),
      });
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.faceMesh.onResults((results) => this.onFaceResults(results));
      this.faceMeshReady = true;
    }

    // ---------- Camera ----------

    async toggleCamera() {
      if (this.cameraActive) this.stopCamera();
      else await this.startCamera();
    }

    async startCamera() {
      const feed = document.getElementById('htc-feed');
      try {
        this.updateStatus('Starting camera…');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        feed.srcObject = stream;
        await new Promise((resolve) => (feed.onloadedmetadata = resolve));
        await feed.play();

        const canvas = document.getElementById('htc-overlay');
        canvas.width = feed.videoWidth;
        canvas.height = feed.videoHeight;

        const loop = async () => {
          if (!this.cameraActive) return;
          if (!this._sending && feed.readyState >= 2) {
            this._sending = true;
            try {
              await this.faceMesh.send({ image: feed });
            } catch (e) {
              console.warn('[HTC] faceMesh.send error', e);
            }
            this._sending = false;
          }
          this._rafId = requestAnimationFrame(loop);
        };
        this.cameraActive = true;
        loop();

        document.getElementById('htc-toggle').textContent = 'Stop Camera';
        this.updateStatus('Camera active');
        await this.requestWakeLock();
      } catch (error) {
        console.error('[HTC] Camera error:', error);
        this.updateStatus('Camera error — allow camera access');
      }
    }

    stopCamera() {
      this.cameraActive = false;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = null;

      const feed = document.getElementById('htc-feed');
      if (feed.srcObject) {
        feed.srcObject.getTracks().forEach((t) => t.stop());
        feed.srcObject = null;
      }

      document.getElementById('htc-toggle').textContent = 'Start Camera';
      this.updateStatus('Camera stopped');
      this.updateFaceStatus('-');
      this.releaseWakeLock();

      // Restore YouTube's own speed
      if (this.video) this._applyRate(1.0);
    }

    async requestWakeLock() {
      try {
        if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) {
        /* expected to fail when page hidden */
      }
    }

    releaseWakeLock() {
      if (this.wakeLock) {
        this.wakeLock.release();
        this.wakeLock = null;
      }
    }

    // ---------- Face results ----------

    onFaceResults(results) {
      const canvas = document.getElementById('htc-overlay');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];

      if (landmarks && landmarks[33] && landmarks[263]) {
        this.faceDetected = true;
        this.lastFaceDetectedTime = Date.now();
        this.updateFaceStatus('●');

        if (this.isPausing) this.resumePlayback();

        if (this.settings.showCamera) this.drawEyeLine(ctx, canvas, landmarks);

        const tilt = this.calculateHeadTilt(landmarks);
        this.currentTilt = tilt;
        this.updatePlaybackSpeed(tilt);
        this.updateTiltDisplay(tilt);
      } else {
        this.handleNoFace();
      }
    }

    handleNoFace() {
      this.faceDetected = false;
      const timeSinceLastFace = (Date.now() - this.lastFaceDetectedTime) / 1000;
      this.updateFaceStatus('○');
      this.updateTiltDisplay(0);

      if (!this.isPausing && timeSinceLastFace > this.settings.pauseDelay) {
        this.startPause();
      }
    }

    startPause() {
      if (this.isPausing || !this.video) return;
      this.isPausing = true;
      this.updateStatus('Face lost — paused');
      this.video.pause();
    }

    resumePlayback() {
      if (!this.isPausing) return;
      this.isPausing = false;
      this.currentLevelIndex = 2;
      this.currentSpeed = 1.0;
      if (this.video) {
        this._applyRate(1.0);
        if (this.video.paused) this.video.play();
      }
      this.updateSpeedOverlay();
      this.updateStatus('Camera active');
    }

    drawEyeLine(ctx, canvas, landmarks) {
      const w = canvas.width;
      const h = canvas.height;
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const lx = leftEye.x * w;
      const ly = leftEye.y * h;
      const rx = rightEye.x * w;
      const ry = rightEye.y * h;
      const midY = (ly + ry) / 2;

      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(w * 0.08, midY);
      ctx.lineTo(w * 0.92, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      for (const [x, y] of [
        [lx, ly],
        [rx, ry],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    calculateHeadTilt(landmarks) {
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const deltaY = rightEye.y - leftEye.y;
      const deltaX = rightEye.x - leftEye.x;
      const angleDegrees = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      return -angleDegrees; // positive = tilt right
    }

    // ---------- Speed mapping (ported unchanged) ----------

    updatePlaybackSpeed(tilt) {
      if (!this.video) return;

      let effectiveTilt = tilt;
      if (Math.abs(tilt) < this.settings.deadZone) {
        effectiveTilt = 0;
      } else {
        effectiveTilt = tilt > 0 ? tilt - this.settings.deadZone : tilt + this.settings.deadZone;
      }
      effectiveTilt *= this.settings.sensitivity;

      // Skip at extremes
      const skipTiltThreshold = this.settings.maxTilt * this.skipThreshold;
      const now = Date.now();
      if (Math.abs(effectiveTilt) >= skipTiltThreshold && now - this.lastSkipTime > 500) {
        this.lastSkipTime = now;
        const skip = this.settings.skipSeconds;
        if (effectiveTilt > 0) {
          this.video.currentTime = Math.min(this.video.duration || Infinity, this.video.currentTime + skip);
          this.showSkipIndicator(`▶▶ +${skip}s`);
        } else {
          this.video.currentTime = Math.max(0, this.video.currentTime - skip);
          this.showSkipIndicator(`◀◀ −${skip}s`);
        }
        return;
      }

      const numLevels = this.speedLevels.length;
      const normalSpeedIndex = 2;
      const centerThreshold = 2;
      let targetIndex;

      if (Math.abs(effectiveTilt) < centerThreshold) {
        targetIndex = normalSpeedIndex;
      } else if (effectiveTilt > 0) {
        const rightLevels = numLevels - normalSpeedIndex - 1;
        const levelOffset = Math.ceil((effectiveTilt / this.settings.maxTilt) * rightLevels);
        const rawTargetIndex = Math.min(normalSpeedIndex + levelOffset, numLevels - 1);

        if (this.currentLevelIndex > normalSpeedIndex) {
          if (rawTargetIndex < this.currentLevelIndex) {
            const hysteresisThreshold = 1 + this.hysteresisMargin;
            const adjustedTilt = effectiveTilt * hysteresisThreshold;
            const adjustedOffset = Math.ceil((adjustedTilt / this.settings.maxTilt) * rightLevels);
            targetIndex = Math.max(Math.min(normalSpeedIndex + adjustedOffset, numLevels - 1), normalSpeedIndex);
          } else {
            targetIndex = rawTargetIndex;
          }
        } else {
          targetIndex = rawTargetIndex;
        }
      } else {
        const levelOffset = Math.ceil((Math.abs(effectiveTilt) / this.settings.maxTilt) * normalSpeedIndex);
        const rawTargetIndex = Math.max(normalSpeedIndex - levelOffset, 0);

        if (this.currentLevelIndex < normalSpeedIndex) {
          if (rawTargetIndex > this.currentLevelIndex) {
            const hysteresisThreshold = 1 + this.hysteresisMargin;
            const adjustedTilt = Math.abs(effectiveTilt) * hysteresisThreshold;
            const adjustedOffset = Math.ceil((adjustedTilt / this.settings.maxTilt) * normalSpeedIndex);
            targetIndex = Math.min(Math.max(normalSpeedIndex - adjustedOffset, 0), normalSpeedIndex);
          } else {
            targetIndex = rawTargetIndex;
          }
        } else {
          targetIndex = rawTargetIndex;
        }
      }

      if (targetIndex !== this.currentLevelIndex) {
        this.currentLevelIndex = targetIndex;
        const speed = this.speedLevels[targetIndex];
        this.currentSpeed = speed;
        this._applyRate(speed);
        this.updateSpeedOverlay();
      }
    }

    // ---------- Displays ----------

    showSkipIndicator(text) {
      const overlay = document.getElementById('htc-speed');
      overlay.textContent = text;
      overlay.classList.add('htc-flash');
      setTimeout(() => {
        overlay.classList.remove('htc-flash');
        this.updateSpeedOverlay();
      }, 800);
    }

    updateSpeedOverlay() {
      const overlay = document.getElementById('htc-speed');
      if (overlay) overlay.textContent = this.currentSpeed.toFixed(1) + 'x';
    }

    updateTiltDisplay(tilt) {
      this.updateCalibrationDisplay();
      const badge = document.getElementById('htc-angle');
      if (badge) {
        const deg = Math.round(tilt);
        badge.textContent = (deg > 0 ? '+' : '') + deg + '°';
        badge.style.color = Math.abs(tilt) <= this.settings.deadZone ? '#8aa2ff' : '#4ade80';
      }
    }

    updateStatus(msg) {
      const el = document.getElementById('htc-status');
      if (el) el.textContent = msg;
    }

    updateFaceStatus(symbol) {
      const el = document.getElementById('htc-angle');
      if (el) el.style.opacity = symbol === '○' ? 0.5 : 1;
    }

    updateCalibrationDisplay() {
      if (!this.root.classList.contains('htc-open')) return;
      const canvas = document.getElementById('htc-gauge');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height - 10;
      const radius = Math.min(canvas.width, canvas.height * 2) / 2 - 10;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const deadZoneAngle = (this.settings.deadZone * Math.PI) / 180;
      const maxTiltAngle = (this.settings.maxTilt * Math.PI) / 180;
      const startAngle = Math.PI;
      const endAngle = 0;

      const slice = (a0, a1, color) => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, a0, a1);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };

      // Left skip zone (red)
      slice(startAngle, startAngle + (Math.PI / 2 - maxTiltAngle), 'rgba(239,68,68,0.4)');
      // Left slow zone (orange)
      slice(
        startAngle + (Math.PI / 2 - maxTiltAngle),
        startAngle + (Math.PI / 2 - deadZoneAngle),
        'rgba(251,191,36,0.4)',
      );
      // Dead zone (blue)
      slice(
        startAngle + (Math.PI / 2 - deadZoneAngle),
        startAngle + (Math.PI / 2 + deadZoneAngle),
        'rgba(102,126,234,0.5)',
      );
      // Right fast zone (green)
      slice(
        startAngle + (Math.PI / 2 + deadZoneAngle),
        startAngle + (Math.PI / 2 + maxTiltAngle),
        'rgba(74,222,128,0.4)',
      );
      // Right skip zone (red)
      slice(startAngle + (Math.PI / 2 + maxTiltAngle), endAngle, 'rgba(239,68,68,0.4)');

      // Arc outline
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Current tilt needle
      const currentAngle = startAngle + Math.PI / 2 + (this.currentTilt * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + (radius - 8) * Math.cos(currentAngle), centerY + (radius - 8) * Math.sin(currentAngle));
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // Boot once the DOM has a body
  const boot = () => {
    window.__htc = new HeadTiltExtension();
    console.log('[HTC] Head Tilt Controller ' + HTC_VERSION + ' injected');
  };

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
