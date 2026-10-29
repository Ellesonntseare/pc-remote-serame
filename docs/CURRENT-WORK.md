# Elleson Connect checkpoint — 29 October 2026

## 2.3.0 implementation checkpoint

The user supplied the actual **Sculpted Flow** image and authorized remaining decisions while away. It is now the primary reference. Carbon/Vermilion Home, Remote, Files and Audio environments, persistent morphing navigation, a three-position gesture shelf, updated native/web icons and preserved workspace state are implemented. The keyboard's automatic 300% readability zoom has been removed; explicit zoom survives IME resizing. The other two concept images have not been supplied or inspected. `RELEASE-2.3.0.md` records the reference comparison and limits.

Second-screen extension, aspect fitting, orientation lock, adaptive H.264, verified fast local routing, HTTP MediaSource fallback, approved screen-edge file drops and native in-app updates are implemented. No virtual driver has been installed and no real PC input hooks or display extension were activated for tests. Driver-dependent operation and physical phone checks remain explicit limitations.

Verification so far: 374 portable Node checks passed; focused navigation/guest checks passed; real headless Edge checks passed at 320×700, 390×844, 844×390 and 1440×900; Windows helper and tray compile with no warnings. Full served-interface regression and Android CI are being completed before release/deployment. Version is 2.3.0 / Android code 23. Do not claim this version installed on the phone.

The 2.2.0 release described below remains the previously published/deployed version until the new release is verified. The installer execution review block described below still applies; do not work around it.

## Completed

- Rebranded the personal app, included keyboard, website, Windows host, notifications, sharing menus, installer and documentation as Elleson Connect / Elleson Keyboard.
- Created the EC vector logo, light/dark wordmarks, monochrome mark, Android adaptive icons, web installation icons and Windows ICO.
- Kept application IDs, signing key, accounts, pairing, storage keys, existing data folders, website address and network discovery compatible.
- Added a clear **PC mouse on phone** entry and verified that hiding the Android web view does not stop native phone control.
- Published release **v2.2.0-preview** from commit `bc4a6ee7430d2d9e6a9fcfda8f71631b74e201ca`; pushed the same commit to main and the working branch.
- Verified 354 portable checks, three branding checks, all 17 served-interface checks, and 29 checks against the live installation's preserved transfer work.
- Android build `40795862262` and Windows installer build `40795865889` succeeded. Android name, version and existing signing certificate were checked in CI.
- Updated the running Windows tray and website to **2.2.0**. Local access and `remote.teamtrader.co.za` respond; the web manifest and page title show Elleson Connect.
- Downloaded `Elleson-Connect-Android-2.2.0.apk` into the PC Downloads folder and `Downloads/PC Remote Transfers`. Physical phone installation still requires the user to open the APK and approve Update.

## Finishing the Windows installation

- Installer download completed and its digest matches GitHub: `4adea75ba17c2882a649c85749a8cf4e9022bf79a036a6b0381c0f8099311691`. The APK digest is `88f0ab2dbdb975e785130e13fd152d093010018c6d9b81b5196de982fbe332f9`.
- Automatic approval review rejected launching the installer with only **blocked by policy**. No installer command ran. This was reported to the user. Do not retry the same installer launch through another mechanism. The active source-folder host and site are already branded 2.2.0.
- Installer file: `Downloads/Elleson-Connect-Host-Setup-2.2.0.exe` (published size 148454758 bytes).
- The source-folder host is already rebranded and running, so download delay does not stop the site.
- Live deployment backup and manifest are under the ignored `test/.test-runtime/live-220-before` and `live-220-manifest.json`.

## Newly requested additions

The user selected items 1, 2 and 3 from the new suggestions. These are the next active implementation work, after the rebrand:

- [ ] True second Windows monitor on the phone. Research has confirmed that a virtual display driver is required. Prefer the signed MIT-licensed VirtualDrivers driver, with a clear one-time installation flow and safe session cleanup. No driver has been installed or display topology changed. This PC currently has Intel UHD 630, a MuMu virtual adapter and one active Generic Monitor; do not use MuMu's adapter as an app-owned display.
- [ ] Drag files across the PC screen edge to the paired phone. The existing approved mouse-handoff helper and file receiver are the integration points. Preserve original filenames and existing notification controls.
- [ ] Updates started inside the app. Initial implementation is now present but not yet fully verified, committed or deployed: `app-updates.js`, `public/app-updates.js`, server routes, Android AppUpdateService/Activity/Verifier/Policy and native bridge/capability. Three Node update tests passed. Remaining: Android compilation/unit tests, HTTP authorization/download tests, UI tests and release integration. Android must still show its own installation permission/confirmation. No claim that this feature is finished yet.

The user additionally selected smoothness items **1, 2, 3 and 6**: automatic fitting, prefer the fastest available connection, adaptive frame rate and orientation lock. They clarified that moving PC windows onto the phone must work by ordinary dragging across the desktop edge; the optional move-window shortcut is not a required step. File transfer by dragging across the edge remains a separate selected addition.

The update backend currently uses the PC's authenticated GitHub CLI for private release checks/downloads. This works on this personal PC; a fallback/configuration path is still needed for hosts without the CLI. Do not expose GitHub credentials to the phone.

Research references: Microsoft Indirect Display Driver overview, VirtualDrivers/Virtual-Display-Driver and VirtualDrivers/Virtual-Driver-Control. The driver's local pipe is documented by its maintainers as `MTTVirtualDisplayPipe`, with `PING` and `SETDISPLAYCOUNT`; inspect the primary implementation before using commands.

## Boundaries

This is a side conversation. Only its post-boundary requests are active. The user explicitly authorized rebranding, host/APK updates and the three new additions, and asked the assistant to make routine decisions while they sleep. No sub-agents. Preserve concurrent work in the original live checkout; never reset it or overwrite whole runtime files with a stale branch copy. Never read or print OAuth secrets, cloudflared tokens or real clipboard contents for testing.

The earlier keyboard zoom/crash bug was deferred, but the newly pasted redesign brief explicitly requires fixing keyboard-triggered zoom/clipping. It is now in scope under that newer instruction.

## New visual redesign request

The user supplied a complete redesign brief in `C:/Users/elles/.codex/attachments/bf0e4946-a1cb-4284-85f6-d62db2ff6c09/Pasted text.txt`. It is copied into `docs/UI-REDESIGN-BRIEF.md`; the implementation map is `docs/UI-REDESIGN-ARCHITECTURE.md`.

Required palette: Carbon `#10100F`, Vermilion `#FC563E`, warm white `#EFE7DC`, muted gray `#77756E`. Rebuild Home, Remote, Files and Audio compositions, transforming bottom navigation and gesture/motion systems. Do not just recolour cards; preserve all functions and transport state. This latest Files direction explicitly supersedes the former Windows Explorer copying.

The three concept images named in that brief were **not attached**. The attachment directory contains only the text file. A text-input question asking for their local file paths is pending. The brief requires studying all three before visual changes, so do not finalize or invent reference comparisons. Continue independent functional work and testing while waiting.

## Credit interruptions

No automatic resumption or schedule has been created. This temporary side chat cannot schedule follow-ups. If usage stops, resume from this checkpoint when the user sends **Continue**.
