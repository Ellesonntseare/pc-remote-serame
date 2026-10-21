# Internet access at remote.teamtrader.co.za

The PC Remote application and Cloudflare Tunnel must run on the same Windows PC. The PC must stay awake, signed in and connected. This update adds the app password `serame`, remembered login, file transfer and text clipboard support.

## Update the Windows host

Close the previous PC Remote terminal. Extract the complete updated source into a fresh folder, copy your existing `config.json` if needed, and run **start-cloudflare.bat**. It preserves other configuration values, sets `tunnelHostname` to `remote.teamtrader.co.za`, builds the Windows agent and starts the app at `127.0.0.1:7666`.

The connector can keep its existing route when it already uses that origin port. A Cloudflare 502 response means the connector could not get a valid response from the origin; check that this host is running and that the route reaches the same PC and port.

## Tunnel route

| Setting | Value |
| --- | --- |
| Public hostname | remote.teamtrader.co.za |
| Service type | HTTP |
| Origin service | 127.0.0.1:7666 |
| HTTP Host Header | remote.teamtrader.co.za |
| Protect with Access | Your existing Access application |

Keep the origin bound to loopback. Cloudflare provides HTTPS to the browser; the connector-to-app hop stays on the same PC. Do not expose the origin port directly.

Keep your existing Cloudflare Access policy on this hostname. The app does not independently verify Cloudflare Access JWTs. If creating a new route, protect all paths with a self-hosted Access application allowing your email and enable the connector's Protect with Access option for the matching application. Keep the connector token private.

## Sign in and verify

1. Open the HTTPS hostname and complete your existing Cloudflare sign-in if requested.
2. On the PC Remote screen, sign in with **serame**. Remember me keeps the app login for 30 days; Cloudflare can still ask for its own sign-in when its session expires.
3. Check Remote screen, mouse movement, Trackpad/Touch, keyboard and quality switching. A real phone/network check is needed for perceived lag.
4. In Files & text, send a small file, download it, and test Text in both directions using Notepad and the PC clipboard.
5. Install to phone is now at the bottom of the home page.

Uploads use 1 MiB chunks, and screen/input traffic continues on the same HTTPS hostname. No extra exposed port or Android rebuild is needed. Files are saved in Downloads\PC Remote Transfers by default.

The website still needs the host and connector running. The source ZIP does not add or replace Windows startup tasks or tunnel services. Close the host terminal to stop access. Returning to LAN mode requires removing `tunnelHostname` from config.json and restarting with start.bat.
