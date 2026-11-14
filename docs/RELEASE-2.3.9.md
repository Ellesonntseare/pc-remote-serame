# Elleson Connect Android 2.3.9 Personal Preview

The fingerprint or supported face prompt opens automatically when the protected sign-in screen appears and when returning to the locked app. A fresh launch opens the saved PC sign-in automatically when biometric sign-in is enabled. Scanning no longer requires tapping the fingerprint icon first.

The fingerprint icon remains a retry action after cancellation. Cancelling does not repeatedly reopen the prompt during the same foreground visit, and password/PIN fallback remains available. Duplicate lifecycle callbacks cannot start overlapping automatic prompts; stale authentication errors cannot change a newer attempt. Unlocking still requires Android biometric authentication and the authenticated Keystore operation.

Both Android editions retain their package identities and release signing certificate. Install over the current app to keep the saved biometric setup and settings. The Windows host remains 2.3.8; this fix is in the Android app and needs the 2.3.9 APK.

Validation includes automatic-prompt lifecycle policy checks, existing biometric authorization checks, both Android editions' unit tests, and signed release builds. Actual sensor behavior on a physical phone still requires a device check.
