// YouTube Head Tilt Controller
// Main Application Logic

class HeadTiltController {
  constructor() {
    // YouTube player
    this.player = null;
    this.playerReady = false;

    // MediaPipe Face Mesh
    this.faceMesh = null;
    this.camera = null;
    this.cameraActive = false;

    // Camera elements
    this.videoElement = document.getElementById('cameraFeed');
    this.canvasElement = document.getElementById('overlay');
    this.canvasCtx = this.canvasElement.getContext('2d');

    // State
    this.currentTilt = 0;
    this.currentSpeed = 1.0;

    // Face detection state
    this.faceDetected = false;
    this.lastFaceDetectedTime = Date.now();
    this.pauseTimer = null;
    this.isPausing = false;
    this.lastSkipTime = 0; // Debounce for skip

    // Settings
    this.settings = {
      sensitivity: 1.0,
      deadZone: 3, // degrees (idle zone)
      maxTilt: 25, // degrees - beyond this triggers skip
      pauseDelay: 1.0, // seconds (fixed)
      showCamera: true,
    };

    // Discrete speed levels (0.5x to 4x)
    this.speedLevels = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
    this.currentLevelIndex = 2; // Start at 1.0x
    this.previousLevelIndex = 2; // For hysteresis
    this.skipThreshold = 0.9; // 90% of maxTilt to trigger skip
    this.hysteresisMargin = 0.15; // 15% hysteresis to prevent jitter

    // Wake Lock (to keep app active)
    this.wakeLock = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initializeFaceMesh();
    this.updateStatus('Ready - Load a video and start camera');
  }

  setupEventListeners() {
    // Camera toggle
    document.getElementById('toggleCamera').addEventListener('click', () => {
      this.toggleCamera();
    });

    // Load video
    document.getElementById('loadVideo').addEventListener('click', () => {
      this.loadYouTubeVideo();
    });

    // Settings
    document.getElementById('sensitivity').addEventListener('input', (e) => {
      this.settings.sensitivity = parseFloat(e.target.value);
      document.getElementById('sensitivityValue').textContent = e.target.value;
    });

    document.getElementById('deadZone').addEventListener('input', (e) => {
      this.settings.deadZone = parseFloat(e.target.value);
      document.getElementById('deadZoneValue').textContent = e.target.value + '°';
      this.updateCalibrationDisplay();
    });

    document.getElementById('maxTilt').addEventListener('input', (e) => {
      this.settings.maxTilt = parseFloat(e.target.value);
      document.getElementById('maxTiltValue').textContent = e.target.value + '°';
      this.updateCalibrationDisplay();
    });

    document.getElementById('pauseDelay').addEventListener('input', (e) => {
      this.settings.pauseDelay = parseFloat(e.target.value);
      document.getElementById('pauseDelayValue').textContent = e.target.value + 's';
    });

    document.getElementById('showCamera').addEventListener('change', (e) => {
      this.settings.showCamera = e.target.checked;
      document.getElementById('cameraContainer').classList.toggle('hidden', !e.target.checked);
    });

    // Handle visibility change (wake lock)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.cameraActive) {
        this.requestWakeLock();
      }
    });
  }

  // YouTube Player initialization
  initYouTubePlayer(videoId) {
    if (this.player) {
      this.player.loadVideoById(videoId);
      return;
    }

    this.player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        playsinline: 1,
        controls: 1,
        modestbranding: 1,
      },
      events: {
        onReady: (event) => {
          this.playerReady = true;
          this.updateStatus('Video loaded - Ready to control');
          event.target.playVideo();
        },
        onStateChange: (event) => {
          // Monitor playback state if needed
        },
      },
    });
  }

  loadYouTubeVideo() {
    const url = document.getElementById('youtubeUrl').value;
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      alert('Please enter a valid YouTube URL');
      return;
    }

    this.initYouTubePlayer(videoId);
  }

  extractVideoId(url) {
    // Support various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // MediaPipe Face Mesh initialization
  async initializeFaceMesh() {
    this.faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults((results) => this.onFaceResults(results));
  }

  // Camera control
  async toggleCamera() {
    if (this.cameraActive) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera() {
    try {
      this.updateStatus('Starting camera...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      this.videoElement.srcObject = stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          resolve();
        };
      });

      // Set canvas size
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

      // Start MediaPipe camera
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          await this.faceMesh.send({ image: this.videoElement });
        },
        width: 640,
        height: 480,
      });

      await this.camera.start();

      this.cameraActive = true;
      document.getElementById('toggleCamera').textContent = 'Stop Camera';
      this.updateStatus('Camera active');

      // Request wake lock
      await this.requestWakeLock();
    } catch (error) {
      console.error('Camera error:', error);
      this.updateStatus('Camera error: ' + error.message);
      alert('Could not access camera. Please grant camera permissions.');
    }
  }

  stopCamera() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }

    if (this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    this.cameraActive = false;
    document.getElementById('toggleCamera').textContent = 'Start Camera';
    this.updateStatus('Camera stopped');

    this.releaseWakeLock();
  }

  // Wake Lock to keep screen on
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock acquired');
      }
    } catch (err) {
      console.error('Wake Lock error:', err);
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  // Face detection results handler
  onFaceResults(results) {
    // Clear canvas
    this.canvasCtx.save();
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Check if eyes are visible (simple check)
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const eyesVisible = leftEye && rightEye;

      if (eyesVisible) {
        this.faceDetected = true;
        this.lastFaceDetectedTime = Date.now();
        this.updateFaceStatus('Detected');

        // Resume if was pausing
        if (this.isPausing) {
          this.resumePlayback();
        }

        // Draw face mesh (optional, for visual feedback)
        if (this.settings.showCamera) {
          this.drawFaceMesh(landmarks);
        }

        // Calculate head tilt
        const tilt = this.calculateHeadTilt(landmarks);
        this.currentTilt = tilt;

        // Update speed/seek based on tilt
        this.updatePlaybackSpeed(tilt);

        // Update UI
        this.updateTiltDisplay(tilt);
      } else {
        this.handleNoFace();
      }
    } else {
      // No face detected
      this.handleNoFace();
    }

    this.canvasCtx.restore();
  }

  handleNoFace() {
    this.faceDetected = false;
    const timeSinceLastFace = (Date.now() - this.lastFaceDetectedTime) / 1000;

    this.updateFaceStatus('Lost');
    this.updateTiltDisplay(0);

    // Instant pause after delay (no gradual slowdown)
    if (!this.isPausing && timeSinceLastFace > this.settings.pauseDelay) {
      this.startPause();
    }
  }

  startPause() {
    if (this.isPausing || !this.playerReady) return;

    this.isPausing = true;
    this.updateFaceStatus('Paused');

    // Instant pause
    if (this.player) {
      this.player.pauseVideo();
    }
  }

  resumePlayback() {
    if (!this.isPausing) return;

    this.isPausing = false;
    // Resume at normal speed (1.0x)
    this.currentLevelIndex = 2;
    this.currentSpeed = 1.0;
    if (this.playerReady) {
      this.player.setPlaybackRate(1.0);
      if (this.player.getPlayerState() !== 1) {
        // Not playing
        this.player.playVideo();
      }
      this.updateSpeedDisplay('1.0x');
      this.updateSpeedOverlay();
    }
  }

  drawFaceMesh(landmarks) {
    // Draw minimal face outline for visual feedback
    this.canvasCtx.strokeStyle = '#667eea';
    this.canvasCtx.lineWidth = 2;

    // Draw face oval
    const faceOval = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
      136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
    ];

    this.canvasCtx.beginPath();
    for (let i = 0; i < faceOval.length; i++) {
      const point = landmarks[faceOval[i]];
      const x = point.x * this.canvasElement.width;
      const y = point.y * this.canvasElement.height;

      if (i === 0) {
        this.canvasCtx.moveTo(x, y);
      } else {
        this.canvasCtx.lineTo(x, y);
      }
    }
    this.canvasCtx.closePath();
    this.canvasCtx.stroke();

    // Draw nose tip (landmark 1) as reference point
    const nose = landmarks[1];
    this.canvasCtx.fillStyle = '#ff6b6b';
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(nose.x * this.canvasElement.width, nose.y * this.canvasElement.height, 5, 0, 2 * Math.PI);
    this.canvasCtx.fill();
  }

  calculateHeadTilt(landmarks) {
    // Use eye landmarks to calculate head roll (tilt)
    // Left eye outer corner: 33
    // Right eye outer corner: 263

    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    // Calculate angle
    const deltaY = rightEye.y - leftEye.y;
    const deltaX = rightEye.x - leftEye.x;
    const angleRadians = Math.atan2(deltaY, deltaX);
    const angleDegrees = angleRadians * (180 / Math.PI);

    // Normalize: positive = tilting right, negative = tilting left
    return -angleDegrees;
  }

  updatePlaybackSpeed(tilt) {
    if (!this.playerReady) return;

    // Apply dead zone
    let effectiveTilt = tilt;
    if (Math.abs(tilt) < this.settings.deadZone) {
      effectiveTilt = 0;
    } else {
      // Subtract dead zone from the tilt
      effectiveTilt = tilt > 0 ? tilt - this.settings.deadZone : tilt + this.settings.deadZone;
    }

    //Apply sensitivity
    effectiveTilt *= this.settings.sensitivity;

    // Check for skip (at max tilt extremes)
    const skipTiltThreshold = this.settings.maxTilt * this.skipThreshold;
    const now = Date.now();
    const skipDebounce = 500; // ms between skips

    if (Math.abs(effectiveTilt) >= skipTiltThreshold && now - this.lastSkipTime > skipDebounce) {
      this.lastSkipTime = now;
      const skipAmount = 10; // seconds
      const currentTime = this.player.getCurrentTime();

      if (effectiveTilt > 0) {
        // Skip forward
        this.player.seekTo(currentTime + skipAmount, true);
        this.showSkipIndicator('▶▶ +10s');
      } else {
        // Skip backward
        this.player.seekTo(Math.max(0, currentTime - skipAmount), true);
        this.showSkipIndicator('◀◀ -10s');
      }
      return; // Don't update speed when skipping
    }

    // Map tilt to discrete speed levels with hysteresis (Schmitt trigger)
    const numLevels = this.speedLevels.length;
    const normalSpeedIndex = 2; // 1.0x is at index 2

    let targetIndex;
    const centerThreshold = 2; // Threshold to return to center

    if (Math.abs(effectiveTilt) < centerThreshold) {
      // Very close to center - return to normal speed
      targetIndex = normalSpeedIndex;
    } else if (effectiveTilt > 0) {
      // Tilt right - speed up
      const rightLevels = numLevels - normalSpeedIndex - 1; // Levels above normal

      // Calculate target index without hysteresis
      const levelOffset = Math.ceil((effectiveTilt / this.settings.maxTilt) * rightLevels);
      const rawTargetIndex = Math.min(normalSpeedIndex + levelOffset, numLevels - 1);

      // Apply hysteresis: if moving toward center, require more change
      if (this.currentLevelIndex > normalSpeedIndex) {
        // Already speeding up - check if we should reduce speed
        const movingTowardCenter = rawTargetIndex < this.currentLevelIndex;
        if (movingTowardCenter) {
          // Apply hysteresis: only change if difference exceeds margin
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
      // Tilt left - slow down
      const levelOffset = Math.ceil((Math.abs(effectiveTilt) / this.settings.maxTilt) * normalSpeedIndex);
      const rawTargetIndex = Math.max(normalSpeedIndex - levelOffset, 0);

      // Apply hysteresis: if moving toward center, require more change
      if (this.currentLevelIndex < normalSpeedIndex) {
        // Already slowing down - check if we should increase speed
        const movingTowardCenter = rawTargetIndex > this.currentLevelIndex;
        if (movingTowardCenter) {
          // Apply hysteresis: only change if difference exceeds margin
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

    // Only update if changed
    if (targetIndex !== this.currentLevelIndex) {
      this.previousLevelIndex = this.currentLevelIndex;
      this.currentLevelIndex = targetIndex;
      const speed = this.speedLevels[targetIndex];
      this.currentSpeed = speed;

      try {
        this.player.setPlaybackRate(speed);
        this.updateSpeedDisplay(speed + 'x');
        this.updateSpeedOverlay();
      } catch (error) {
        console.error('Error setting playback speed:', error);
      }
    }
  }

  showSkipIndicator(text) {
    const overlay = document.getElementById('speedOverlay');
    overlay.textContent = text;
    overlay.classList.add('skip-flash');
    setTimeout(() => {
      overlay.classList.remove('skip-flash');
      this.updateSpeedOverlay();
    }, 800);
  }

  updateSpeedOverlay() {
    const overlay = document.getElementById('speedOverlay');
    if (overlay) {
      overlay.textContent = this.currentSpeed.toFixed(1) + 'x';
    }
  }

  updateCalibrationDisplay() {
    const canvas = document.getElementById('calibrationCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height - 10; // Bottom center for half-circle
    const radius = Math.min(canvas.width, canvas.height * 2) / 2 - 10;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Convert angles to radians (fix direction: left tilt = negative angle on left side)
    const deadZoneAngle = (this.settings.deadZone * Math.PI) / 180;
    const maxTiltAngle = (this.settings.maxTilt * Math.PI) / 180;

    // Base for half circle (bottom horizon)
    const startAngle = Math.PI; // Left side
    const endAngle = 0; // Right side

    // Draw colored zones as pie slices

    // Left skip zone (red) - beyond max tilt on left
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + (Math.PI / 2 - maxTiltAngle));
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red
    ctx.fill();

    // Left slow zone (orange) - between dead zone and max tilt
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      radius,
      startAngle + (Math.PI / 2 - maxTiltAngle),
      startAngle + (Math.PI / 2 - deadZoneAngle),
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(251, 191, 36, 0.4)'; // Orange
    ctx.fill();

    // Dead zone in center (blue)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      radius,
      startAngle + (Math.PI / 2 - deadZoneAngle),
      startAngle + (Math.PI / 2 + deadZoneAngle),
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(102, 126, 234, 0.4)'; // Blue
    ctx.fill();

    // Right fast zone (green) - between dead zone and max tilt
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      radius,
      startAngle + (Math.PI / 2 + deadZoneAngle),
      startAngle + (Math.PI / 2 + maxTiltAngle),
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.4)'; // Green
    ctx.fill();

    // Right skip zone (red) - beyond max tilt on right
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle + (Math.PI / 2 + maxTiltAngle), endAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red
    ctx.fill();

    // Draw outer arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw base line
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw current tilt indicator (fixed direction)
    if (this.currentTilt !== 0) {
      // Convert tilt to angle (positive tilt = right = clockwise)
      const currentAngle = startAngle + Math.PI / 2 + (this.currentTilt * Math.PI) / 180;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      const indicatorLength = radius * 0.85;
      const currentX = centerX + indicatorLength * Math.cos(currentAngle);
      const currentY = centerY + indicatorLength * Math.sin(currentAngle);
      ctx.lineTo(currentX, currentY);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Draw circle at end
      ctx.beginPath();
      ctx.arc(currentX, currentY, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
    }

    // Labels
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';

    // Zone labels
    ctx.fillText('SKIP', centerX - radius * 0.7, centerY - 15);
    ctx.fillText('SLOW', centerX - radius * 0.35, centerY - radius * 0.35);
    ctx.fillText('NORMAL', centerX, centerY - radius * 0.5);
    ctx.fillText('FAST', centerX + radius * 0.35, centerY - radius * 0.35);
    ctx.fillText('SKIP', centerX + radius * 0.7, centerY - 15);

    // Show current tilt value in center
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(this.currentTilt.toFixed(1) + '°', centerX, centerY - 10);
  }

  updateSpeedDisplay(speed) {
    // Speed is now shown in overlay on video - this method kept for compatibility
  }

  updateTiltDisplay(tilt) {
    // Update calibration display to show current tilt
    this.updateCalibrationDisplay();
  }

  updateStatus(message) {
    document.getElementById('status').textContent = message;
  }

  updateFaceStatus(status) {
    const faceStatusEl = document.getElementById('faceStatus');
    faceStatusEl.textContent = status;

    // Color code the status
    if (status === 'Detected') {
      faceStatusEl.style.color = '#4ade80';
    } else if (status === 'Pausing...' || status === 'Lost') {
      faceStatusEl.style.color = '#fbbf24';
    } else if (status === 'Paused') {
      faceStatusEl.style.color = '#ef4444';
    } else {
      faceStatusEl.style.color = '#667eea';
    }
  }
}

// Initialize app when YouTube API is ready
let app;

function onYouTubeIframeAPIReady() {
  app = new HeadTiltController();
}

// If YouTube API already loaded
if (window.YT && window.YT.Player) {
  onYouTubeIframeAPIReady();
}

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => console.log('Service Worker registered'))
      .catch((err) => console.log('Service Worker registration failed:', err));
  });
}
