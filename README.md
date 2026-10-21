# PC Remote — Serame's personal remote app

## Start the updated app

Installed project: `C:\Users\elles\Downloads\pc-remote-redesigned\PC-Remote-Serame-Complete\pc-remote-android`

1. Close the previous PC Remote host window.
2. Run **start-cloudflare.bat** from that folder for `remote.teamtrader.co.za`, or **start.bat** for a private LAN.
3. Wait for dependencies and the Windows desktop agent to build. Keep the host and Cloudflare connector running.
4. Reload the site on your phone and sign in with **serame**.

Node.js 20+ and the .NET 8 SDK are required. Initial setup needs internet access. Updates in the installed folder retain private configuration, remembered logins and transferred files. A source ZIP excludes those private files, dependencies and compiled output; the launcher rebuilds the required components.

## Login and guest approval

The password eye shows or conceals the text you enter. **Remember me** remembers an owner login for 30 days using an HttpOnly cookie; it does not save the password in browser storage. Disconnect revokes that login.

Guests use **guest**, then wait for an owner signed in with **serame** to approve them. Requests appear in a popup and under **Guests** in the header.

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

- **Auto** quality starts sharp, reduces encoded size during sustained movement or slow delivery, and restores sharpness when idle or the link recovers. Changes preserve native pointer coordinates and the input process.
- Manual Low / Med / High / HD target up to 12 / 20 / 24 / 30 fps, subject to PC and connection limits.
- Cumulative changed-region JPEGs and bounded frame credit prevent old frames building up behind a slow viewer.
- The separately drawn pointer gives immediate local feedback. **Controls → Pointer size** adjusts it from 50% to 250% and remembers the setting.
- **Lens** magnifies the pointer area. Fine mode slows movement; nudge buttons move one PC pixel.
- The green Trackpad/Touch toggle shows the active mode.
- Move two fingers together to scroll Windows. Spread or pinch to zoom the local view from 100% to 400%. In Pan view, or a view-only guest session, two-finger movement pans the zoomed image locally.
- **Present** hides the toolbars and keyboard tray, retaining a small **Show controls** button. Escape and a three-finger tap also restore controls. The separate full-screen icon uses browser full screen when available.
- **Apps** searches open Windows windows and brings a chosen one forward.
- **PC audio** starts only after selecting Start, with volume, mute and stop. It captures system output, never a microphone. Playback stops on sign-out, screen closure, revoked access or when the page becomes hidden. Headphones help avoid feedback near the PC speakers.

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

## Files and previews

**Files & text → Files** accepts MP3, PDF, images, videos, archives, empty files and other extensions without conversion. The default limit is 2 GiB per file, configurable with `maxFileBytes`.

Uploads use 1 MiB chunks with Pause, Resume/Retry and Cancel. Committed partials survive host restarts for up to 7 days. Reselect the same original file after reopening the page: name, size, modification date and sampled contents are checked. Owner recovery works after signing back into the same account; guests need the same still-valid approved session. Cancel/discard removes the partial. Duplicate names receive a suffix rather than overwriting files.

The default folder is **Downloads\PC Remote Transfers**. The owner can use **Open PC folder**, add files there, refresh and download them. Upload-only guests cannot browse that list. Download permission explicitly allows browsing all completed files in this shared transfer folder.

Safe image, audio, video and PDF types have previews and ranged downloads. PDF support varies; an Open PDF viewer link and original download remain available. HTML, SVG and unknown types download instead of running inline. Files are never automatically executed.

## Text and pinned snippets

**Files & text → Text** offers Send to PC clipboard, Get PC clipboard, Copy to this device, Paste from this device, and Save text as a file. Use Ctrl+V in the target PC app after sending text. Manual long-press Copy/Paste is the fallback when browser clipboard access is unavailable.

Text transfers are explicit, support up to 250,000 UTF-16 characters, and require a signed-in Windows desktop. The owner can search, preview and pin up to 20 local snippets plus 20 recent entries, within a bounded storage size. Saved text stays in that browser and can be deleted. Guest text is not saved into the owner's snippet history.

## Configuration and privacy

The default owner password is built into the host, not browser JavaScript. Override it in private `config.json` if desired. The guest password only creates a request and cannot grant itself access.

```json
{
  "tunnelHostname": "remote.teamtrader.co.za",
  "deviceName": "SERAME'S PC",
  "password": "serame",
  "maxFileBytes": 2147483648
}
```

Omit `tunnelHostname` for LAN use. `transferDirectory`, `screen` and `delaySeconds` remain supported. See `CLOUDFLARE.md`. Do not expose the raw host port publicly.

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

After the approved Android guest starts sharing, the PC owner opens **Guest screens**, selects the phone, and clicks **Request phone control**. The phone shows a native approval dialog. If the app is in the background, tap its sharing notification to review the request. Enable **PC Remote phone control** in Android Accessibility settings if requested, return to PC Remote, and explicitly choose **Allow control**. Enabling the service alone never grants remote input.

The owner selects **Control** to tap the picture, drag for a swipe, or right-click/hold for a long press. Back, Home and Recent apps are available below. **Set text** replaces the selected editable field; it does not read its previous contents, and password fields are excluded. Some apps or protected Android screens may reject input.

Each grant is limited to one requesting PC connection and ten minutes. Stop from the phone panel or the Android sharing notification. Closing the PC viewer, changing its selected phone, ending sharing, signing out, disconnecting or revoking the guest ends control. Rotation invalidates commands for the previous display; commands are acknowledged individually and are never replayed after a timeout. The Accessibility service does not log interface text or collect accessibility events. Android may require Allow restricted settings for a sideloaded app before Accessibility can be enabled. This must be done manually on the phone.

Install **PC-Remote-Android.apk** from this project folder on the Android phone (Android 8 or later). This build is version 1.3. Use **Open remote.teamtrader.co.za** for the HTTPS website, or connect to your private PC IPv4 address and port on Wi-Fi. Restart the Windows host with `start-cloudflare.bat` after this source update to load the updated screen relay.

Sign into the Android app as **guest**, have the owner approve it, then select **Share my screen**. Android asks for screen-sharing permission for every session. Android 14 and later now receive an explicit entire-display request instead of the default single-app picker. If your phone still offers a choice, select **Entire screen**. The foreground service displays a sharing notification with a Stop action. Press Home and open another app: capture and its native network connection continue while only the in-app thumbnail pauses. Rotation resizes the same capture session, including on Android 8–13. Frames are capped at 10 fps with the longest side limited to 960 pixels; actual rate depends on the phone and network. The PC owner opens **Guest screens** to view it. A late viewer immediately receives the latest frame, even if the phone is showing a still screen. One frame per active share is kept in memory and cleared on stop or revocation; it is never saved to disk. Laser/drawing annotations appear on the app preview.

The **Keyboard** button toggles the phone typing panel. Closing it or touching another remote control blurs and locks the hidden editor without deleting its draft. Enter, Backspace, delivery acknowledgements and closing Files cannot summon it again. On touch devices, a confirmed keyboard-sized viewport contraction followed by recovery releases the dismissed input; ordinary browser bar movement, rotation and pinch zoom do not clear focus when the keyboard opens.

Stop from the notification, the app panel, Android's sharing indicator, or by ending guest access. Closing the app task, navigating away, signing out, losing authentication or connection, or a system projection stop also ends sharing. The service never starts at boot and does not restart after process death. No microphone, phone audio or saved screen recording is used. Accessibility is optional and required only for separately approved phone control. Android protects secure app content normally.

The native bridge is restricted to the main frame of the selected private PC origin or the exact HTTPS website. Cookies stay in the app and authenticate its native sharing socket. Other origins cannot invoke capture. Origin unit tests run in the Android build.

The website/PWA on an ordinary phone browser cannot capture the entire Android screen; the updated Android app is required. Android System WebView must support origin-scoped web messages. If Android reports that the existing debug app has an incompatible signature, remove that earlier debug installation before installing this build; debug signing keys can differ between CI runners. A real-device permission/background/rotation test remains necessary. Phone control requires the separate Accessibility setup and local approval described below.
