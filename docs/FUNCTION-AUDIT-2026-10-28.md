# Personal app function audit — 28 October 2026

This audit combines the complete automated application suite, native builds, responsive browser checks and selected live Windows checks. No physical Android phone is connected. Automated and simulated checks are distinguished from actual device verification below.

## Fixes completed in 2.1.3

- Fullscreen has a one-finger Windows scroll strip, Fit and exit controls. The complete desktop fits portrait and landscape, including after rotating or closing typing.
- Home/PiP entry no longer triggers the ordinary background handler that stopped screen/video transport. A failed entry expires into normal pausing rather than keeping capture running indefinitely.
- APK downloads preserve the original extension. Download responses include usable ordinary and Unicode names, matching MIME types and attachment handling. The APK parses Unicode/original names independently of Android's generic filename guess. Existing `.bin` copies must be downloaded again.
- Files offers Icons and Details, Windows shell icons/thumbnails, folders first, natural sorting and persistent view choice. Previews are lazy, bounded to two simultaneous shell requests and cached.
- Touchpad and scroll rail share one surface and border. The vertical scroll guide remains inside the right edge. The blended, shaded trail covers that shared surface and stops drawing after it fades.

## What was checked

| Area | Evidence | Practical limit |
| --- | --- | --- |
| Sign-in, Google registration and local connections | Automated account, OAuth callback, local-address and session tests | No live Google authentication or Android account chooser was automated |
| Home, navigation and Settings | Reorder/hide/add preferences, shared navigation, page continuity and device-name tests; mobile browser review | OEM font scaling and accessibility services still need a phone |
| Touch, click, drag, scroll and long press | Input transport, pointer safety, hold-repeat, gesture and dock checks; browser touch input on the fullscreen strip | Real Android touch/IME interaction needs the device |
| Keyboard | Retained text/baseline/selection, field switching, no replay and full-screen typing-close checks | Windows applications vary in accessibility field support |
| Fullscreen and floating view | Browser review at 320/390/844/1280 px; Fit across portrait/landscape; simulated Home/visibility/PiP transitions | Android Home gestures and permission behaviour need physical verification |
| PC screen and Watch PC | Real Windows GPU capture decoded in Chromium using Intel Quick Sync; Watch PC pause/resume/stop and Remote Screen passed | Loopback performance is not mobile-data or Wi-Fi performance |
| Floating video continuity | Actual Windows H.264 frames continued after simulated hidden/PiP entry | The Android window transition itself remains unverified on a phone |
| Files and folders | Browse permitted locations, upload, download, rename, move, favourites, search, selection and view preservation tests | Android document providers and network shares differ between devices |
| File integrity and resuming | Interrupted/chunked transfers, host restart and stale-write checks; a real 64 MiB transfer retained its hash | Physical background downloads and Wi-Fi handover remain phone checks |
| Download names and types | HTTP original/Unicode names, MIME, attachment and byte tests; Kotlin filename unit tests | Android Save/Open/Share must be checked on the user's document provider |
| Windows icons and thumbnails | Actual shell-generated folder/file PNGs and browser rendering; confinement, cache and concurrency tests | Unsupported preview handlers use type/folder symbols |
| PC and phone audio | Automated PCM/compressed transport, playback, sender and native fallback tests; Windows audio-device enumeration succeeded | Actual APK microphone/playback permissions and other-app audio contention need the phone |
| Phone as a Windows microphone | Native audio-device enumeration detects a virtual cable on this PC | A Windows application must select the cable's recording endpoint; actual speech capture needs the phone |
| Camera and phone sharing | Browser/native bridge, consent, stream and stop/revoke tests | Real Android camera, microphone and screen-capture prompts need the phone |
| Presentation, recording and screenshots | Application/window selection, capture lifecycle, recorder and image tool tests; native codec checks | Each presentation app and phone codec should be sampled on real hardware |
| Media, clipboard, links and collaboration | Command/state, permission, message and lifecycle tests | No private clipboard content was inspected for this audit |
| Shared settings, folders and devices | Sync, checkpoint, provider, recovery and naming tests; responsive naming/reload checks | Cross-device background timing and external services cannot be guaranteed without those devices |
| Privacy mode | Activation verification, heartbeat expiry, sign-out restoration and unsupported-capture tests | Physical monitor blanking was not visually re-tested during this audit |
| Online sessions and remote logout | Session/history tests; a real browser session was revoked during live video and lost access | Separate app/browser sessions can count separately on one device |
| Wake-on-LAN and power | Request/packet and action-contract tests | The sole PC was not shut down, restarted or put to sleep; WoL needs a separate sender and supported PC/network settings |
| Host, installer and APK | Node/native checks, signed Android build/unit/signing verification and Windows installer runtime verification | The installer was built and inspected in CI, not installed over the current live host |

## Improvements to prioritise next

1. **Automatic transfer recovery when Wi-Fi returns.** The Android transfer service preserves progress and pauses on network errors. Add an explicit auto-resume preference and network callback, while respecting a pause the user chose deliberately.
2. **A physical Android regression pass.** Test Home/PiP, save/Open/Share names, keyboard Back/reopen, fullscreen rotation, microphone contention and a long transfer while another app is open. These are the largest remaining gaps between browser checks and the user's APK experience.
3. **More room for files on small phones.** Combine the remaining location/search controls into a compact toolbar, keeping selection actions beside the selected files. The new view control already shares a row with Subfolders.
4. **Smoother video quality changes.** Changing Remote Screen quality currently restarts the stream. Retain the last frame while switching and investigate bitrate/frame-rate adaptation without a visible reconnect.
5. **Reduce uncached preview overhead.** Windows previews currently use a bounded helper request per uncached file. If profiling shows startup cost, reuse a preview worker and briefly cache unavailable previews. Keep the bounded cache/concurrency already implemented.

## Performance evidence

- The live capture check selected Windows GPU desktop duplication and Intel Quick Sync and decoded real frames without page errors.
- A local durable-write 64 MiB benchmark used 64 requests with 1 MiB chunks versus 8 requests with 8 MiB chunks; both hashes matched. Under concurrent test load it measured approximately 5.5 versus 21.6 MiB/s. These are loopback diagnostics, not promised phone transfer speeds.
- The trail stops requesting animation frames after fading and releases its canvas when inactive. Browser checks observed visible trail pixels followed by a completely cleared canvas.
- File icons use small Windows previews rather than downloading full-resolution originals to populate the file grid.

Published test/build results and the deployment checklist are recorded in [PROGRESS.md](../PROGRESS.md).


## Account workspace and Explorer review (2.1.4)

The new Explorer workspace was reviewed against the supplied Windows screenshots using actual Windows folder discovery and native shell icons. Two independent Chromium contexts verified folder/tab changes and full clipboard-history delivery. Reviews at 320, 390, 844 and 1024 pixels had no page errors or page-wide horizontal overflow. The table itself scrolls to retain the Explorer columns on phones. A new clipboard event retained an already expanded full-text history entry.

Account tests cover canonical Google/password identity, restart persistence, full text versus list previews, indexed search, per-account separation, key revision conflicts, event/import deduplication, atomic batch rejection, disconnected drafts, last-moment page exit, current scroll preservation, stale tabs after another sign-in, and retained chat/notes after live sessions end. Native clipboard readiness, receipt of an existing clipboard event and shutdown passed without printing or changing the clipboard.

A diagnostic in-memory history query retained 5,000 events, returned 50 previews (22,778 bytes), and took 2.85 ms on this PC. It measures the query path, not disk durability, mobile hardware or internet transfer speed. The production store uses durable SQLite transactions. UI state writes are coalesced; progress writes are throttled and unchanged progress is ignored.

The 51b13df foundation passed 344 Windows and 328 portable checks, native helper/tray builds and encoder/audio checks. Subsequent hooks and download-ID fixes passed their focused checks; final full-source CI and release verification are recorded in PROGRESS.md. Physical Android checks remain outstanding.

Next practical improvements for this app:

1. Add network-aware automatic resume to Android transfers while preserving a pause the user deliberately chose. The current transfer service keeps recovery state but still pauses on connection errors.
2. Reuse a Windows preview worker for uncached icons instead of starting a helper for every uncached preview. Keep the existing bounded concurrency/cache and measure cold-folder time before and after.
3. Complete file operations with Copy/Cut/Paste, Undo and Windows Recycle Bin support. Current Explorer actions are functional, but those additional Windows operations have not been represented by placeholder buttons.
4. Add account history export/backup and a storage-size view. Full recorded history now persists rather than being capped at recent activity.
5. Run the physical-phone checklist: real Home/PiP, background Pause/Cancel, Android document providers, keyboard/rotation, and camera/microphone contention. Browser/native unit checks cannot verify those Android interactions.

The final two-browser review also verified live transfer progress and shared folder-sync metadata without copying Android document URIs. It exposed a cancelled progress timer left set during sign-in; resetting that handle fixed the first post-login update. A regression covers progress before/after sign-in. The isolated review uses a memory clipboard provider; an earlier fixture isolation error that replaced the PC clipboard was disclosed and corrected.
