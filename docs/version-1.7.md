# Version 1.7

## Changes

- Android IP entry explicitly uses a text URI key listener. A dedicated dot button, Paste button and keyboard Go action support dotted IPv4 addresses independently of the phone keyboard's decimal-number behavior. Local Wi-Fi and Website are separate connection choices. The host is probed with bounded timeouts before switching.
- Login, Files and Devices open a full Local connection page. It saves the last address, accepts a local URL or IP:port, and offers owner-only host addresses after sign-in. Switching is blocked during an active upload.
- Local uploads use streamed 8 MiB chunks. HTTPS tunnel uploads retain 1 MiB chunks; resuming renegotiates the route's limit without changing committed offsets. Each acknowledged chunk remains durable. The transfer queue avoids rebuilding its pending rows on every chunk.
- Production serves scripts and styles in three cached, compressed bundles, preserving source order and the stylesheet cascade. Content validators avoid resending unchanged bytes. Dashboard status requests and transfer rendering pause while a feature page hides the dashboard. Workspace artwork waits until it is needed.
- Google sign-in uses the configured verified account allowlist, Google's token verifier, PKCE/state/nonce, and a browser-to-Android handoff. This requires a Google OAuth client; see the setup guide. No Google tokens go to the WebView.
- Android's local HTTP camera/microphone fallback uses foreground-only native capture with one outstanding picture and audio block each. It feeds the existing WebRTC camera/voice paths. Capture stops on page closure, sign-out and app backgrounding. Standard HTTPS browser capture remains available. The local camera fallback targets at most 12 fps and a bounded preview size to limit CPU and memory use.
- Camera pages link to Android app permissions. The APK declares Camera and Record audio in addition to notification/screen-sharing permissions. An older APK must be replaced to gain declarations absent from that installed build.
- Screenshot and recording saves use the real Android message bridge.

## Verification

- 237 Node checks passed on Windows, including Google state/nonce/allowlist rejection, native handoff, malformed local addresses, guest privacy, cache validation, exact upload bytes and switching a resumed upload from LAN to tunnel.
- Chromium checked layouts at 320, 390, 430, 768, 1280 and 1680 pixels without horizontal overflow or JavaScript errors. Camera picture/audio reached a second browser and recording saved successfully.
- A real HTTP LAN WebRTC test ran with `isSecureContext=false` and no browser `getUserMedia`. Simulated native JPEG/PCM events produced a 480×640 picture plus an audio track on the receiving browser; closure ended capture tracks. This verifies the bridge and network path, not physical Android camera hardware.
- Delaying the startup script produced zero visible frames of the old layout. The three compressed bundles initially measured 148,815 bytes before the later Google/native-media additions. Warm startup transferred 3,248 bytes across resources on that test PC. Device/network timings vary.

Physical phone camera/microphone capture and the real Google OAuth consent flow require device testing and Google credentials respectively. They are not claimed as completed hardware/account tests.
