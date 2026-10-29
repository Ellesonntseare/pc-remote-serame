# Elleson Connect 1.6 — Mission Control

The phone starts in Spatial Workspace, with the desk scene and live feature hotspots. Dashboard opens Mission Control. Desktop starts in Mission Control and has Spatial Workspace in its sidebar. Files, Settings, Devices, Cameras and other features open as full pages. Home has heading-only control tiles under All controls; Settings contains the drag/reorder/hide/add board. Frequently used input and file buttons stay beside the remote view.

## Screen, files and input

- One screen preview is shared between Spatial Workspace and Mission Control. Choose Connect preview to start. The stream pauses behind feature pages, outside the viewport and in background tabs. Quality choices affect the actual capture preset. Full remote controls retain their own adaptive quality, pointer, zoom, keyboard, adjustable trackpad divider and marked scroll rail.
- Dashboard latency comes from the existing status request. CPU/RAM are measured by the host. GPU, disk usage and hardware details are collected at most once per 30 seconds across clients. Missing driver readings show an em dash. Screen data rate measures received screen bytes, not a speed-test estimate. Packet loss is not invented for the reliable HTTP transport.
- Transfers work in both directions with a native-tap file input, folder preservation, ZIP downloads and bounded resumable chunks. The dashboard queue follows actual upload progress. Pausing/resuming/cancelling remains available in Files & Text.
- Keyboard opens the phone editor immediately. Choose PC field pauses delivery while selecting another Windows field. Enter and other common keys stay beside the trackpad. Text/clipboard and link inboxes support both directions within approved permissions.
- Guest Access, chat, voice, shared notes/checklists and whiteboard preserve separate guest rooms and revocation. Dashboard collaboration entries reflect approved guest sessions, not simulated people.

## Camera, sound and recording

PC webcam and Phone camera & microphone are distinct channels from Watch PC. Open the same channel on both signed-in owner devices. On the device with the camera, choose Share from this device; on the other, choose Watch here. Camera, microphone, front/back lens and source device choices are explicit. Microphone-only sharing is supported. Guest accounts cannot access these camera channels. Closing capture or putting its source page in the background releases its tracks.

Camera capture requires HTTPS or localhost, per the [MediaDevices secure-context requirement](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). In Android use Connect to website for capture. Local HTTP can receive a stream. The Android app maps only the requested camera/microphone resources to runtime permissions and limits requests to the selected trusted origin, following [WebChromeClient permission handling](https://developer.android.com/reference/android/webkit/WebChromeClient#onPermissionRequest(android.webkit.PermissionRequest)). Sharing displays the feed in Elleson Connect; it does not install a system-wide virtual webcam or microphone driver for other programs.

Watch PC shares the PC browser's selected tab/screen and its available system audio. Enable audio in the PC share picker. Record saves the current stream to this device, including only the tracks that were approved/shared. Recordings are bounded to 24 MiB in Android and 128 MiB in browsers, or 30 minutes. Android saves through its system document picker. Closing a recording saves it; signing out discards it. Protected video may prevent screen capture.

## Connection and wake

Run one current host. The launcher supports private LAN IPs and the configured tunnel simultaneously. Android accepts a plain IP, IP:port or full local HTTP URL. The previous loopback-only cloud configuration and duplicate old host could prevent local connections.

If Windows classifies your trusted home connection as Public and blocks Node, run `setup-local-network.ps1` manually as administrator. It changes active network profiles to Private and adds a program/port/subnet-scoped firewall allowance. Use it only on a trusted network. It never opens a router port.

Android can send Wake-on-LAN directly while the PC host is asleep, using the saved wired NIC MAC and local directed/limited broadcasts. BIOS/NIC support and wake configuration are still required. The Windows host cannot relay its own wake packet while off; waking from another network needs a separate powered relay. `setup-wake-on-lan.ps1` configures supported active wired adapters when run by an administrator. It does not change BIOS settings or prove that a sleep/wake cycle succeeds.

## Deliberate scope

The supplied images guide the layout, colors, artwork and motion. UI controls, charts and menus are live HTML/CSS/JS. The personal-host app does not claim paid subscriptions, hundreds of thousands of users, guaranteed uptime or end-to-end encryption based solely on the reference artwork. Google/Microsoft account sign-in and billing are not configured services in this project. Quick Actions uses existing approved controls rather than accepting arbitrary shell commands. Reduced-motion mode removes parallax and looping hotspot effects.

## Verification

Automated coverage includes server authentication/origin checks, independent camera channels, guest denial/revocation, transfer bytes and recovery, keyboard delivery/selection, full-page navigation, saved home layouts, recording size bounds and shared hardware sampling. Windows encoder checks use synthetic 4K frames. Browser review exercised widths 320, 390, 430, 768, 1280 and 1680, actual WebRTC video/audio between two pages with simulated capture hardware, recording/download and track release. A physical phone is still needed to verify its native picker, permission dialogs, speakers, background behavior and actual PC sleep/wake.
