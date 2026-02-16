# 🎬 Head Tilt YouTube Controller

Control YouTube video playback speed by tilting your head! This Progressive Web App (PWA) uses MediaPipe Face Mesh to detect head tilt from your front-facing camera and adjusts video playback speed in real-time.

## 🌐 [**Try the Live Demo**](https://alvarohub.github.io/youtubeHeadTiltSpeedController/)

**👉 https://alvarohub.github.io/youtubeHeadTiltSpeedController/**

_Open on your smartphone for the best experience!_

## ✨ Features

- **Dual Control Modes**: Speed Control (variable playback speed) or Seek Control (rewind/fast-forward)
- **Head Tilt Detection**: Uses MediaPipe Face Mesh for accurate head tracking
- **Discrete Speed Levels**: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x
- **Bidirectional Seek**: Rewind (-3x to -1x) or fast-forward (1x to 3x)
- **Auto-Pause**: Automatically pauses when face not detected (eyes closed, looking away)
- **Dead Zone**: Adjustable comfort zone so you don't need perfect posture
- **YouTube IFrame API**: Direct control of YouTube videos
- **PWA Support**: Install on your phone's home screen
- **Wake Lock**: Keeps screen active during use
- **Mobile Optimized**: Responsive design for smartphones

## 🎮 How It Works

### Speed Control Mode (Default)
1. **Tilt Right** → Video speeds up through discrete levels (1.25x, 1.5x, 2.0x, 3.0x)
2. **Head Straight** → Normal speed (1.0x)
3. **Tilt Left** → Video slows down (0.75x, 0.5x)

### Seek Control Mode
1. **Tilt Right** → Fast forward (1x, 2x, 3x)
2. **Head Straight** → Normal playback (1x)
3. **Tilt Left** → Rewind backwards (-1x, -2x, -3x)

### Auto-Pause
- Close your eyes, look away, or leave → Video gradually slows down and pauses
- Return to screen → Video automatically resumes!

## 🚀 Quick Start

### Local Development

1. **Clone or download this repository**

2. **Serve the files with HTTPS** (required for camera access):

   Using Python:

   ```bash
   # Python 3
   python -m http.server 8000
   ```

   Or use any local server with HTTPS support (recommended):

   ```bash
   # Using npx with http-server
   npx http-server -p 8000 -S
   ```

3. **Open in your browser**:
   - Desktop: `https://localhost:8000`
   - Mobile: Find your computer's local IP and open `https://YOUR_IP:8000`

### Mobile Installation (PWA)

1. Open the app in Chrome/Safari on your phone
2. Tap the "Add to Home Screen" option
3. The app will install and run like a native app!

## 📱 Usage Instructions

### Step 1: Load a Video

1. Paste any YouTube URL into the input field
2. Click "Load Video"
3. The video will embed and start playing

### Step 2: Start Camera

1. Click "Start Camera"
2. Grant camera permissions when prompted
3. You'll see a small preview of your face

### Step 3: Control with Head Tilt

1. Keep your head straight for normal playback (1.0x)
2. Tilt your head right to speed up
3. Tilt your head left to slow down
4. Watches the "Speed" indicator update in real-time

### Settings Panel

- **Sensitivity**: How responsive the tilt detection is (0.5-3.0)
- **Min Speed**: Slowest playback speed when tilting left (0.25-0.75x)
- **Max Speed**: Fastest playback speed when tilting right (1.5-3.0x)
- **Show Camera**: Toggle camera preview visibility

## 🔧 Technical Details

### Architecture

```
┌─────────────────┐
│  Front Camera   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MediaPipe      │
│  Face Mesh      │
└────────┬────────┘
         │ (landmarks)
         ▼
┌─────────────────┐
│  Tilt           │
│  Calculator     │
└────────┬────────┘
         │ (angle)
         ▼
┌─────────────────┐
│  Speed          │
│  Mapper         │
└────────┬────────┘
         │ (playback rate)
         ▼
┌─────────────────┐
│  YouTube        │
│  IFrame API     │
└─────────────────┘
```

### Technologies Used

- **MediaPipe Face Mesh**: Real-time face landmark detection
- **YouTube IFrame API**: Video playback control
- **Web Camera API**: Access to front-facing camera
- **Screen Wake Lock API**: Keeps screen active
- **Service Worker**: PWA offline capability
- **Vanilla JavaScript**: No framework dependencies

### Head Tilt Calculation

The app uses eye corner landmarks (points 33 and 263) to calculate head roll:

```javascript
angle = atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
```

This angle is then mapped to playback speed using configurable sensitivity and range settings.

## 🌐 Deployment

### GitHub Pages (HTTPS)

1. Push to GitHub
2. Enable GitHub Pages in repository settings
3. Access via `https://yourusername.github.io/repo-name`

### Other Hosting

Deploy to any static hosting service that supports HTTPS:

- Netlify
- Vercel
- Firebase Hosting
- Cloudflare Pages

**Important**: HTTPS is required for camera access!

## 📋 Browser Support

- ✅ Chrome/Edge (Android & Desktop)
- ✅ Safari (iOS & macOS)
- ✅ Firefox (with camera permissions)

**Recommended**: Chrome on Android for best performance

## 🔒 Privacy & Permissions

- **Camera**: Required for head tracking
- **Wake Lock**: Optional, keeps screen on during use
- **All processing is local**: No video or face data is sent to any server
- **No tracking**: This app doesn't collect any personal data

## 🎯 Future Enhancements

Possible improvements:

- [ ] Gesture controls (nod to play/pause)
- [ ] Eye tracking for seeking
- [ ] Multi-video playlist support
- [ ] Performance optimizations for battery life
- [ ] Custom keyboard shortcuts
- [ ] Save user preferences

## 🐛 Troubleshooting

### Camera not working

- Ensure you granted camera permissions
- Check that you're using HTTPS (required for camera access)
- Try reloading the page
- Make sure no other app is using the camera

### Video not loading

- Verify the YouTube URL is correct
- Some videos may have embedding restrictions
- Try a different video

### Poor performance

- Close other apps/tabs
- Reduce camera resolution in code if needed
- Lower sensitivity setting

## 📝 License

MIT License - feel free to use and modify!

## 🤝 Contributing

This is a prototype project. Feel free to fork and improve!

## 💡 Inspiration

Created as an accessibility tool and experimental interface for hands-free video control. Perfect for:

- Working out while watching tutorials
- Cooking while following recipe videos
- Multitasking without touching your device
- Accessibility needs

---

**Built with ❤️ for hands-free video control**
