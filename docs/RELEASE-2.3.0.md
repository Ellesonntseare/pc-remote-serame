# Elleson Connect 2.3.0 — Sculpted Flow

The interface now uses a shared Carbon and Vermilion identity with purpose-built Home, Remote, Files and Audio workspaces. Navigation is one persistent object whose proportions and contour change between environments. Remote has a three-position gesture shelf, an accessible action rail, direct PC typing, fullscreen and preserved intentional zoom. Enter remains blue and Backspace red.

Switching main workspaces parks their existing controllers instead of disconnecting capture or firing audio/transfer Close handlers. File locations, selections, folder tabs and upload destination remain owned by the existing file manager. Explicit Close, Stop, sign-out and permission revocation retain their normal meaning. Lightweight appearance and reduced-motion settings disable presentation animations.

## Reference comparison

The actual Sculpted Flow reference was supplied at `C:/Users/elles/Pictures/Screenshots/file_0000000065a08211ab1de275b5426a31.png`. Its curved surfaces, warm black material, vermilion EC mark, editorial PC identity, shaped navigation and retractable remote controls guide the implementation. The user authorized remaining design decisions while away. Monolith Pulse and Kinetic Orbit were named in the brief but their images were not supplied or inspected.

Deliberate differences: no decorative PC wallpaper or simulated live statistics; Home uses an original vector surface and genuine connection state. Everyday Enter, Backspace, Files and Fullscreen remain immediately available. A low-cost CSS contour transition replaces expensive 3D rendering. Files uses its own device/location and browsing composition rather than copying Windows Explorer. All secondary capabilities are retained in Controls, Settings or their original feature pages.

## New device capabilities

- **Second screen:** Android can receive a real extended Windows display over H.264, with a hardware encoder when initialization succeeds and a software fallback. Automatic aspect fitting, portrait/landscape lock, measured adaptive quality and a local cursor are included. This requires a supported Virtual Display Driver installed once on Windows. The app opens its official setup page; no driver was installed automatically. Unsupported drivers and MuMu are not borrowed. Ending a session releases input, recovers its windows and restores the previous virtual-display configuration. Physical display extension remains to be verified on this user's driver-equipped PC and phone.
- **Fast local connection:** fresh signed probes verify a candidate is the same PC before transferring its session from HTTPS to a faster LAN route. Orientation, position and quality preferences survive that route change. Local HTTP video uses fragmented MP4/MediaSource when WebCodecs is unavailable.
- **Screen-edge file drop:** during an approved phone mouse session, a narrow Send to phone target accepts actual Explorer file drops, preserving filenames. The target is removed with the session. Existing Android receiving and transfer notifications deliver the files.
- **In-app Android updates:** owner Settings checks verified published packages through the PC. Android downloads with foreground progress, then checks size, SHA-256, package ID, higher version and the existing signing certificate before offering the Android installer. Android's installation permission and final confirmation still apply. Hosts need the authenticated GitHub CLI to obtain this personal private repository's packages.

## Validation and practical limits

Use isolated fixtures and synthetic data for automated verification; do not read the user's clipboard or operate live OS input hooks during tests. Headless Edge checks cover 320×700, 390×844, 844×390 and 1440×900, including persistent navigation, remote-session retention, deliberate zoom across keyboard resizing and viewport bounds. Native Windows compilation and Android CI validate their respective implementations. The release checkpoint records exact outcomes.

The real phone is not attached through Android debugging. APK installation, actual IME behavior, cross-edge drag delivery and driver-dependent extension require a physical device check. An initial APK update is required to obtain the native updater and second-screen bridge. Browser-only visual updates are served by the PC host.
