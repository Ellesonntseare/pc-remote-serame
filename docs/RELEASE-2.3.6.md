# Elleson Connect Android 2.3.6

Fixed fingerprint and face sign-in setup failing after Android accepted a biometric scan. The app now waits for Android to authorize the Keystore operation before supplying its data. The same correction applies when unlocking a saved sign-in.

Update over 2.3.5, sign in with Remember me selected, and open Settings → Privacy & security → Fingerprint / face sign-in. Tap Enable and follow Android’s prompt. The indicator changes to On once setup finishes. If setup was previously unsuccessful, use Enable again after installing this version.

Android 8 or later. The standard and Phone Access APKs use the existing release signing certificate and package names.
