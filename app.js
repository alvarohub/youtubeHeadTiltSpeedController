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

    // Settings
    this.settings = {
      sensitivity: 1.5,
      minSpeed: 0.5,
      maxSpeed: 2.0,
      showCamera: true,
    };

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

    document.getElementById('minSpeed').addEventListener('input', (e) => {
      this.settings.minSpeed = parseFloat(e.target.value);
      document.getElementById('minSpeedValue').textContent = e.target.value + 'x';
    });

    document.getElementById('maxSpeed').addEventListener('input', (e) => {
      this.settings.maxSpeed = parseFloat(e.target.value);
      document.getElementById('maxSpeedValue').textContent = e.target.value + 'x';
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

      // Draw face mesh (optional, for visual feedback)
      if (this.settings.showCamera) {
        this.drawFaceMesh(landmarks);
      }

      // Calculate head tilt
      const tilt = this.calculateHeadTilt(landmarks);
      this.currentTilt = tilt;

      // Update speed based on tilt
      this.updatePlaybackSpeed(tilt);

      // Update UI
      this.updateTiltDisplay(tilt);
    } else {
      // No face detected
      this.updateTiltDisplay(0);
    }

    this.canvasCtx.restore();
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

    // Map tilt to playback speed
    // Center (0°): normal speed (1.0x)
    // Tilt right: faster
    // Tilt left: slower

    const { sensitivity, minSpeed, maxSpeed } = this.settings;

    // Apply sensitivity and clamp to ±30 degrees
    const normalizedTilt = Math.max(-30, Math.min(30, tilt * sensitivity));

    // Map -30 to 30 degrees to minSpeed to maxSpeed
    // 0 degrees = 1.0x
    let speed;
    if (normalizedTilt > 0) {
      // Tilting right = speed up
      speed = 1.0 + (normalizedTilt / 30) * (maxSpeed - 1.0);
    } else {
      // Tilting left = slow down
      speed = 1.0 + (normalizedTilt / 30) * (1.0 - minSpeed);
    }

    // Clamp to valid range
    speed = Math.max(minSpeed, Math.min(maxSpeed, speed));

    // Only update if speed changed significantly
    if (Math.abs(speed - this.currentSpeed) > 0.05) {
      this.currentSpeed = speed;

      try {
        this.player.setPlaybackRate(speed);
        this.updateSpeedDisplay(speed);
      } catch (error) {
        console.error('Error setting playback speed:', error);
      }
    }
  }

  // UI Updates
  updateTiltDisplay(tilt) {
    document.getElementById('tiltValue').textContent = tilt.toFixed(1) + '°';
  }

  updateSpeedDisplay(speed) {
    document.getElementById('speedValue').textContent = speed.toFixed(2) + 'x';
  }

  updateStatus(message) {
    document.getElementById('status').textContent = message;
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
