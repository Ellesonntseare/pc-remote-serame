# Send audio from phone to PC

Open **Send audio** from the home controls, **PC audio → Send audio to PC**, or Mission Control's Audio Routing card. The full page has a source selector, input meter, PC volume, Mute and Stop.

Choose a source and tap **Start streaming**:

- **Microphone** sends your voice and nearby sound. Android asks for microphone access. The HTTPS website also supports browser microphone capture.
- **Phone audio** sends the output of supported music/video apps. This needs Android 10 or newer and personal APK 1.8. Android asks for sharing consent; no screen video is captured or transmitted. Android or the source app may block protected audio or end a sharing session.

The Windows host plays audio directly through its selected speakers/headphones, without needing a PC browser tab open. PC volume controls only this stream. Mute clears transmitted samples; Stop releases capture and PC playback. Audio is streamed in memory and is not saved to disk. Use headphones if you hear feedback.

Native Android capture can continue while you switch to another app. An ongoing **Microphone → PC** or **Phone audio → PC** notification provides Stop. Leaving the audio page keeps the native stream available; signing out, reloading/changing the connection, removing the app task or stopping the notification ends it. Browser capture follows that browser's background restrictions.

Both sources use the existing paired owner session. Anonymous users, unpaired Google accounts and guests cannot play audio on the PC. One input stream is active at a time; a second sender is told to stop the current stream first.

## Implementation and checks

The native sender captures PCM16 at 48 kHz: mono for microphone, stereo for playback. Twenty-millisecond blocks use the authenticated WebSocket. The native Windows helper uses shared WASAPI output. Queue limits and stale-buffer clearing prevent unlimited latency/memory growth. The browser uses an AudioWorklet with one outstanding block; local HTTP fallback uses the updated Android capture path or a bounded ScriptProcessor bridge.

Verification includes exact PCM/control framing, role/origin restrictions, malformed packet rejection, stream revocation, mute/backpressure and source-selection UI tests. Chromium streamed a simulated microphone through real WebAudio/AudioWorklet/WebSocket, verified silence after Mute and ended tracks after Stop. The real Windows output opened and consumed PCM/control packets at volume zero. Physical Android microphone and third-party app playback require on-device testing.

References: [Android audio playback capture](https://developer.android.com/media/platform/av-capture), [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [NAudio WASAPI output](https://github.com/naudio/NAudio/blob/release/2.x/NAudio.Wasapi/WasapiOut.cs).
