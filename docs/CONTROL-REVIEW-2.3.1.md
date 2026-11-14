# Control review — 2.3.1

## Corrected

- Opening the keyboard called `restoreControls()`, which exited full screen. Keyboard opening now preserves full screen.
- Full-screen CSS hid the existing mouse/keyboard action rail. The rail now remains available, with the panels hidden until selected.
- Desktop pointer completion automatically focused the hidden phone text editor. Fine-pointer sessions retain canvas focus for hardware typing.
- Hardware typing refused input while live typing was disabled or paused. A deliberate hardware key now starts a fresh context and preserves the previous draft without replaying it.
- The desktop key handler discarded standalone Windows, Caps Lock and Num Lock keys. Windows key release and Windows chords are distinguished; lock keys, context-menu and numpad mappings are supported.
- The current visual theme hid the original resize divider and replaced height sizing with a fixed surface. Its existing shelf handle now changes the trackpad height continuously and remembers it locally.
- Added Move and Dock actions to the existing mouse controls, with arrow-key movement and viewport bounds.
- Cancelled/lost pointer capture clears shelf dragging so a cancelled gesture cannot leave it stuck.
- Push builds now retain the verified APK and installer as downloadable workflow artifacts.

## Validation

An isolated real Chromium fixture exercises hardware typing from a paused context, Windows key/chords, Caps Lock, hidden-by-default full-screen panels, mouse/keyboard selection, continuous resizing, and movement/docking. Repository regression tests cover the corresponding event handlers and permission denial. GitHub CI is required for the complete repository and platform builds.

## Remaining checks and improvements

- Test the signed APK on a physical phone with the Windows host, including IME composition, rotation, Bluetooth keyboards and reconnection under packet loss. Browser fixtures cannot prove those device interactions.
- Operating systems reserve some keyboard combinations. A web page cannot promise that every local Windows/system shortcut reaches the remote machine; a native capture integration would be needed for broader coverage.
- Modifier-only holds, including Ctrl plus mouse gestures, need an explicitly ordered key-down/key-up design and disconnect release tests. The current desktop shortcut path sends bounded key combinations.
- Automatic phone field detection still requires a Windows accessibility focus result. Apps without a usable editable-field accessibility node may need the explicit Keyboard action. Remove that dependency only with a tested native text-input fallback.
- Measure capture, encode, network, decode and input latency separately before changing video quality defaults. The review does not establish that all reported sluggishness has one cause.
- Run the full suite and retain a physical-device smoke test checklist before making these controls the next published release.

No credentials or live host configuration are changed by this update. Installing the resulting Windows package is separate from building it.
