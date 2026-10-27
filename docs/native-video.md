# Direct Windows video

Remote Screen and Watch PC can now start video from the Windows host without a browser sharing a monitor. The Windows helper captures the primary display using the existing DXGI capture path (with its standard fallback), scales into a bounded BGRA pipe and feeds a separate FFmpeg process. FFmpeg encodes low-latency H.264 using `libx264`, two worker threads, no B-frames and regular independently decodable keyframes. This version does not claim hardware encoding.

The authenticated, same-origin `/api/native-video` WebSocket carries bounded Annex B access units. Browser WebCodecs decodes them into the existing canvas. Slow viewers drop frames until the next keyframe instead of building a long playback queue. At most two native viewers are allowed. Closing the page/session, signing out or administrator revocation stops its capture and encoder. Backgrounding pauses viewing. Watch PC plays the existing authenticated PC-output audio alongside video; it is not a sample-locked audiovisual transport.

Remote Screen keeps its JPEG/control path for browsers without secure WebCodecs or when the native stream fails. Browser-based WebRTC sharing remains an alternative. Hardware capture and codec availability depend on Windows and the device's browser/WebView.

## Runtime and source notices

The production `ffmpeg-static` dependency pins version 5.3.0 and downloads its platform binary from upstream release b6.1.1. Windows packages include that dependency's README, GPL license and binary-specific license/README beside `ffmpeg.exe`. FFmpeg runs as a separate executable. The binary's build/source details and corresponding source are referenced in its bundled README and the upstream resources below; keep those files in redistributed host bundles.

- [ffmpeg-static source and binary build information](https://github.com/eugeneware/ffmpeg-static)
- [Pinned binary release](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1)
- [FFmpeg source](https://ffmpeg.org/download.html#get-sources)
- [H.264 WebCodecs Annex B registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)
