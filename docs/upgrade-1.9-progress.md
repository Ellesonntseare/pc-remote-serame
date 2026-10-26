# Personal app 1.9 work in progress

Requested: Android background uploads/downloads with notification Pause/Resume/Cancel; Android Share receiver; Phone/PC file manager, destination folders, favourites and thumbnails; integrated remote video with compatibility fallback; compressed audio; a Windows host installer/tray; lightweight appearance; and a full ease-of-use/accessibility review. Publish only the personal app. The commercial app remains deferred.

## Implemented, still being validated

- Android TransferService owns uploads/downloads outside the WebView, keeps durable upload recovery metadata, resumes downloads with ETag/If-Range, and provides notification controls. Cookies are not stored in queue metadata; notification resume retrieves the WebView cookie. Process death pauses jobs until a user resumes. DataSync foreground-service timeout pauses cleanly. Physical Android validation is outstanding.
- ACTION_SEND/ACTION_SEND_MULTIPLE land in a confirmation inbox. Content URIs remain native; shared text becomes a draft. Native picker starts background uploads. Download Save picker starts the same service.
- File manager adds immediate-child browsing and mkdir inside the existing transfer root. Phone browsing uses Android's system picker. Favourites/destination selection, breadcrumbs and bounded small-image thumbnails. Existing browser uploads and previews remain available.
- Main remote can consume WebRTC through its existing canvas, retaining controls and screen tools. Video is selected in the PC browser with explicit monitor consent. While video is active a metadata/control-only native session avoids duplicate JPEG encoding. Video failure falls back. Browser hardware/driver testing remains outstanding; acceleration is never assumed.
- Android MediaCodec Opus prefers 32 kbps mono / 96 kbps stereo; PCM fallback when encoder creation fails, plus explicit original-quality option. Windows Concentus 2.2.2 decoder supports bounded raw packets. Real codec round-trip and phone tests outstanding.
- HostTray compiles, includes Start/Stop for its own process, pairing information/password reveal, optional sign-in startup and a private-releases link for updates. Installer workflow bundles Node and self-contained .NET outputs. Installer build/install smoke testing outstanding. Existing config migration/import still needs review.
- Settings has Immersive/Lightweight appearance. Lightweight removes decoration animations, parallax and backdrop blur.
- Feature quick-access footer offers Home, Screen, Files, Keyboard and More. Must validate all page navigation/focus and guest permission behaviour.

## Current evidence

- Both .NET projects compile without warnings/errors.
- 22 targeted Node checks pass: new folder browsing/traversal, mkdir, ETag resumption, Opus protocol, and control-only screen stream.
- Initial full suite: 233/249. A legacy desktop layout moved the new search field; fixed by separating selectors. Follow-up UI suite 15/16; remaining failure was a native transfer sign-out message on an old app stub, fixed by capability gating. Rerun required.
- Development checkpoint 2518961 is pushed. Final corrections and release verification are in progress. No 1.9 release is published yet. Keep `start-at-login.bat` untouched and uncommitted.

## Website incident

On 26 October user reported Cloudflare 1033. Local and public /api/ping subsequently returned 200. Cloudflared service PID 14864 was Running/Auto, host PID 2044 listened on 7666. Connector token lives in protected ProgramData; do not print it. Added check-tunnel.ps1 and launcher health check; no elevated restart performed.

## Remaining before completion

1. Validate and repair Android service lifecycle/notification cancellation/resumption, compile APK in CI.
2. Complete browser UI/functional/accessibility review at phone and desktop widths; check all features remain reachable and correctly permission-gated.
3. Test real browser WebRTC remote video/fallback and Opus encode/decode/Windows playback. Do not claim physical-phone tests without an attached device.
4. Build/smoke-test Windows installer; preserve current private config.
5. Run full checks, inspect diff/security, update docs, commit/push; build signed personal APK 1.9 (versionCode 10); upload personal APK and installer after checks; deploy tested host.

## Additional verified corrections

- WebView audio permission defect identified: MODIFY_AUDIO_SETTINGS is now declared and verified by Android CI. HTTPS native microphone fallback and permission-denial tests pass. Native capture switching waits for release.
- Both first-checkpoint APK and Windows installer builds succeeded. A Windows UI mock lacked a MediaStreamTrack event method; compatibility guard fixed it. Opus test encoder API argument corrected.
- Integrated real-browser flow passes: H264, metadata-only native stream with no duplicate JPEG capture, PC input, fallback, folder destinations, native share/picker/queue actions, direct keyboard, Lightweight appearance. Encoder implementation was not reported.
- Real Windows Opus output passed mono and stereo with volume held at zero.
- User requested Air Mouse removal and reported a blue drag rectangle; Air Mouse removed from JS/Kotlin and priority mouse-up recovery added, with regression tests.
- Files layout further simplified: no duplicate direction menu, automatic destination selection, compact phone rows, header connection shortcut, bounded progressive rendering.
