# Sign in with Google

PC Remote supports Google as an alternative sign-in method. It asks only for your Google identity and email, without Gmail inbox access. Your existing PC password continues to work.

## One-time setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), select or create a project, then configure Branding and Audience. While the project is in Testing, add your Google email as a test user.
2. Under **Clients → Create client**, choose **Web application**. Add this exact **Authorized redirect URI** for the personal app:

   `https://remote.teamtrader.co.za/api/auth/google/callback`

3. Copy the client ID and client secret. On your PC, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-google-signin.ps1`. Enter your approved email and website. The script prompts for the secret without displaying it, then saves it in the ignored local `config.json`. Do not send the secret in chat or commit that file.
4. Restart the Windows host and keep your HTTPS tunnel running. Choose **Sign in with Google** on the app login page. Only an email explicitly configured in `googleSignIn.allowedEmails` can control this PC. Removing an approved email and restarting also invalidates its remembered Google sessions.

The script supports any owner-controlled HTTPS domain. Commercial installations use each customer's own domain and OAuth client; they must never use the personal app's client or approved email.

## Android and local connections

Android opens Google in the phone's browser. Complete sign-in and return to PC Remote: a short-lived, single-use handoff signs in the requesting app without exposing Google tokens to the WebView. The PC's HTTPS website must be accessible even if the app is connected over local Wi-Fi. The password remains available for offline local use.

Google requires a real configured OAuth client. The button will explain that setup is needed until credentials are entered. Automated tests use a simulated Google provider; a real Google sign-in still needs to be verified after setup.

## Implementation

The server uses Google's `google-auth-library`, authorization code exchange with PKCE, a browser-bound state cookie, nonce validation, verified email allowlisting, and issuer/audience/signature/expiry validation. Google credentials and Google access/ID tokens are never returned to the phone. Only the app's normal session cookie is issued. Google tokens are not persisted.

The client ID and secret can also be supplied through `PCR_GOOGLE_CLIENT_ID` and `PCR_GOOGLE_CLIENT_SECRET`. Origin and approved emails stay in `config.json`.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
