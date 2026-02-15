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
    this.controlMode = 'speed'; // 'speed' or 'seek'

    // Face detection state
    this.faceDetected = false;
    this.lastFaceDetectedTime = Date.now();
    this.pauseTimer = null;
    this.isPausing = false;

    // Settings
    this.settings = {
      sensitivity: 1.0,
      deadZone: 3, // degrees
      pauseDelay: 2.0, // seconds
      showCamera: true,
    };

    // Discrete speed levels
    this.speedLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
    this.seekRates = [-3, -2, -1, 1, 2, 3]; // negative = backward
    this.currentLevelIndex = 2; // Start at 1.0x
    this.seekIntervalId = null;

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

    // Mode toggle
    document.getElementById('toggleMode').addEventListener('click', () => {
      this.toggleMode();
    });

    // Settings
    document.getElementById('sensitivity').addEventListener('input', (e) => {
      this.settings.sensitivity = parseFloat(e.target.value);
      document.getElementById('sensitivityValue').textContent = e.target.value;
    });

    document.getElementById('deadZone').addEventListener('input', (e) => {
      this.settings.deadZone = parseFloat(e.target.value);
      document.getElementById('deadZoneValue').textContent = e.target.value + '°';
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

  toggleMode() {
    this.controlMode = this.controlMode === 'speed' ? 'seek' : 'speed';
    const modeBtn = document.getElementById('toggleMode');
    const modeHint = document.getElementById('modeHint');

    if (this.controlMode === 'speed') {
      modeBtn.textContent = 'Mode: Speed Control';
      modeHint.textContent = 'Tilt left = slower, right = faster';
      this.currentLevelIndex = 2; // Reset to 1.0x
      this.stopSeeking();
      if (this.playerReady) {
        this.player.setPlaybackRate(1.0);
      }
    } else {
      modeBtn.textContent = 'Mode: Seek Control';
      modeHint.textContent = 'Tilt left = rewind, right = fast forward';
      this.currentLevelIndex = 3; // Center position (1x forward)
    }
    this.updateStatus('Mode: ' + (this.controlMode === 'speed' ? 'Speed' : 'Seek'));
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

    // Start pause countdown if not already pausing
    if (!this.isPausing && timeSinceLastFace > this.settings.pauseDelay) {
      this.startPauseCountdown();
    }
  }

  startPauseCountdown() {
    if (this.isPausing || !this.playerReady) return;

    this.isPausing = true;
    this.updateFaceStatus('Pausing...');

    // Gradual slowdown
    const slowdownDuration = 1000; // 1 second
    const startSpeed = this.currentSpeed;
    const startTime = Date.now();

    const slowdown = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / slowdownDuration, 1);

      if (this.faceDetected) {
        // Face reappeared, cancel slowdown
        return;
      }

      if (progress < 1) {
        const newSpeed = startSpeed * (1 - progress);
        if (this.controlMode === 'speed' && this.player) {
          this.player.setPlaybackRate(Math.max(0.25, newSpeed));
        }
        requestAnimationFrame(slowdown);
      } else {
        // Pause the video
        if (this.player) {
          this.player.pauseVideo();
          this.stopSeeking();
        }
        this.updateFaceStatus('Paused');
      }
    };

    requestAnimationFrame(slowdown);
  }

  resumePlayback() {
    if (!this.isPausing) return;

    this.isPausing = false;
    if (this.playerReady && this.player.getPlayerState() !== 1) {
      // Not playing
      this.player.playVideo();
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

    // Apply sensitivity
    effectiveTilt *= this.settings.sensitivity;

    if (this.controlMode === 'speed') {
      this.updateSpeedMode(effectiveTilt);
    } else {
      this.updateSeekMode(effectiveTilt);
    }
  }

  updateSpeedMode(tilt) {
    // Map tilt to discrete speed levels
    // Determine target level based on tilt magnitude and direction

    const maxTilt = 25; // degrees (after dead zone)
    const numLevels = this.speedLevels.length;
    const normalSpeedIndex = 2; // 1.0x is at index 2

    let targetIndex;
    if (Math.abs(tilt) < 2) {
      // Very close to center - return to normal speed
      targetIndex = normalSpeedIndex;
    } else if (tilt > 0) {
      // Tilt right - speed up
      const rightLevels = numLevels - normalSpeedIndex - 1; // Levels above normal
      const levelOffset = Math.ceil((tilt / maxTilt) * rightLevels);
      targetIndex = Math.min(normalSpeedIndex + levelOffset, numLevels - 1);
    } else {
      // Tilt left - slow down
      const levelOffset = Math.ceil((Math.abs(tilt) / maxTilt) * normalSpeedIndex);
      targetIndex = Math.max(normalSpeedIndex - levelOffset, 0);
    }

    // Only update if changed
    if (targetIndex !== this.currentLevelIndex) {
      this.currentLevelIndex = targetIndex;
      const speed = this.speedLevels[targetIndex];
      this.currentSpeed = speed;

      try {
        this.player.setPlaybackRate(speed);
        this.updateSpeedDisplay(speed + 'x');
      } catch (error) {
        console.error('Error setting playback speed:', error);
      }
    }
  }

  updateSeekMode(tilt) {
    // Map tilt to discrete seek rates
    const maxTilt = 25; // degrees (after dead zone)
    const numRates = this.seekRates.length;
    const centerIndex = 3; // 1x forward is at index 3

    let targetIndex;
    if (Math.abs(tilt) < 2) {
      // Center - play at normal speed
      targetIndex = centerIndex;
    } else if (tilt > 0) {
      // Tilt right - fast forward
      const rightLevels = numRates - centerIndex - 1;
      const levelOffset = Math.ceil((tilt / maxTilt) * rightLevels);
      targetIndex = Math.min(centerIndex + levelOffset, numRates - 1);
    } else {
      // Tilt left - rewind
      const levelOffset = Math.ceil((Math.abs(tilt) / maxTilt) * centerIndex);
      targetIndex = Math.max(centerIndex - levelOffset, 0);
    }

    // Only update if changed
    if (targetIndex !== this.currentLevelIndex) {
      this.currentLevelIndex = targetIndex;
      const rate = this.seekRates[targetIndex];

      this.stopSeeking();

      if (rate > 0) {
        // Forward seeking - use playback rate
        try {
          this.player.setPlaybackRate(rate);
          if (this.player.getPlayerState() !== 1) {
            this.player.playVideo();
          }
          this.updateSpeedDisplay('▶ ' + rate + 'x');
        } catch (error) {
          console.error('Error setting playback rate:', error);
        }
      } else {
        // Backward seeking - need to seek manually
        const absRate = Math.abs(rate);
        this.player.setPlaybackRate(1.0);

        // Seek backward continuously
        this.seekIntervalId = setInterval(() => {
          if (this.player && this.playerReady) {
            const currentTime = this.player.getCurrentTime();
            const newTime = Math.max(0, currentTime - absRate * 0.1); // Seek back based on rate
            this.player.seekTo(newTime, true);
          }
        }, 100); // Update every 100ms

        this.updateSpeedDisplay('◀ ' + absRate + 'x');
      }
    }
  }

  stopSeeking() {
    if (this.seekIntervalId) {
      clearInterval(this.seekIntervalId);
      this.seekIntervalId = null;
    }
  }

  // UI Updates
  updateTiltDisplay(tilt) {
    document.getElementById('tiltValue').textContent = tilt.toFixed(1) + '°';
  }

  updateSpeedDisplay(speed) {
    document.getElementById('speedValue').textContent = speed;
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
