# Elleson Connect personal app 1.9

## Everyday navigation

Feature pages offer Home, Screen, Files, Keyboard and More in one quick-access strip. Keyboard opens the editor directly. Remote control retains its own trackpad/key dock. Files no longer asks for a separate direction menu or a second destination confirmation: opening a PC folder selects it as the send destination. Connection settings are in the Files header. On phones, compact file rows replace tall cards. Large folders render progressively rather than building thousands of hidden duplicate rows. Favourites remain saved on this device.

Settings → Appearance offers Immersive and Lightweight. Lightweight removes decorative animation, parallax and backdrop blur. Air Mouse and Android gyroscope handlers have been removed. Trackpad, touch control, the marked scroll rail, click vibration and volume-button control remain.

The Android app reconnects to the last selected trusted host on a normal fresh launch. It opens the dashboard without resuming old remote input or capture. A failed connection returns to the connection screen.

## Files and Android sharing

The Android foreground transfer service owns network/disk work independently of the WebView. Uploads use acknowledged resumable chunks. Downloads resume using Range and ETag/If-Range; a changed remote file restarts safely. Android's notification offers Pause/Resume and Cancel; the same queue appears in Files. File selection grants access only to the chosen documents. Transfers survive switching apps; a force-stop/process death pauses jobs until the user resumes, subject to their source document still being available. Android's long-running service timeout pauses work. Signing out stops transfers and removes that origin's saved queue, including completed filenames. Cookies are never written to queue metadata.

From another Android app, choose Share → Elleson Connect. Photos/documents wait in a confirmation inbox. Links/text become an editable draft. Pick the destination PC folder, then Send. The app does not silently send shared text or files. The file browser covers the PC's configured transfer folder and subfolders. Phone storage/cloud providers are browsed through Android's system document picker. Downloads ask for a destination using the system Save picker.

## Microphone fix and efficient audio

The APK now declares both RECORD_AUDIO and MODIFY_AUDIO_SETTINGS, which Chromium uses for WebView audio capture. A WebView NotReadableError can fall back to the app's native microphone bridge, including on HTTPS. Denied permission is respected. Starting another audio feature stops the prior capture; native microphone sessions are released before WebView capture is granted.

Send audio → Efficient prefers Android's available Opus encoder: 32 kbps mono for microphone, 96 kbps stereo for phone playback. Windows decodes using Concentus 2.2.2 to the normal output device. Unsupported encoders fall back to PCM; Original explicitly selects PCM. Capture still requires Android's permission/consent, and some apps prohibit playback capture. This is speaker/headphone output, not a system-wide virtual microphone.

Synthetic two-second codec checks reduced payload bytes by 95.8% mono and 93.7% stereo versus PCM. Real Windows output accepted both decoded streams at zero volume. These are codec checks, not a guarantee of quality, battery use or end-to-end delay on every phone. Physical phone capture/notification behaviour needs on-device confirmation.

## Integrated video and mouse recovery

On the PC browser, open Remote screen → Share primary screen and approve the primary monitor. On the phone, Remote screen with Auto uses that video when available; Compatibility remains available. The normal canvas/tools/input stay in place. While video is active, the native channel sends metadata/input information without duplicate JPEG capture. If video ends or disconnects, JPEG capture resumes. The quality control changes the individual video stream's bitrate/frame-rate limits. WebRTC prefers H.264 but retains compatible codecs. Browser-reported encoder information is shown where available; hardware acceleration is not assumed. This still requires browser screen-sharing approval on the PC. Across separate networks, direct WebRTC may need configured STUN/TURN; the compatibility path remains available through the existing HTTPS tunnel.

Pointer safety now sends mouse-up independently of typing acknowledgements. Lost/cancelled touches, leaving the page, opening the keyboard and losing focus release held drag buttons. This addresses a stuck-drag path that can leave Windows' blue selection rectangle active. It does not replay an unacknowledged edit.

## Windows installer

The personal Windows installer bundles Node and self-contained .NET outputs. The notification-area host offers status, Start/Stop for its own process, phone pairing, optional sign-in startup, importing an existing config.json, and updates/downloads through the private GitHub releases page. It reuses a healthy separately started host without stopping that process or showing a different host's password. Import your existing private config.json to retain Google credentials and the PC password when switching from the source-folder launcher. Existing private configuration is not bundled or overwritten by package updates.

Cloudflare's connector remains a separate installed service. The legacy Cloudflare launcher now checks that service and attempts to start it if stopped; insufficient Windows permissions are reported clearly. A running PC host alone does not establish a Cloudflare tunnel.

## Validation

The integrated Chromium flow verified H.264 video, metadata-only capture, PC input, JPEG fallback, single destination selection, native-picker/share/queue bridge actions, one-tap keyboard opening, Air Mouse removal and Lightweight appearance with zero page errors. The browser did not report its encoder implementation, so hardware encoding was not claimed. Camera picture/audio and recording tests also passed at phone and desktop widths. Automated native bridge tests simulate Android; actual phone hardware remains distinct from those checks.
