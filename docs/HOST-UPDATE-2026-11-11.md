# Host update — 11 November 2026

Second screen now supports direct dragging, two-finger scrolling, long-press right click, and safe release of held mouse buttons when touch or focus is interrupted. A PC-and-phone diagram shows placement on the left, right, above or below the PC and the edge used to move windows between screens.

The Second screen keyboard sends text and Enter, Backspace and Tab through the display session. Windows confirms delivery before the text is cleared; input is rejected when the foreground window is outside the extended display. The Windows desktop helper must be updated together with the host JavaScript and interface files.

The host hides unsupported phone-access controls when the standard Android edition reports its capabilities. Editions without native app installation receive instructions to open a signed APK through Android's package installer.

Validation: 39 focused checks across Second screen touch, placement, keyboard acknowledgements, display sessions, native features, guest sharing and Android update UI passed after replacing the obsolete update-message expectation. The Windows desktop helper published successfully for win-x64 with its runtime included. Physical phone gestures, a real extended display and banking-app acceptance still require device checks.

The existing host package version remains 2.3.2. Android 2.3.3 is a separate signed release build on `codex/android-phone-access-2.3.3`.
