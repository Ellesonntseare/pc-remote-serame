# Personal app 2.1.2 keyboard and controls — 28 October 2026

- [x] Closing/reopening the keyboard retains the phone's text, acknowledged baseline and selection. Returning to the same Windows field checks its stable identity and resumes without clicking again or replaying old text; another field starts a fresh context.
- [x] Minimise moved into Tools. Android 12+ Home/gesture navigation uses automatic picture-in-picture for an active remote screen; Android 8–11 uses the Home callback. Other pages and unsupported/disabled PiP use normal background behaviour. External pickers temporarily disable automatic PiP.
- [x] Android remote full screen keeps the interactive WebView visible and uses native immersive bars, with direct touch mode. Media custom views also keep the renderer visible. Back/closing Remote Screen restores the system bars.
- [x] Removed the visible Trackpad header, inner pad/scroll labels and latency readout/polling. Kept the scroll line/arrows and accessibility descriptions. Enter is deep blue and Backspace red.
- [x] 33 focused typing, floating-window and input-transport checks passed; the served full-screen touch/label/colour check passed. The Windows helper compiles with stable field identity/bounds and does not read PC text values.
- [ ] Complete final CI, publish the signed 2.1.2 APK/installer and update the running personal host.
- [ ] Physical Android Home gesture, IME and immersive-view checks still need the phone.

---

# Personal app 2.1.1 reliability update — 28 October 2026

- [x] Preserve the original upload snapshot in sync checkpoints so edits made while sending remain pending. Recheck phone files before replacing them with downloads.
- [x] Recover interrupted upload tickets without replacing them on network/busy errors; release obsolete partials before creating another upload. Refresh the PC listing after recovery can finish an upload.
- [x] Coalesce rapid PC changes with a trailing sync request. Sign-out and page exit cancel pending timers; returning from the background resumes pending work.
- [x] Synchronize Android folder-provider observer bookkeeping across background workers and UI callbacks.
- [x] A confirmed PC text-field tap starts live typing immediately, including after compose/paused mode. Previous unsent drafts stay available through an optional Insert saved draft action. Delayed Windows focus checks retry without repeating the click.
- [x] Native keyboard opening waits for the focused WebView editor and retries once; closing typing cancels delayed opening. Windows field detection also checks the native caret when an accessibility provider is slow.
- [x] Android Remote Screen has a Minimise button for a floating picture-in-picture view. Expanding restores the prior zoom and scroll. Android controls the floating window; expand it to type or control the PC.
- [x] Single-window presentation: choose Chrome, PowerPoint or another app in Tools → Present, with Smooth/Balanced/Sharper presets. Windows Graphics Capture keeps the chosen window visible when covered and fits content after resizing. The real end-to-end browser stream decoded 30 fps using Intel Quick Sync; no desktop fallback occurs for a failed window selection.
- [x] Presentation pauses other native screen streams in the same session and routine app-settings/clipboard polling. Capture/encoder stop on Pause, page exit, backgrounding and sign-out. Other Windows applications retain their normal resources/priorities.
- [x] Responsive browser review passed at 320, 390, 844 and 1280 pixels wide; the simulated 256 × 144 floating view fit correctly and restored the full layout. A live Windows check confirmed Chrome field/button detection. Physical Android IME/PiP testing still needs the phone.
- [x] First host/browser suite: 302 tests passed; first signed Android build and Windows installer passed. The subsequent typing/floating-window pass passed all 13 focused checks.
- [x] Final checks passed: 311 Windows tests, 296 portable checks, native compilation, Android unit/signing checks and installer/runtime verification. All 30 focused typing, floating-view, presentation and native-helper checks also passed.
- [x] Published the signed personal APK and matching installer in [the 2.1.1 preview release](https://github.com/Ellesonntseare/pc-remote-serame/releases/tag/v2.1.1-preview), with SHA256SUMS. Functional source 54b9247 is on main; APK native source matches its verified build at 9991d52.
- [x] Updated the running Windows helper, capture runtime and Node host. Local and public HTTPS health/feature-asset checks passed. The verified APK is also in PC Transfers and the project folder; the installer is available from the release.
- [ ] Physical Android provider and background scheduling checks still need a connected phone.

See [2.1.1 usage and platform requirements](docs/USING-2.1.1.md).

---

# Personal app 2.1 — 27 October 2026

- [x] Local PC discovery in Android and Connection settings; discovery advertises IPv4 addresses matching the host listener. A live DNS-SD probe resolved the actual PC address.
- [x] Hardware H.264 selection, real encoder probes and software fallback. Real Chromium decoded Intel Quick Sync desktop frames and exercised Remote Screen and Watch PC.
- [x] Files workspace: Desktop/Documents/Downloads and host-selected local/network folders, favourites, remembered destination, selection, rename/move, sorting and recursive search. Browser checks verified folder/selection/scroll continuity and file operations at four sizes.
- [x] Application-specific shortcuts, Android widget/launcher shortcuts, improved typing positioning and preserved remote view.
- [x] Shared-device hub for supported app settings, foreground Android clipboard and targeted file/link/text delivery. Unchanged polls omit bulk payloads; collected deliveries release inbox capacity.
- [x] Incremental Android folder pairs with two-way/backup modes, conflict copies, resumable uploads, provider change notifications and WorkManager background checks. Devices without the app participate through services they expose, including Windows-accessible shared folders.
- [x] Windows Send To shortcut installed for the running personal host; tray sending window and local/network folder controls built and deployed.
- [x] Optional Windows virtual microphone route added. This PC currently has no VB-CABLE device; install that driver once and select CABLE Output in the Windows application to activate it.
- [x] 299 automated tests passed in Windows CI; portable checks, native compilation, Android signing/version checks and the Windows installer/runtime checks passed. Real browser checks covered settings sync across two sessions, file changes, page continuity and five remote-control layouts.
- [x] Personal 2.1 APK and Windows installer published in [the 2.1 preview release](https://github.com/Ellesonntseare/pc-remote-serame/releases/tag/v2.1.0-preview), with checksums. Functional source is on main at 4aea539. The running host and Windows helper were updated; local and public health checks passed. The verified APK is also in PC Transfers.
- [ ] Physical Android document-provider, background scheduling, microphone and LAN multicast tests remain necessary; no Android device is attached. See [shared-device setup](docs/SHARED-DEVICES.md) for supported scope and one-time folder/driver setup.

---

# Personal app 2.0 — 27 October 2026

- [x] One shared Home / Screen / Files / Audio / Settings bar, reused across feature pages. Remote Screen retains its five essential keys. Home / Dashboard remains a direct switch.
- [x] One Audio page reuses the existing PC output, microphone and phone playback controls, with source switching, level indicators and mute/stop controls.
- [x] Direct Windows capture and low-latency H.264 now serve Remote Screen and Watch PC without a PC browser publishing a screen. JPEG and browser WebRTC alternatives remain. The bundled encoder uses two CPU threads; this version does not claim hardware encoding.
- [x] Watch PC uses the existing authenticated PC-output audio. Pause/resume, close and backgrounding stop or resume the appropriate capture resources.
- [x] Completed browser uploads offer Show in PC folder. Android 2.0 adds Open / Share for completed downloads in its queue and notification, plus the PC folder action after uploads and Retry for interrupted tasks. Older APKs retain their existing controls.
- [x] Administrator device management: active sessions, online count at the top, sign-in history, selected-device sign-out and all-device sign-out. Online counts use a 45-second activity window; a browser and app can represent separate sessions on one phone. Historical device activity before logging began cannot be reconstructed.
- [x] The configured verified Google owner is the main administrator. The private owner password was updated as requested, old default password access is disabled, and guest access retains approval. Password sessions bind to the current credential context so removed credentials do not survive in remembered sessions. Private passwords and history are excluded from the repository and installers.
- [x] 287 automated tests passed. Live Chromium decoded Windows video, played/paused/resumed Watch PC, opened direct Remote Screen video and verified administrator revocation stops access during streaming. Four new responsive UI checks and native audio/download bridge interactions passed; earlier five-width remote-key checks also passed.
- [x] Updated host and Windows helper deployed; local and public HTTPS clients verified. The removed passwords were rejected and the configured password/administrator session controls were verified; the verification session was signed out.
- [x] Personal Android 2.0 APK and Windows 2.0 installer published in [the personal 2.0 preview release](https://github.com/Ellesonntseare/pc-remote-serame/releases/tag/v2.0.0-preview), with verified checksums and the existing Android signing certificate. Windows and portable Linux checks passed. Direct release uploads avoided the delayed Actions artifact quota.
- [x] Buffered the deliberately stale guest-poll test response and allowed its full UI extension action to settle on slower Windows runners; all 287 checks passed in Windows CI with the original state assertions retained.
- [x] Cloudflared service restarted with Windows administrator approval after it was found stopped. Its startup remains Automatic and the public website responds successfully. The correct service/executable spelling is cloudflared.
- [x] The verified APK is also available in the PC transfer folder for phone download. Local APK and installer copies are saved in the project folder and excluded from Git.
- [ ] Physical Android microphone, document-provider Open / Share and device-specific video decoder testing remain necessary; no phone is attached.

---

# Transfer convenience and build storage — 27 October 2026

- [x] Browser Pause keeps every remaining file in the batch. Resume batch continues without selecting the files again; Cancel preserves completed files.
- [x] Each batch keeps its original PC destination when another folder is browsed. Switching feature pages continues the transfer; closing/reloading the browser warns while its file selections are still needed, where the browser supports that warning.
- [x] Files shortcuts on Home, the remote controls and navigation show the remaining count and current-file progress, including the Android queue. Paused transfers use an amber indicator and a single Resume batch action.
- [x] Sign-out clears paused selections and progress indicators. Active or paused browser batches prevent connection switching until completed or cancelled.
- [x] Validation: 281 automated tests passed; final targeted checks passed; a real Chromium transfer resumed three files (14,680,086 bytes), verified their contents and original destination, and cleared the indicator on completion. Five browser layouts (320–1280 px) retain accessible remote controls without horizontal overflow.
- [x] Updated host deployed. Local and public HTTPS health checks and the served client bundle include the new transfer flow.
- [x] Deleted the 21 specifically approved older Actions artifacts (865.3 MiB), retaining the latest three artifacts and all published APK/installer release assets.
- [x] Automatic Windows builds retain the installer for seven days; the duplicate unpacked bundle is limited to manual debugging builds with one-day retention. Android artifacts retain for fourteen days. Web-only changes run host checks without rebuilding the unchanged Android wrapper; portable checks run in the main checks workflow.
- [ ] GitHub artifact uploads are still awaiting its storage-quota refresh after cleanup; build compilation succeeded before the quota rejection. Published personal release downloads remain available.
- [ ] Physical Android testing remains necessary; no phone is attached to this workspace.

---

# All-area refinement pass — 27 October 2026

- [x] Remote taps use the pointer channel immediately; superseded field checks cannot open the keyboard or block another tap. Windows focus queries run outside the input loop.
- [x] Ctrl+K stays on the controlled PC while the remote screen is active.
- [x] Files shares duplicate folder requests, cancels stale/background listings, restores valid destinations after errors, and supports Enter/Escape when creating folders.
- [x] Transfer progress refreshes the file list once per newly completed transfer rather than on every later queue update.
- [x] Selecting the current Files shortcut preserves the open page. Search shows available controls and includes Send audio; Send audio also supports the home Settings reorder/hide/add controls.
- [x] Settings highlights the current section. Home offers Retry when the host is offline.
- [x] Status requests have an eight-second bound and cancel on background/page changes. Guest clocks pause in the background. HTTP keep-alive exceeds the five-second poll interval; shutdown closes idle and finishing connections.
- [x] 276 tests passed locally, plus Windows native compilation, five browser layouts and integrated WebRTC/tap/hold/file-transfer bridge checks. A real HTTP connection was reused after 6.1 seconds of idle time.
- [x] Updated source and Windows helper deployed; local and public HTTPS clients verified. Existing Android 1.9 loads these web changes without reinstalling.
- [ ] Physical Android testing remains necessary for keyboard appearance, microphone behaviour and device-specific battery measurements.

---

# Latest update — 27 October 2026

- [x] Home: primary Remote Screen, Files and Audio actions; PC wallpaper/hotspots removed; remaining tiles open directly and fill each row.
- [x] Remote: Keyboard, Enter, Backspace, Files and Fullscreen in one stable row; advanced actions collected on one compact tools page.
- [x] Direct touch: screen taps target the displayed PC position, including phones with the old saved Trackpad setting.
- [x] Tap to type: Windows reports whether the tapped control is editable; recognised fields open the phone editor automatically. Keyboard remains a direct fallback for unsupported application fields/browser keyboard restrictions.
- [x] Typing feedback: active, paused and waiting states; uncertain drafts require deliberate sending after switching fields.
- [x] Hold to repeat: Backspace, navigation keys, volume, zoom, and scroll-rail arrows. Release, cancellation, page changes and app backgrounding stop repetition.
- [x] Settings: Connection, Controls, Appearance and Privacy on one page, sharing the actual controls rather than duplicate copies.
- [x] Privacy mode: physical Windows desktop covers excluded from capture, owner-only activation and a capture/input check before reporting success. Restore with Privacy off or Ctrl + Alt + Shift + P on the PC. Disconnect lease, sign-out and host shutdown restore displays. Windows security screens are outside the software cover.
- [x] Validation: 269 Node tests; Windows native build; real Chromium tap/hold flow with a simulated desktop agent; five responsive layouts (320–1280 px); real Windows privacy-cover/capture/pass-through/restore probe.
- [ ] Verify tap-to-type and the native phone keyboard on the user's physical Android phone; no phone is attached to this workspace.

---

# Current implementation progress

- [x] Phone keyboard dismissal and draft preservation
- [x] Entire Android display sharing and late viewer frame delivery
- [x] Android phone control code, local approval and Stop control
- [x] Phone control relay and interface checks
- [x] Android 1.3 phone control build
- [x] Android 1.4 build and final APK delivery
- [ ] Real phone control verification

## Requested feature queue

- [x] Wake-on-LAN implementation and packet checks
- [x] Voice chat implementation and signaling checks
- [x] Screen text recognition, Windows build and synthetic OCR check
- [x] Guest session timers and duration validation
- [x] Shared whiteboard implementation and session isolation checks
- [x] Image clipboard implementation and interface checks
- [x] Device handoff implementation and two-device interface check

Source changes go directly into this project folder. No source ZIP is prepared.

## Latest interface and session updates

- [x] Select all guest permissions, including partial selection
- [x] Owner session extension, countdown sync and two-minute warning
- [x] Guest account ribbon and remote-screen badge
- [x] Hold-to-control for PC and approved phone input
- [x] Swiping dock, Left/Right buttons and top options menu
- [x] Dark metallic reference dashboard and live status rings
- [x] Animated login orbs, restrained interface motion and reduced-motion support
- [x] Media controls through the Windows audio endpoint and native media keys
- [x] Actual Windows 1% volume step and mute check; original sound settings restored

## Mobile-data performance

- [x] Reviewed desktop capture and browser backpressure documentation
- [x] Measured a generated 4K desktop against phone idle/motion profiles
- [x] Auto encoding size follows the phone display; native pointer mapping and manual HD retained
- [x] Initial capture size is bounded before the first frame
- [x] Small unsent-pointer budget with ordered commands and independent typing limit
- [x] Control glow animation uses transforms; hidden login motion stays paused
- [x] Host restart confirmed; public site and updated assets verified live on 22 October 2026
- [ ] Real Android control and mobile-data responsiveness verification
