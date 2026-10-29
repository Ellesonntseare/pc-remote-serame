# Google registration and login

Users choose **Create account → Sign up with Google**, select their Gmail/Google account, and approve Google sign-in. Elleson Connect creates a separate account with the verified email. Later they choose **Sign in with Google** and return to that same account. Google’s stable account ID identifies the account, so repeat sign-ins never create duplicate registrations.

Registration is available to new verified Google users. The old single-email sign-in restriction has been removed. Registration does not grant control of the PC hosting the website. A new account links a PC by entering that PC’s password once; later Google logins recognise the paired account. Changing the PC password removes other users' saved pairings; explicitly configured PC-owner emails retain direct access. Each self-hosted PC keeps its own account records.

The app/host operator configures the OAuth client once. Ordinary users select their own Google account; they do not enter OAuth credentials. The existing PC password login remains available for offline local connections.

## One-time setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), select or create a project, then configure Branding and an External Audience. This app requests only `openid email`, so Google's identity-only sign-in exception applies: each person does not need to be added as a test user. For a public launch, configure the audience for production and complete Google's applicable publishing requirements. See [Google's audience rules](https://support.google.com/cloud/answer/15549945).
2. Under **Clients → Create client**, choose **Web application**. Add this exact **Authorized redirect URI** for the personal app:

   `https://remote.teamtrader.co.za/api/auth/google/callback`

3. Copy the client ID and client secret. On your PC, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-google-signin.ps1`. Enter the PC owner's email and website. The script prompts for the secret without displaying it, then saves it in the ignored local `config.json`. Do not send the secret in chat or commit that file.
4. Restart the Windows host and keep your HTTPS tunnel running. Choose **Create account → Sign up with Google**. The PC owner's verified Google email in `googleSignIn.ownerEmails` can access this PC directly. Other Google users create their own account and complete PC pairing before accessing controls or files. Legacy `allowedEmails` is recognised as the initial PC-owner list, rather than a registration restriction.

The script supports an owner-controlled HTTPS domain. These settings configure this hosted instance. The separate commercial application's packaging and onboarding remain deferred.

## Android and local connections

Android opens Google in the phone's browser. Complete sign-in and return to Elleson Connect: a short-lived, single-use handoff signs in the requesting app without exposing Google tokens to the WebView. The PC's HTTPS website must be accessible even if the app is connected over local Wi-Fi. The password remains available for offline local use.

Google requires a real configured OAuth client. The button will explain that setup is needed until credentials are entered. Automated tests use a simulated Google provider; a real Google sign-in still needs to be verified after setup.

## Implementation

The server uses Google's `google-auth-library`, authorization code exchange with PKCE, a browser-bound state cookie, nonce validation, verified email, and issuer/audience/signature/expiry validation. Google credentials and Google access/ID tokens are never returned to the phone. Only the app's normal session cookie is issued. Google tokens are not persisted. Registration records are stored in the ignored `.google-accounts.json`, keyed by a hash of Google's subject ID. File writes are atomic and concurrent registrations are serialised.

The client ID and secret can also be supplied through `PCR_GOOGLE_CLIENT_ID` and `PCR_GOOGLE_CLIENT_SECRET`. Origin and PC-owner emails stay in `config.json`.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
