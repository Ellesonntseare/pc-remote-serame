# Next personal update: approved work

Active work remains PC Remote. Do not work on Crownfall or the commercial app.

The user approved all five proposed improvements, then added the desktop Send window/icon and a universal clipboard. Complete these after publishing the current 2.1.4 Files/account-history update. Keep private configuration and the user's untracked start-at-login.bat intact.

## Required work

- [ ] Automatic transfer recovery on network return, with retry/backoff and a per-device setting. A deliberate Pause must remain paused. Preserve existing resumable upload/download state and notification controls.
- [ ] Functional Copy/Cut/Paste, Undo and Recycle Bin operations in Explorer. Preserve bytes, reject collisions/changed sources, retain recovery information and use real reversible deletion. Verify native Windows semantics before implementing.
- [ ] Smoother streaming quality changes: keep the working view and input connection, retain the last frame until the next stream is ready, and avoid a visible reconnect. Test engine/fallback transitions and quick repeated quality changes.
- [ ] Account history export and automatic local backups. Stream large exports; make consistent database snapshots away from the UI thread. Owner controls backup settings; export only the requesting account's data. Keep backups and exports out of Git/installers.
- [ ] Presentation annotations: drawing/laser/clear controls in the presentation workspace. Decide practical PC display integration without interrupting window presentation; preserve normal control when ink is off. Stop overlays on disconnect/close.
- [ ] Redesign HostTray/SendToPhone.cs against the user's screenshot complaint. Keep the app's established dark/cyan styling, a clear device chooser, visible file list with removal, an obvious drop area, text/link area and useful progress/result state. Add the real PC Remote icon to the title bar, executable, tray and installer as appropriate; reuse existing brand artwork.
- [ ] A shared system clipboard for normal Copy → Paste across connected devices, including text and pictures. The user explicitly rejects a Send button or extra per-copy steps. Wire Windows clipboard observation into the actual sync transport, add typed image transport/URI support, revision/hash echo protection, account scope, clear connection state and normal system paste targets. Preserve manual file sharing as an independent feature.

## Clipboard platform decision

Android 10+ permits clipboard reading only by the focused app or default IME: https://developer.android.com/about/versions/10/privacy/changes#clipboard-data . This is an OS rule, not another runtime permission that a foreground service removes.

An asynchronous question is pending: add an optional PC Remote keyboard mode for background clipboard access, or keep the current keyboard and sync when PC Remote is open. Do not assume an unanswered question is approval to change the user's default keyboard. Continue Windows/foreground/image sync and the other work while waiting. The desired interaction is ordinary Copy/Paste after one-time setup.

Use official documentation for current Android foreground-service/clipboard and Windows IFileOperation details. Microsoft flags: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags . Avoid irreversible deletion fallbacks; FOFX_RECYCLEONDELETE requests recycling and FOF_WANTNUKEWARNING applies when permanent deletion would occur.

## Testing rules and a corrected mistake

Use in-memory clipboard providers in every integration/browser fixture. An earlier Explorer browser test accidentally used the real native clipboard and replaced it with fixture text; the user was told. The fixture is now isolated. Never print or change the user's clipboard during QA. Native observation readiness may be tested read-only, printing only state/kind, not contents.

No physical Android device is attached. Distinguish CI/native/browser checks from real Android IME, permission, background and Home/PiP testing.

## Serame Keyboard approval

The user identified Serame Keyboard, said it is not currently active but they can switch to it, and approved all six integration ideas: automatic shared clipboard, a synced/pinned clipboard strip, PC typing mode, Ctrl/Alt/Tab/Esc and shortcuts, voice dictation into the PC, and connection/transfer status above the keys. Target repository is Ellesonntseare/my-keyboard (README identifies Serame Keyboard). Do not use the separate Mathapelo keyboard or its private defaults. Embedding the Serame IME in PC Remote is a practical single-app approach; preserve normal phone typing and make PC mode explicit. No default keyboard has been changed on the phone.

## Additional approved functions

From the later ten-item list the user selected 1, 4, 5, 6, 9 and 10: browse allowed phone folders from the PC; Find my phone; per-app PC audio controls; document scanning to multipage PDF; custom gamepad-style controls; and file conflict comparison. Other ideas from that list were not approved.

The user then explicitly selected side-chat 4, 5 and 9 and pasted the source list: connection troubleshooting (host/LAN/Cloudflare/permissions with actionable results), one search across connected devices/indexed files/shared content/history, and a duplicate-file finder comparing selected phone/PC folders. These are additional requirements, not replacements for the earlier list. Keep them in existing Devices/Files/Search surfaces. Duplicate removal must remain an explicit user choice.

## Current integration checkpoint (28 October 2026)

- Windows typed clipboard observation/application and account-scoped text/PNG snapshots are implemented; 11 transport/storage/reconnection tests passed.
- Serame IME is embedded with normal phone typing, explicit PC mode, shortcuts and dictation. Android compilation and physical-device testing are still pending. Clipboard credentials remain in memory; reopen/sign in after Android kills the process. No default keyboard is changed automatically.
- The requested direct-typing change removes the visible app editor and field-selection menu. Trackpad clicks now probe the selected PC field; Android retries IME opening after WebView focus catches up. Host/browser tests pass; physical IME display remains unverified.
- Adaptive IME controls are available in PC Remote and through an explicit linked-PC toolbar elsewhere. A normal browser does not reliably expose its current website to an IME, so do not claim automatic website detection.
- The complete host/web suite passed 355 tests with zero failures after fixing the new companion asset route. RemoteAgent and HostTray compile without warnings.
- The Windows Send window now has the app colour scheme, a file list/removal, recipient chooser and text area. Its real PC Remote icon is embedded in the executable/tray/installer. Visual validation and the Android build are next.
- Remaining required work above is still open; no new APK or installer has been published for this checkpoint.
