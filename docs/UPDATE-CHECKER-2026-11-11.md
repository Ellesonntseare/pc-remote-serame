# Update checker repair — 11 November 2026

The private 2.3.3 preview is published so the existing phone updater can discover it. Draft releases remain excluded. Manual checks bypass the metadata cache and time out with a retryable message.

Android editions without the app-install permission receive a checksum-pinned APK download through the existing Android Files transfer path. Open the saved APK in the phone's Files app to install it. The standard and Phone Access editions retain separate package downloads. Older editions with the original native updater continue using its verified download and installer flow.

Update downloads require the PC owner, verify published SHA-256 and size on the host, reject changed download names or checksums, and support byte ranges with ETags. An Android-only release does not report an unavailable Windows installer as a host update.

Validation: nine focused update service, HTTP and interface checks passed, including rejected anonymous access, download identity, resumed ranges, stale-checksum rejection, correct edition selection, cache refresh, timeout feedback and sign-out behavior.
