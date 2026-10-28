# Personal 2.1.3

- Fullscreen fits the complete PC image. The small Fit button at the top restores the whole desktop after zooming; closing the typing keyboard also restores Fit. Black space around the image preserves its aspect ratio. Rotate the phone for a larger landscape view.
- Swipe the shaded strip at the right of fullscreen to scroll the PC with one finger. Normal screen taps still click the PC, two fingers scroll/pinch, and the top close button restores the controls.
- Android Home floating view keeps the screen stream alive during PiP entry. An unsuccessful entry returns to normal background pausing after a short grace period. Leaving Files or another page does not float an unrelated PC screen. Android picture-in-picture permission and an APK with Home support (2.1.2 or later) are required.
- PC-to-phone downloads send their original names and extensions in both ordinary and Unicode filename headers. The 2.1.3 APK also reads Unicode names and the original URL name directly instead of depending on Android's generic filename guess. Install over the existing app; uninstalling is unnecessary. Already saved `.bin` files are unchanged; download them again with this update.
- Files → PC has Icons and Details views, familiar folder/file symbols, Windows' own shell icons/thumbnails when available, folders first and natural name sorting. Details shows modification dates, types and sizes on wider screens. The chosen view, folder and selection stay while changing views. Existing selection, rename, move, favourites and saved destinations remain available.
- Windows thumbnails are 128 px previews, loaded lazily. Shell work is limited to two simultaneous requests with a bounded cache. Unsupported or unavailable Windows previews fall back to file-type symbols.
- Settings → Appearance → Finger trail now uses a blended, shaded stroke with a soft fading tail. Reported contact size and pressure affect its width. The effect finishes drawing after the fade; Lightweight appearance pauses it.

These changes do not replace the actual PC desktop with a screenshot. Files remain interactive and reflect the PC folders permitted by the host.

Physical Android checks remain necessary for Home/PiP, document-provider filenames and keyboard behaviour on the user's phone.
