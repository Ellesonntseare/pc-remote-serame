# Personal preview signing

Version 1.7 uses a persistent personal preview key. CI loads the encrypted PKCS#12 store from repository secrets and verifies the signing certificate fingerprint before uploading the APK. A cache is not a durable signing-key backup.

The local backup is in the ignored `.signing/` directory, restricted to the current Windows user. Preserve `personal-preview.p12` and its password file in a secure backup. Never commit either file. GitHub secrets are `ANDROID_SIGNING_KEYSTORE` and `ANDROID_SIGNING_PASSWORD`. The key alias is `pcremote-personal-preview`.

Public certificate SHA-256: `1803b0080ad05d54df52de3a61fa4a9978244ca51e9df842d0303d42636c11eb`.

Older previews used automatically generated CI debug keys; the attempted keystore cache did not save the key from its actual runtime location. The old private signing keys are unavailable after those ephemeral runners were removed. Android therefore requires a one-time uninstall of that older preview before installing the signed 1.7 update. Uninstalling clears app settings and remembered connections. Save any drafts first. Subsequent APKs signed with this key can update 1.7 normally.

The commercial app will use a separate application identity and its own signing key. No commercial APK is included in this personal release.

Reference: [Android app signing](https://developer.android.com/studio/publish/app-signing).
