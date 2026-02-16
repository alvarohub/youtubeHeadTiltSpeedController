# How the Head Tilt YouTube Controller Works

## Overview

This Progressive Web App (PWA) uses computer vision to detect your head tilt through the front camera and controls YouTube video playback speed accordingly. The app runs entirely in the browser using JavaScript, the YouTube IFrame API, and Google's MediaPipe Face Mesh library.

---

## Core Technologies

### 1. YouTube IFrame API

**Purpose:** Embed and control YouTube videos programmatically.

**How it loads:**

```html
<!-- In index.html -->
<script src="https://www.youtube.com/iframe_api"></script>
```

**Initialization:**
The YouTube API calls a global callback function when ready:

```javascript
function onYouTubeIframeAPIReady() {
  app = new HeadTiltController();
}
```

**Creating the player:**

```javascript
this.player = new YT.Player('player', {
  height: '100%',
  width: '100%',
  videoId: videoId,
  playerVars: {
    playsinline: 1, // Mobile compatibility
    controls: 1, // Show YouTube controls
    modestbranding: 1, // Minimal YouTube branding
  },
  events: {
    onReady: (event) => {
      this.playerReady = true;
      event.target.playVideo();
    },
  },
});
```

The `'player'` string refers to a div with `id="player"` in the HTML where the YouTube iframe is embedded.

**Controlling playback:**

- `player.setPlaybackRate(speed)` - Sets speed (0.5x to 4x)
- `player.seekTo(time, true)` - Skips forward/backward
- `player.getCurrentTime()` - Gets current playback position

---

### 2. MediaPipe Face Mesh

**Purpose:** Real-time face detection and landmark tracking.

**How it loads:**

```html
<!-- In index.html -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"></script>
```

**Initialization:**

```javascript
this.faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  },
});

this.faceMesh.setOptions({
  maxNumFaces: 1, // Only track one face
  refineLandmarks: true, // More accurate eye/mouth detection
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

// Set callback for face detection results
this.faceMesh.onResults((results) => this.onFaceResults(results));
```

**Face landmarks:**
MediaPipe provides 468 3D landmarks for facial features. We use:

- Landmark 33: Left eye outer corner
- Landmark 263: Right eye outer corner

These are used to calculate head tilt angle.

---

## DOM Element Capture

JavaScript uses `document.getElementById()` to access HTML elements:

**Key elements captured in constructor:**

```javascript
// Camera elements
this.videoElement = document.getElementById('cameraFeed');
this.canvasElement = document.getElementById('overlay');
this.canvasCtx = this.canvasElement.getContext('2d');
```

**HTML structure:**

```html
<div id="cameraContainer">
  <video id="cameraFeed" autoplay playsinline></video>
  <canvas id="overlay"></canvas>
</div>
```

- `cameraFeed` - Video element showing camera stream
- `overlay` - Canvas for drawing face mesh visualization
- `player` - Div where YouTube iframe is embedded
- `calibrationCanvas` - Canvas showing head tilt indicator

**Updating element content:**

```javascript
// Text content
document.getElementById('status').textContent = 'Camera active';

// Inline styles
element.style.color = '#4ade80';

// Classes
overlay.classList.add('skip-flash');
overlay.classList.remove('skip-flash');
```

---

## Event Listeners

Event listeners respond to user interactions and system events.

**Button clicks:**

```javascript
document.getElementById('toggleCamera').addEventListener('click', () => {
  this.toggleCamera();
});

document.getElementById('loadVideo').addEventListener('click', () => {
  this.loadYouTubeVideo();
});
```

**Range sliders (settings):**

```javascript
document.getElementById('sensitivity').addEventListener('input', (e) => {
  this.settings.sensitivity = parseFloat(e.target.value);
  document.getElementById('sensitivityValue').textContent = e.target.value;
});

document.getElementById('deadZone').addEventListener('input', (e) => {
  this.settings.deadZone = parseFloat(e.target.value);
  document.getElementById('deadZoneValue').textContent = e.target.value + '°';
  this.updateCalibrationDisplay(); // Update visual immediately
});
```

**Checkbox:**

```javascript
document.getElementById('showCamera').addEventListener('change', (e) => {
  this.settings.showCamera = e.target.checked;
  document.getElementById('cameraContainer').classList.toggle('hidden', !e.target.checked);
});
```

**Visibility change (for wake lock):**

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && this.cameraActive) {
    this.requestWakeLock(); // Re-acquire wake lock when returning to app
  }
});
```

---

## Camera Access and Processing

**Starting camera:**

```javascript
async startCamera() {
  // Request camera permission
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',        // Front camera
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  });

  // Attach stream to video element
  this.videoElement.srcObject = stream;

  // Wait for video to load
  await new Promise((resolve) => {
    this.videoElement.onloadedmetadata = () => resolve();
  });

  // Start MediaPipe processing
  this.camera = new Camera(this.videoElement, {
    onFrame: async () => {
      // Send each frame to face detection
      await this.faceMesh.send({ image: this.videoElement });
    },
    width: 640,
    height: 480
  });

  await this.camera.start();
}
```

---

## Head Tilt Calculation

**The algorithm:**

```javascript
calculateHeadTilt(landmarks) {
  // Get eye positions
  const leftEye = landmarks[33];   // Left eye outer corner
  const rightEye = landmarks[263]; // Right eye outer corner

  // Calculate angle between eyes
  const deltaY = rightEye.y - leftEye.y;
  const deltaX = rightEye.x - leftEye.x;
  const angleRadians = Math.atan2(deltaY, deltaX);
  const angleDegrees = angleRadians * (180 / Math.PI);

  // Normalize: positive = tilting right, negative = tilting left
  return -angleDegrees;
}
```

**Explanation:**

- When looking straight, eyes are level → angle ≈ 0°
- Tilt head right → right eye higher → positive angle
- Tilt head left → left eye higher → negative angle

---

## Playback Speed Control

**Processing pipeline:**

```javascript
updatePlaybackSpeed(tilt) {
  // 1. Apply dead zone (ignore small movements)
  let effectiveTilt = tilt;
  if (Math.abs(tilt) < this.settings.deadZone) {
    effectiveTilt = 0;
  } else {
    effectiveTilt = tilt > 0 ? tilt - this.settings.deadZone : tilt + this.settings.deadZone;
  }

  // 2. Apply sensitivity multiplier
  effectiveTilt *= this.settings.sensitivity;

  // 3. Check for skip threshold (90% of maxTilt)
  const skipTiltThreshold = this.settings.maxTilt * 0.9;
  if (Math.abs(effectiveTilt) >= skipTiltThreshold) {
    // Skip forward (+10s) or backward (-10s)
    const skipAmount = 10;
    const currentTime = this.player.getCurrentTime();

    if (effectiveTilt > 0) {
      this.player.seekTo(currentTime + skipAmount, true);
    } else {
      this.player.seekTo(Math.max(0, currentTime - skipAmount), true);
    }
    return; // Don't change speed when skipping
  }

  // 4. Map tilt to discrete speed levels
  // Speed levels: [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
  //                 0     1     2    3    4    5    6
  const normalSpeedIndex = 2; // 1.0x

  let targetIndex;
  if (Math.abs(effectiveTilt) < 2) {
    targetIndex = normalSpeedIndex; // Return to normal
  } else if (effectiveTilt > 0) {
    // Tilt right → speed up (indices 3-6)
    const rightLevels = 4; // Levels above normal
    const levelOffset = Math.ceil((effectiveTilt / this.settings.maxTilt) * rightLevels);
    targetIndex = Math.min(normalSpeedIndex + levelOffset, 6);
  } else {
    // Tilt left → slow down (indices 0-1)
    const levelOffset = Math.ceil((Math.abs(effectiveTilt) / this.settings.maxTilt) * normalSpeedIndex);
    targetIndex = Math.max(normalSpeedIndex - levelOffset, 0);
  }

  // 5. Update only if changed
  if (targetIndex !== this.currentLevelIndex) {
    this.currentLevelIndex = targetIndex;
    const speed = this.speedLevels[targetIndex];
    this.player.setPlaybackRate(speed);
  }
}
```

**Key features:**

- **Dead zone:** Prevents jittery control near center
- **Discrete levels:** Stable speeds, not continuous change
- **Skip functionality:** Extreme tilt triggers ±10s seek
- **Debouncing:** 500ms delay between skips to prevent rapid firing

---

## Face Detection Loop

**The callback function:**

```javascript
onFaceResults(results) {
  // Clear canvas for new frame
  this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // Check if eyes are visible
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    if (leftEye && rightEye) {
      // Face detected
      this.faceDetected = true;
      this.lastFaceDetectedTime = Date.now();
      this.updateFaceStatus('Detected');

      // Calculate and apply tilt
      const tilt = this.calculateHeadTilt(landmarks);
      this.currentTilt = tilt;
      this.updatePlaybackSpeed(tilt);

      // Update UI
      this.updateTiltDisplay(tilt);
      this.drawFaceMesh(landmarks);
    }
  } else {
    // No face - start pause timer
    this.handleNoFace();
  }
}
```

This function is called ~30 times per second, once for each camera frame.

---

## Auto-Pause Feature

**Logic:**

```javascript
handleNoFace() {
  this.faceDetected = false;
  const timeSinceLastFace = (Date.now() - this.lastFaceDetectedTime) / 1000;

  this.updateFaceStatus('Lost');

  // If face lost for longer than pauseDelay (default 2s)
  if (!this.isPausing && timeSinceLastFace > this.settings.pauseDelay) {
    this.startPause();
  }
}

startPause() {
  this.isPausing = true;
  this.updateFaceStatus('Paused');
  this.player.pauseVideo();
}

resumePlayback() {
  this.isPausing = false;
  this.player.playVideo();
  this.player.setPlaybackRate(1.0); // Resume at normal speed
}
```

**When face reappears:**

- Automatically resumes playback
- Resets to 1.0x speed
- Continues tracking tilt

---

## Visual Feedback

### 1. Speed Overlay

Displayed on video in top-right corner:

```javascript
updateSpeedOverlay() {
  const overlay = document.getElementById('speedOverlay');
  overlay.textContent = this.currentSpeed.toFixed(1) + 'x';
}
```

### 2. Skip Indicator

Flashes on video when skipping:

```javascript
showSkipIndicator(text) {
  const overlay = document.getElementById('speedOverlay');
  overlay.textContent = text; // "▶▶ +10s" or "◀◀ -10s"
  overlay.classList.add('skip-flash'); // CSS animation
  setTimeout(() => {
    overlay.classList.remove('skip-flash');
    this.updateSpeedOverlay(); // Back to speed display
  }, 800);
}
```

### 3. Calibration Display

Half-circle canvas showing current tilt:

```javascript
updateCalibrationDisplay() {
  const ctx = canvas.getContext('2d');

  // Draw colored zones (red=skip, orange=slow, blue=dead, green=fast, red=skip)
  // Draw zone labels
  // Draw current tilt indicator (green line with circle)
  // Show tilt angle in center
}
```

---

## Progressive Web App (PWA)

**Service Worker:**
Enables offline functionality and installation:

```javascript
// Registration in app.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => console.log('Service Worker registered'))
      .catch((err) => console.log('Service Worker registration failed:', err));
  });
}
```

**Manifest:**

```html
<link rel="manifest" href="manifest.json" />
```

Allows "Add to Home Screen" on mobile devices.

**Wake Lock:**
Keeps screen on during use:

```javascript
async requestWakeLock() {
  try {
    this.wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {
    console.error('Wake Lock error:', err);
  }
}
```

---

## Data Flow Summary

```
1. User loads YouTube video
   ↓
2. User starts camera
   ↓
3. Camera frames → MediaPipe Face Mesh
   ↓
4. Face landmarks detected (30 fps)
   ↓
5. Calculate head tilt from eye positions
   ↓
6. Apply dead zone & sensitivity
   ↓
7. Check for skip threshold
   ↓
8. Map to discrete speed level
   ↓
9. Update YouTube player speed
   ↓
10. Update UI (overlay, calibration display)
    ↓
11. Repeat from step 3
```

---

## Key Design Decisions

1. **Discrete speed levels vs continuous:** Prevents jittery playback
2. **Skip at extreme tilt:** More useful than very slow/fast speeds
3. **Dead zone:** Essential for stable control
4. **Auto-pause with delay:** Safety feature if you look away
5. **Speed overlay on video:** Visible in fullscreen mode
6. **Half-circle calibration:** Intuitive left/right visualization
7. **Debouncing:** Prevents accidental rapid skips

---

## Browser APIs Used

- **getUserMedia:** Camera access
- **Canvas 2D:** Drawing visualizations
- **Wake Lock API:** Keep screen on
- **Service Worker API:** PWA features
- **YouTube IFrame API:** Video control
- **MediaPipe (via CDN):** Face detection

---

## Performance Considerations

- Face detection runs at ~30 fps
- Speed updates only when level changes (not every frame)
- Canvas cleared and redrawn each frame for smooth visuals
- Debouncing prevents excessive API calls
- Wake lock prevents screen timeout during use
