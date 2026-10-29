# Personal 2.1.1

Install the 2.1.1 APK over the existing personal app. It retains the same Android package and signing key. The Windows host also needs the updated web files and helper for single-window presentation.

## Type directly

Open Remote Screen and tap the PC text box itself. When Windows confirms an editable field, the phone keyboard opens and typing goes straight to the PC cursor. There is no required Choose PC field or Send draft step. If Windows takes longer to expose a field, the app checks again without clicking twice.

Previously unsent text stays available through **Insert saved draft**; new typing can start immediately. **Done** dismisses the phone keyboard. Manual Keyboard and advanced text tools remain available for applications that do not expose their fields to Windows accessibility APIs.

## Floating PC screen

Tap **Minimise** in the Remote Screen header. Android shows the PC view in a small picture-in-picture window over other apps. Use Android's expand control to return to full remote control and typing; the prior zoom and scroll are restored. The small window is a viewer, not an interactive mouse/keyboard surface.

Android 8 or newer and picture-in-picture support/permission are required. If Android declines it, the app restores the full screen and explains where to enable Picture-in-picture in Android's Elleson Connect settings. This feature is in the APK.

## Present Chrome or another window

From Remote Screen, open **Tools → Present**, then choose the app window. Documents appear under the application that has opened them, such as PowerPoint, Chrome or a PDF reader. **Present whole PC screen** keeps the original presentation option.

- **Smooth:** up to 1,280 pixels wide at 30 fps; prioritises motion.
- **Balanced:** up to 1,280 pixels wide at 24 fps; reduces bandwidth/work.
- **Sharper:** up to 1,920 pixels wide / 1,080 pixels high at 30 fps; retains more detail.

The host captures that window using Windows Graphics Capture, even when another window covers it. The stream keeps its output dimensions and fits the content after a resize. It uses the existing tested hardware H.264 encoder when available, with software encoding as a fallback. It does not switch to capturing the whole desktop if the selected window fails.

Other native screen streams in the same signed-in session stop when the window stream starts. Remote control closes before opening the presentation workspace, and app-settings/clipboard polling pauses while the presentation runs. Pause, leaving the page, backgrounding or signing out stop its capture and encoder. Windows still shares CPU/GPU resources with other applications; the app does not terminate other programs or change their scheduling priorities.

Keep the selected PC window open. Minimized windows may stop updating; closed windows must be selected again after reopening. Protected video can be blocked by Windows/the application. Window streaming requires HTTPS (or the PC's loopback address for testing) and a current browser/WebView with WebCodecs. The existing desktop compatibility stream remains available over local HTTP.

## Sync fixes

Phone edits made during uploads remain pending rather than being marked as already copied. Interrupted upload tickets survive temporary network/busy errors, and obsolete partial uploads are released before a replacement starts. Rapid PC changes coalesce into a final sync request. A phone file edited during a download is rechecked before replacement.

The document-provider and background scheduling behaviour still needs testing on the physical phone; no Android device was attached during development.

Implementation references: [Android picture-in-picture](https://developer.android.com/develop/ui/views/picture-in-picture), [Microsoft window capture](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow).
