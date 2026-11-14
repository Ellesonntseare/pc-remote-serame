# Elleson Connect Android 2.3.3

The standard edition keeps the original package and signing identity for upgrades from 2.3.2. It retains PC remote control, file transfers, folder sync and Second screen with the normal Android keyboard. Phone control via accessibility, the custom input method, phone screen capture, camera and microphone capture are excluded from this edition's manifest and implementation sources.

These optional features are built separately as **Elleson Connect Phone Access**, package `za.co.pcremote.controller.phoneaccess`. Install it only if those phone-access features are needed. It has separate settings and pairing. Installing it can still trigger banking-app restrictions. Neither edition is certified or approved by Standard Bank.

Both editions use release builds with debugging disabled. Neither requests permission to install packages; updates are installed externally using Android's package installer. The main app keeps its layout; phone-only controls are unavailable when the standard edition reports its capabilities. Older host versions may still show those controls, but the native app rejects their commands.

Build with Java 17, Gradle 8.10.2, Android platform/build-tools 35, and the existing signing environment:

```
gradle :android:testStandardReleaseUnitTest :android:testPhoneAccessReleaseUnitTest :android:assembleStandardRelease :android:assemblePhoneAccessRelease
```

The signing store/password must remain outside source control. Verify the package, version, permissions, component list, debuggable flag and certificate in the built APKs. The expected signing certificate SHA-256 is `1803b0080ad05d54df52de3a61fa4a9978244ca51e9df842d0303d42636c11eb`.

Local Wi-Fi connections still use HTTP with an explicit private-IP allowlist; internet connections are restricted to the configured HTTPS service. This release does not claim end-to-end encryption for LAN transport or a complete independent security assessment.

Standard Bank's detection reason and acceptance of this revision require their review and a real-device check. Do not label the warning a confirmed false positive or describe these changes as bank clearance.
