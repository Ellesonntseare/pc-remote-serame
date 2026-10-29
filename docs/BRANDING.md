# Elleson Connect

Elleson Connect brings your PC, phone, keyboard, files, screens and clipboard together. The included keyboard is displayed as **Elleson Keyboard**.

The EC monogram uses connected strokes in teal, blue and pale mint on deep navy. SVG sources are editable; PNG and Windows ICO exports use the same geometry. Run `node tools/build-brand.cjs` with `sharp` available to regenerate the artwork.

## Assets

- `public/brand.svg`: app mark used by the website and sign-in screen.
- `public/branding/`: transparent marks, light/dark wordmarks, large icon and preview.
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`: web installation icons.
- `HostTray/Assets/remote.ico`: Windows application, tray and installer icon.
- `android/src/main/res/drawable/ic_remote.xml`: Android notification and widget artwork.
- `android/src/main/res/mipmap-anydpi-v26/`: Android adaptive launcher icons.

## Upgrade compatibility

Version 2.2.0 keeps the original Android application ID, signing certificate, keyboard service classes, Windows installer AppId, single-instance mutex, startup registry value, cookie names, storage keys, network discovery protocol, OAuth callback URL and account history. Existing paired devices and saved data continue to use their established identities.

The current website address and GitHub repository URL stay valid. Historical release filenames and the existing `PC Remote Transfers` data directory are retained so older downloads and saved paths continue to work. New releases and generated screenshots/recordings use the Elleson Connect name.
