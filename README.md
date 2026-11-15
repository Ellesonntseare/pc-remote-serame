# Elleson Connect

Current version: **2.3.10** for Windows and Android. One Elleson Connect app includes all phone and PC features, automatic fingerprint sign-in and resizable mouse controls. See [2.3.10 release notes](docs/RELEASE-2.3.10.md).

Your devices, together. Version **2.2.0** introduces the Elleson Connect identity across Android, Windows and the web, with a new EC icon family and the included **Elleson Keyboard**. Install it over your existing personal app to keep your settings and paired devices. See [branding and upgrade compatibility](docs/BRANDING.md).

Personal 2.1.4 adds the Windows Explorer file workspace and shared account history, folders, drafts and supported preferences. See [the 2.1.4 guide](docs/USING-2.1.4.md) for use and platform limits.

Version 2.0 adds one shared navigation bar, one Audio page, direct Windows H.264 video, completed-file actions, signed-in device management and an online indicator. See [direct video](docs/native-video.md) for engine details.

Version 1.9 added background Android transfers, Share → Elleson Connect, a folder-based file manager, integrated remote video with fallback, efficient audio, the WebView microphone permission fix, a personal Windows installer, Lightweight appearance and simpler navigation. Air Mouse is removed. See [version 1.9](docs/version-1.9.md) for use and validation limits.

Version 1.8 adds [phone-to-PC audio streaming](docs/phone-audio.md), with microphone/phone playback selection and direct Windows speaker output. The Cloudflare launcher reuses a healthy running host. Version 1.7 introduced faster local connections/transfers, Google registration/login, and native local camera/microphone capture. See [Google setup](GOOGLE-SIGN-IN.md), [version 1.7 checks](docs/version-1.7.md), [the feature guide](docs/mission-control.md), and [reference artwork notes](docs/design-artwork.md).

## Start the updated app

Installed project: `C:\Users\elles\Downloads\pc-remote-redesigned\PC-Remote-Serame-Complete\pc-remote-android`

1. Close the previous Elleson Connect host window.
2. Run **start-cloudflare.bat** for both `remote.teamtrader.co.za` and local Wi-Fi access, or **start.bat** to use your saved configuration.
3. Wait for dependencies and the Windows desktop agent to build. Keep the host and Cloudflare connector running.
4. Reload the site on your phone and sign in with your configured Google administrator account or your private PC owner password.

Node.js 22.13+ and the .NET 8 SDK are required. Initial setup needs internet access. Updates in the installed folder retain private configuration, remembered logins and transferred files. A source ZIP excludes those private files, dependencies and compiled output; the launcher rebuilds the required components.

## Login and guest approval

The password eye shows or conceals the text you enter. **Remember me** remembers an owner login for 30 days using an HttpOnly cookie; it does not save the password in browser storage. Disconnect revokes that login.

Guests use **guest**, then wait for the signed-in administrator to approve them. Requests open the full Guest Access page, also available from **Security** on desktop. The notification bell indicates pending requests.

**Select all** checks every permission, and shows a partial selection when some are enabled. The guest sees a **Guest account** ribbon and remaining time. Under **Guests**, the owner can extend an active session by 15, 30 or 60 minutes; a two-minute warning also offers **Extend 30 min**. Extensions update existing screen, input, audio and voice connection deadlines without reconnecting. Extend before expiry: an ended or revoked session needs a fresh approval. Remaining access is capped at eight hours, and extension never changes permissions.

Each approval offers these choices:

- View PC screen — selected by default.
- Mouse and keyboard — off by default.
- Clipboard, uploading files, browsing/downloading transfers, app switching, PC audio, PC status, power controls and media controls — off by default.

App switching includes control and screen viewing. Control includes screen viewing. The server checks every protected request and stream. Guests never receive the owner's activity history. CPU, memory and uptime are withheld without status permission. Guests see a generic PC name and no local transfer path. Owner clipboard snippets and upload recovery records are not loaded into a guest view.

**Full mouse/keyboard control lets a guest operate Windows apps and open files in those apps. Screen viewing reveals whatever is visible on the shared monitor.** Hiding the file-transfer or clipboard panels cannot sandbox a controlled Windows desktop.

Guests have a temporary session of up to 2 hours, need fresh approval after signing out, and lose access when the host restarts. Requests expire after 5 minutes. **Guests → End access** immediately closes their PC screen, input, audio and guest-sharing connections. Guest logins are not remembered.

## Guest screen sharing and annotations

A signed-in guest selects **Share my screen** and chooses a screen or window in the browser's permission prompt. The owner opens **Guest screens**. Sharing starts only after that explicit guest action.

Both people can use **Laser**, **Draw** and **Clear** on the shared preview. Green marks come from the owner; blue marks come from the guest. These are preview overlays. They do not draw over other Windows apps or control the guest's PC.

The guest can use **Stop sharing**, the browser's sharing indicator, or close the sharing panel. Sign-out and revocation also stop sharing. No microphone or guest system audio is captured. Only the owner can watch; other guests cannot subscribe. Frames and drawings are relayed in memory without being saved to files.

Use a desktop browser supporting screen capture over HTTPS or localhost. Phone browsers and Android WebViews may not support it. The relay sends JPEGs at up to roughly 9 fps, scaled proportionally within 1280×720, and drops frames when delivery falls behind. It uses the existing authenticated connection without a separate peer-to-peer relay. Choosing one application window avoids the recursive effect of sharing the desktop containing this app.

## Remote screen and controls

- The dashboard uses the supplied dark metallic design, teal feature icons and live CPU/memory rings. Login has floating blue/teal orbs; motion pauses when hidden or signed in and honours reduced motion.
- Files, clipboard, guests, shared screens, live video, devices, collaboration, PC audio, apps, install and control settings use redesigned page layouts with icon headers, grouped action cards and responsive work areas. The connected PC heading is centred.
- The separate **Trackpad** dock below the picture moves the pointer relatively in either screen mode. Tap to click, hold to drag, use two fingers to scroll or tap to right-click. Drawn **Left** and **Right** mouse buttons send the corresponding click.
- The top **Remote options** menu contains keyboard, shortcut keys, control settings, presentation and other remote tools. **Hide keys** keeps its saved setting.
- **Controls → Hold-to-control** optionally requires the dock's hold button or Shift before sending input. Release, cancellation, sign-out and focus loss drop queued movement and release held buttons. The same preference applies to approved Android phone control; it does not grant permission.

- **Auto** quality starts sharp, reduces encoded size during sustained movement or slow delivery, and restores sharpness when idle or the link recovers. Changes preserve native pointer coordinates and the input process.
- Manual Low / Med / High / HD target up to 12 / 20 / 24 / 30 fps, subject to PC and connection limits.
- On touch devices, **Auto** requests an encoded width suited to the phone: 1280–1920 pixels based on viewport and pixel density. Movement and network pressure reduce it further; idle restores the sharper phone profile. Native pointer coordinates stay unchanged. Manual HD retains the full PC resolution. Multiple Auto viewers use the largest requested size, and a desktop viewer can still request native detail. The capture helper starts at the phone size so its first frame is also bounded.
- Cumulative changed-region JPEGs and bounded frame credit prevent old frames building up behind a slow viewer.
- The separately drawn pointer gives immediate local feedback. **Controls → Pointer size** adjusts it from 50% to 250% and remembers the setting.
- **Lens** magnifies the pointer area. Fine mode slows movement; nudge buttons move one PC pixel.
- The green Trackpad/Touch toggle shows the active mode.
- Move two fingers together to scroll Windows. Spread or pinch to zoom the local view from 100% to 400%. In Pan view, or a view-only guest session, two-finger movement pans the zoomed image locally.
- **Present** hides the toolbars and keyboard tray, retaining a small **Show controls** button. Escape and a three-finger tap also restore controls. The separate full-screen icon uses browser full screen when available.
- **Apps** searches open Windows windows and brings a chosen one forward.
- **PC audio** starts only after selecting Start, with volume, mute and stop. It captures system output, never a microphone. Playback stops on sign-out, screen closure, revoked access or when the page becomes hidden. Headphones help avoid feedback near the PC speakers.

The dashboard's **Media remote** controls PC output independently of screen sharing. Volume changes by one percentage point per tap through the Windows audio endpoint; Mute toggles that endpoint directly. Previous, Next and Play/Pause use Windows media keys. A playback app must support those keys. Buttons wait for completion and show failures instead of typing characters into the active app.

Pointer backpressure now starts at 1 KiB of unsent socket data, rather than 64 KiB. Additional movement stays in the existing coalescing queue, preserving button order. Small frame acknowledgements still pass and acknowledged typing keeps its separate limit. Decorative control glows rotate using transforms instead of changing a gradient angle every frame. Login motion remains paused outside sign-in.

A generated 4K document benchmark (12 measured frames per configuration) produced about 334 KB per native frame, 43 KB at the phone idle profile and 26 KB during phone movement. This is approximately 87% and 92% less data for that example. Mean scaling/encoding work was 28.06, 22.25 and 19.07 ms respectively. These are synthetic host measurements; real mobile-data latency, FPS and battery use still need an on-device check after restarting the updated host.

The normal Remote screen uses custom JPEG regions with no AnyDesk code or DeskRT. It now prefers Windows DXGI GPU desktop capture and falls back to standard GDI capture when duplication is unavailable, the monitor is rotated, or the desktop/driver resets. GPU capture is retried after 10 seconds. An idle GPU desktop skips pixel readback and JPEG scanning while pointer updates continue. JPEG compression and scaling still use the CPU; this is not a zero-copy GPU video pipeline. Set the host environment variable `PCR_CAPTURE=gdi` before starting it to force the fallback. `RemoteAgent/bin/RemoteAgent.exe --capture-probe` checks availability without acquiring desktop image pixels.

High-motion video can still need substantial CPU and bandwidth. Only the primary monitor is supported; Windows secure-desktop/UAC prompts are not bypassed. A GPU availability check does not establish the real-world speed improvement on a particular PC and phone.

## WebRTC video prototype

**Video preview** is an opt-in, separate video path. The normal Remote screen remains available for control.

1. On the PC, open the app in a desktop browser over HTTPS (or localhost), sign in as owner and open **Video preview**.
2. Select **Share from this PC** and approve the browser's screen/window picker. No microphone is captured.
3. On the phone, sign in as owner or an approved guest with Screen viewing enabled. Open **Video preview → Watch PC**.
4. Stop from either the source browser's sharing indicator or the preview's Stop button. Closing the source panel ends sharing. Guest revocation closes its video peer.

The prototype prefers supported H.264 codecs, retaining compatible fallbacks. It targets at most 1920×1080, 30 fps and 4 Mbps per viewer. Actual codec, frame rate, round-trip delay, encoder implementation and power-efficiency information are shown when the browser reports them. **Browsers choose the encoder; H.264 preference does not force hardware encoding.** Missing hardware/efficiency information is not treated as proof of acceleration. Physical browser/driver testing is still needed before making this the normal video engine.

Only the owner can publish PC video. Signaling stays behind the app's same-origin authentication; approved screen viewers receive only their own peer's messages. Media travels between the browsers using WebRTC, rather than through the JPEG relay. Existing Cloudflare Tunnel does not act as a WebRTC media relay.

The default ICE server list is empty, suitable for initial same-network testing. Connections across different networks can require STUN/TURN. Configure your own servers with private `config.json` field `webRtcIceServers`, an array of objects with `urls`, and optional `username` and `credential`. Relay credentials are sent only to authenticated, approved screen viewers, so use scoped or temporary relay credentials. No third-party relay account is provisioned by this update. Use the normal Remote screen when a direct video connection is unavailable.

## Session tools (1.4)

- **Devices → Wake PC** sends a standard magic packet through the running host on its selected local network. The Android connection screen also has **Wake my PC on this Wi-Fi**, which works without contacting the host. The target must support Wake-on-LAN with its BIOS/network adapter configured; waking this same host while away from its network needs an independently powered relay. No router forwarding or BIOS setting is modified by the app.
- **Devices → Create connection code** moves the PC screen to another device already signed into the owner account. Enter the code on that device with **Continue here**. Codes expire after two minutes and are single-use. The first viewer closes after confirmation. Credentials, sessions, file lists and clipboard content are not transferred; guests cannot use this owner handoff.
- **Guests** now offers an access duration from five minutes to eight hours before approval. The guest sees a countdown, and server-side expiry closes its authenticated connections. Default access stays two hours.
- **Collaborate** offers explicit **Join voice** and **Join whiteboard**. Guest voice and whiteboard permissions must be selected during approval. Microphone permission is requested only after Join voice. Mute, End call, closing the panel, sign-out, expiry and revocation release the microphone. Android needs its microphone permission and should keep the app open for voice. Peer voice uses the same optional private `webRtcIceServers` configuration as video; some networks need a TURN relay. No voice recording is saved.
- Whiteboards are scoped to the selected approved guest session and live only in host memory. Pen colours, coordinates, stroke sizes and retained history are bounded. Drawings are cleared after the room becomes empty. Other guest sessions cannot receive them.
- **Copy text** in the remote screen or shared-screen panel reads text from the displayed frame with the local Windows OCR engine. Text stays between the client and your Windows host, with no cloud OCR service. The host needs Windows 10 version 2004 or later and an installed OCR language. Recognition accuracy depends on text size and image quality. Native checks use a generated test image without reading the real desktop.
- **Files & text → Text → Image clipboard** sends PNG images to the PC clipboard or retrieves an image from it. Choose/paste a PNG, JPEG or WebP image; it is converted to PNG locally. Copy image uses the browser clipboard when supported; Save image remains available. Images are bounded to 4096 pixels per side, 16 million pixels and 8 MiB of PNG data, and are never stored as clipboard history. This shares the explicit clipboard permission.

The new controls use concise product labels. Build notes and technical constraints stay in this documentation and chat, not in the product flow. Phone-specific permission, gesture, voice and Wake-on-LAN hardware checks still require real devices.

## Files and previews

**Files & text → Files** accepts MP3, PDF, images, videos, archives, empty files and other extensions without conversion. The default limit is 2 GiB per file, configurable with `maxFileBytes`.

Uploads use 1 MiB chunks with Pause, Resume/Retry and Cancel. Committed partials survive host restarts for up to 7 days. Reselect the same original file after reopening the page: name, size, modification date and sampled contents are checked. Owner recovery works after signing back into the same account; guests need the same still-valid approved session. Cancel/discard removes the partial. Duplicate names receive a suffix rather than overwriting files.

The default folder is **Downloads\PC Remote Transfers**. The owner can use **Open PC folder**, add files there, refresh and download them. Upload-only guests cannot browse that list. Download permission explicitly allows browsing all completed files in this shared transfer folder.

Safe image, audio, video and PDF types have previews and ranged downloads. PDF support varies; an Open PDF viewer link and original download remain available. HTML, SVG and unknown types download instead of running inline. Files are never automatically executed.

## Text and pinned snippets

**Files & text → Text** offers Send to PC clipboard, Get PC clipboard, Copy to this device, Paste from this device, and Save text as a file. Use Ctrl+V in the target PC app after sending text. Manual long-press Copy/Paste is the fallback when browser clipboard access is unavailable.

Text transfers are explicit, support up to 250,000 UTF-16 characters, and require a signed-in Windows desktop. The owner can search, preview and pin up to 20 local snippets plus 20 recent entries, within a bounded storage size. Saved text stays in that browser and can be deleted. Guest text is not saved into the owner's snippet history.

## Configuration and privacy

The host requires an owner password in private `config.json`; old default sign-ins are disabled. The Windows tray setup generates a random initial password. Configure Google owner emails locally to select the main administrator. The guest password only creates a request and cannot grant itself access.

```json
{
  "tunnelHostname": "remote.teamtrader.co.za",
  "deviceName": "SERAME'S PC",
  "password": "REPLACE_WITH_YOUR_PRIVATE_OWNER_PASSWORD",
  "maxFileBytes": 2147483648
}
```

LAN access is enabled by default for the launcher, including when `tunnelHostname` is configured. Set `allowLan: false` for a loopback-only tunnel origin. `transferDirectory`, `screen` and `delaySeconds` remain supported. See `CLOUDFLARE.md`. Do not expose the raw host port publicly.

Private configuration, remembered-session tokens, private keys, actual transferred files, dependencies and build output are excluded from Git. Remembered login files contain token hashes, not passwords.

## Verification

```text
npm ci
npm test
dotnet build RemoteAgent/RemoteAgent.csproj -c Release -o RemoteAgent/bin
dotnet run --project test/FrameEncoderChecks/FrameEncoderChecks.csproj -c Release
```

Tests use synthetic frames, mock clipboard/audio and isolated transfer folders. They cover authentication, guest permissions/privacy/revocation, sharing isolation, annotations, audio cleanup, files and resume recovery, keyboard ordering, screen backpressure, smart quality, pointer/lens settings and touch classification. DOM checks execute the served interface, password eye, guest approval and Presentation controls. These do not replace a real phone/tunnel, screen-capture permission prompt or audio hardware check.

Native checks cover 4K frames, cumulative patches, skipped updates, dynamic resolution changes with unique keyframes, and odd dimensions. Their noisy test image measured 6,115,186 bytes for a full frame and 3,009 bytes for a small patch. This is a synthetic size comparison, not a live latency or bandwidth guarantee.

## Android reverse screen sharing

### Optional phone control (1.3)

After the approved Android guest starts sharing, the PC owner opens **Guest screens**, selects the phone, and clicks **Request phone control**. The phone shows a native approval dialog. If the app is in the background, tap its sharing notification to review the request. Enable **Elleson Connect phone control** in Android Accessibility settings if requested, return to Elleson Connect, and explicitly choose **Allow control**. Enabling the service alone never grants remote input.

The owner selects **Control** to tap the picture, drag for a swipe, or right-click/hold for a long press. Back, Home and Recent apps are available below. **Set text** replaces the selected editable field; it does not read its previous contents, and password fields are excluded. Some apps or protected Android screens may reject input.

Each grant is limited to one requesting PC connection and ten minutes. Stop from the phone panel or the Android sharing notification. Closing the PC viewer, changing its selected phone, ending sharing, signing out, disconnecting or revoking the guest ends control. Rotation invalidates commands for the previous display; commands are acknowledged individually and are never replayed after a timeout. The Accessibility service does not log interface text or collect accessibility events. Android may require Allow restricted settings for a sideloaded app before Accessibility can be enabled. This must be done manually on the phone.

The Android source is version **1.6**, for Android 8 or later. GitHub Actions builds the installable APK after Android changes; see the **Build Android APK** workflow. Use **Connect to website** for the HTTPS website, or enter a private PC IPv4 address, `IP:port`, or full local URL. Restart the Windows host after updating its source. The installed Android app must also be updated to receive native picker, camera, fullscreen and file-saving fixes.

Sign into the Android app as **guest**, have the owner approve it, then select **Share my screen**. Android asks for screen-sharing permission for every session. Android 14 and later now receive an explicit entire-display request instead of the default single-app picker. If your phone still offers a choice, select **Entire screen**. The foreground service displays a sharing notification with a Stop action. Press Home and open another app: capture and its native network connection continue while only the in-app thumbnail pauses. Rotation resizes the same capture session, including on Android 8–13. Frames are capped at 10 fps with the longest side limited to 960 pixels; actual rate depends on the phone and network. The PC owner opens **Guest screens** to view it. A late viewer immediately receives the latest frame, even if the phone is showing a still screen. One frame per active share is kept in memory and cleared on stop or revocation; it is never saved to disk. Laser/drawing annotations appear on the app preview.

The **Keyboard** button toggles the phone typing panel. Closing it or touching another remote control blurs and locks the hidden editor without deleting its draft. Enter, Backspace, delivery acknowledgements and closing Files cannot summon it again. On touch devices, a confirmed keyboard-sized viewport contraction followed by recovery releases the dismissed input; ordinary browser bar movement, rotation and pinch zoom do not clear focus when the keyboard opens.

Stop from the notification, the app panel, Android's sharing indicator, or by ending guest access. Closing the app task, navigating away, signing out, losing authentication or connection, or a system projection stop also ends sharing. The service never starts at boot and does not restart after process death. Screen sharing does not capture microphone, phone audio or a saved recording. Voice chat separately requests microphone access. Accessibility is optional and required only for separately approved phone control. Android protects secure app content normally.

The native bridge is restricted to the main frame of the selected private PC origin or the exact HTTPS website. Cookies stay in the app and authenticate its native sharing socket. Other origins cannot invoke capture. Origin unit tests run in the Android build.

The website/PWA on an ordinary phone browser cannot capture the entire Android screen; the updated Android app is required. Android System WebView must support origin-scoped web messages. If Android reports that the existing debug app has an incompatible signature, remove that earlier debug installation before installing this build; debug signing keys can differ between CI runners. A real-device permission/background/rotation test remains necessary. Phone control requires the separate Accessibility setup and local approval described above.


### Projects and Elleson Socials

Projects opens the standalone Elleson Socials module through this same authenticated server at `/socials/`. Socials remains in its own repository: https://github.com/Ellesonntseare/Elleson-Socials . Set `socialsDirectory` in the host's existing `config.json` to a deployed Socials checkout/build that contains `server/node-host.mjs`, `lib`, `drizzle` and `public`. Set `socialsDataDirectory` to a separate persistent folder. Without an installed module the Projects screen reports “Not installed”.

Connect verifies the session and account scope before passing identity to Socials. Guests cannot open project records. Socials uses the same stable Connect account scope for posts, files, connection tokens and activity, retaining them across server restarts and code updates. Use the same Google account on each device; a password-paired PC owner uses the owner workspace. The existing hosted Socials database is a separate deployment; transfer existing work through an explicit workspace backup. Do not copy cookies or guess identities between hosts.

Keep the data folder and its encryption key in backups. Social login return addresses must match the server's stable HTTPS origin.
