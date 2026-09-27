# Privacy Policy — Head Tilt Controller for YouTube

_Last updated: September 2025_

**Head Tilt Controller for YouTube** ("the extension") is developed by
Cesar Lamschtein and Alvaro Cassinelli.

## What the extension does

The extension uses your device's camera to detect head tilt and controls
YouTube playback speed accordingly.

## Data collection

**The extension collects no data whatsoever.**

- Camera frames are processed **entirely on your device** using the MediaPipe
  Face Mesh model, which is bundled inside the extension itself. No frame,
  image, landmark, or derived measurement is ever transmitted, recorded, or
  stored beyond the instant it is processed.
- The extension makes **no network requests** to any server operated by us or
  by third parties. It contains no analytics, no tracking, and no advertising.
- The only information stored is your settings (idle zone, max tilt, skip
  duration, camera visibility), saved locally in your browser via
  `chrome.storage.local`. This data never leaves your device.

## Permissions

- **Camera**: required for the core functionality (head-tilt detection).
  Video is processed locally in real time and immediately discarded.
- **Storage**: used only to remember your settings between sessions.
- **Access to youtube.com**: required to control the playback speed of the
  video you are watching.

## Changes to this policy

If this policy changes, the updated version will be published at the same URL
and the extension's update notes will mention it.

## Contact

Questions: open an issue on the project repository or contact the authors at
_[add contact email before publishing]_.
