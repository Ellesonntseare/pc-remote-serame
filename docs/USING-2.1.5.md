# Elleson Connect 2.1.5 personal preview

## Direct PC typing

Open Remote Screen and tap a PC text field, either in the picture or using the trackpad. Windows checks the selected control and the APK asks Android to open your keyboard. There is no field-selection menu or visible app text-entry panel. The Keyboard button is still within reach for applications whose fields Windows cannot identify. Closing and reopening the keyboard in the same identified PC field keeps the IME text and selection.

Windows accessibility providers differ between applications. Automated tests cover field replies, trackpad clicks, stale replies, text continuity and keyboard dismissal. Actual Android keyboard display still needs a physical phone check.

## Shared clipboard and Elleson Keyboard

Sign in to the same Elleson Connect account on your devices. In Settings, open Shared clipboard & keyboard. Enable copy/paste and copied pictures as desired. Copy normally on Windows or your phone and paste in the destination application; there is no Send button for each copy.

For Android clipboard sync while using other apps, open Set up Elleson Keyboard, enable it in Android settings, then choose it as your keyboard. This is optional and is never changed automatically. Keeping another keyboard supports clipboard sync while Elleson Connect has focus. Android does not allow an ordinary background app to read other apps’ clipboard contents.

Serame works as a normal phone keyboard. Its PC toolbar offers an explicit PC typing mode, Ctrl/Alt, Tab/Esc, shortcuts and dictation. PC typing requires an active remote-screen session. Approve Microphone once in Keyboard settings to use dictation. Normal browsers do not reliably expose their current website to an IME; use the linked PC toolbar explicitly when typing outside the APK.

The connection does not persist login cookies in the keyboard. Reopen Elleson Connect and sign in if Android kills the process or the session ends. Sensitive clipboard items marked by Android are excluded from automatic capture. Image size limits apply.

## Windows sharing window

The Windows Send to my phone window uses Elleson Connect’s colours and icon, shows a removable file list, and lets you choose a device and add text or links. Files remain queued for receiving devices that are offline. The title bar, tray and installer use the existing Elleson Connect brand icon.

## Verification and remaining work

The full host/web suite passed 355 tests; an additional HTTP clipboard integration test passed afterwards. RemoteAgent and HostTray build without warnings. Native 4K frame encoding, patch recovery, audio compression and GPU availability checks passed. Android compilation, unit tests, package identity/version and the existing personal signing certificate were verified in CI. The native sharing window was rendered at three sizes without opening a real host session.

Physical Android IME opening, picture paste targets, background behaviour and OEM permissions remain device checks. The wider approved feature list remains in NEXT-IMPROVEMENTS-PLAN.md; this preview does not claim those unfinished features are complete.
