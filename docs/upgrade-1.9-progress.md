# Personal app 1.9 checklist

Application code: e63df56. Personal APK and Windows installer built from that revision. Commercial packaging remains deferred.

- [x] Background Android transfers and notification controls.
- [x] Android Share receiver and explicit send confirmation.
- [x] Phone/PC file manager, subfolders, previews, favourites and destinations.
- [x] Integrated remote video, capture-demand reduction and JPEG fallback.
- [x] Opus phone-to-PC audio with PCM fallback.
- [x] Personal Windows installer and host tray.
- [x] Lightweight appearance and navigation cleanup.
- [x] APK microphone permission/fallback repair.
- [x] Air Mouse removal.
- [x] Interrupted drag/mouse-button release repair.
- [x] 258 Windows Node checks and required .NET builds.
- [x] Android unit/build/signature checks with the persistent personal certificate.
- [x] Codec encode/decode, real Windows output and integrated browser-flow checks.
- [x] Phone/desktop layout checks at 320–1680 px, camera/audio and recording.
- [x] Packaged-host runtime/dependency/asset/sign-in/file-browser checks.
- [x] Live local and HTTPS host return 200 with version 1.9.0.
- [ ] Physical phone validation: microphone, playback capture, Android notification actions and source-provider persistence. These require the installed updated APK on the user's phone.

See [the feature guide](version-1.9.md) and [personal downloads](https://github.com/Ellesonntseare/pc-remote-serame/releases/tag/v1.9.0-preview).

The user's unrelated start-at-login.bat remains untouched and uncommitted. The Cloudflared service is separate from the app host; its live connection was restored and the launcher now checks it.
