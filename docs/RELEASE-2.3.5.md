# Elleson Connect Android 2.3.5

Optional fingerprint / supported face unlock protects a saved sign-in when opening or returning to the app. After signing in as the PC owner, open Settings → Privacy & security → Fingerprint / face sign-in and enable it. Use Remember me during ordinary sign-in for a session that survives PC host restarts. The phone connection screen adds a biometric quick-connect button after setup.

The dark/orange fingerprint screen follows the supplied design. Tap the fingerprint button, then authenticate in Android's own prompt. A successful, per-use Android Keystore AES-GCM operation is required before revealing the protected app. Android manages biometric templates. Changing enrolled biometrics invalidates the key and requires password sign-in and setup again. Password/PIN fallback removes the remembered WebView session before showing ordinary sign-in. Background file transfers continue in their existing native service.

Protected sessions do not automatically turn into a visible PC mini-window when leaving the app. Returning from Android's file picker keeps an active foreground workflow usable; ordinary backgrounding locks the app.

This is a local app lock for an existing host session. It does not replace server authentication, renew an expired session, add TOTP codes, encrypt every WebView cookie, or establish bank security clearance. Only Android Class 3 biometric hardware is accepted; phones with weaker face unlock can use a strong fingerprint or ordinary password sign-in.

Includes 2.3.4's system-bar, cutout and keyboard inset fix. Standard and optional Phone Access editions keep their existing separate identities and signing certificate. The standard edition adds Android biometric permission and its compatibility fingerprint permission, without accessibility, microphone, camera or package-install permissions. Android 8 or newer remains required.

The paired Windows host supplies the redesigned Second screen, Settings, Login and Audio screens. Files retains its existing interface, Go to folder and fast transfer engine. Physical device biometric enrollment, cancellation, lockout, resume and install-over testing are still required; unit tests and signed builds do not prove sensor behavior.

Implementation follows Android's [biometric authentication guidance](https://developer.android.com/identity/sign-in/biometric-auth) and the stable [AndroidX Biometric library](https://developer.android.com/jetpack/androidx/releases/biometric).
