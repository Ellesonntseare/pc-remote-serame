# Internet access at remote.teamtrader.co.za

The PC Remote application and Cloudflare Tunnel must run on the same Windows PC. The PC must stay awake, signed in and connected. This update adds the app password `serame`, remembered login, file transfer and text clipboard support.

## Update the Windows host

Close previous PC Remote hosts, including older copies in other folders. Extract the updated source, copy your existing `config.json` if needed, and run **start-cloudflare.bat**. It preserves other configuration values, sets `tunnelHostname` to `remote.teamtrader.co.za`, enables `allowLan`, builds the Windows agent and starts one host on port 7666 for both the tunnel and private local network.

The connector can keep its existing route when it already uses that origin port. A Cloudflare 502 response means the connector could not get a valid response from the origin; check that this host is running and that the route reaches the same PC and port.

## Tunnel route

| Setting | Value |
| --- | --- |
| Public hostname | remote.teamtrader.co.za |
| Service type | HTTP |
| Origin service | 127.0.0.1:7666 |
| HTTP Host Header | remote.teamtrader.co.za |
| Protect with Access | Your existing Access application |

The connector still uses loopback. Cloudflare provides HTTPS to the browser; the connector-to-app hop stays on the same PC. LAN requests are separately restricted to private source addresses and a matching local host address. Set `allowLan: false` and restart to bind only to loopback. Do not forward the origin port from your router.

Keep your existing Cloudflare Access policy on this hostname. The app does not independently verify Cloudflare Access JWTs. If creating a new route, protect all paths with a self-hosted Access application allowing your email and enable the connector's Protect with Access option for the matching application. Keep the connector token private.

## Sign in and verify

1. Open the HTTPS hostname and complete your existing Cloudflare sign-in if requested.
2. On the PC Remote screen, sign in with **serame**. Remember me keeps the app login for 30 days; Cloudflare can still ask for its own sign-in when its session expires.
3. Check Remote screen, mouse movement, Trackpad/Touch, keyboard and quality switching. A real phone/network check is needed for perceived lag.
4. In Files & text, send a small file, download it, and test Text in both directions using Notepad and the PC clipboard.
5. The former Install to phone footer has been removed. Update the Android APK separately when native features change.

Uploads use 1 MiB chunks, and screen/input traffic continues on the same HTTPS hostname. Files are saved in Downloads\PC Remote Transfers by default. Website layout changes require a reload; native Android changes require installing the updated APK. Camera capture needs HTTPS or localhost; local HTTP can receive camera streams but browser security prevents starting camera capture there.

The website still needs the host and connector running. The source ZIP does not add or replace Windows startup tasks or tunnel services. Both local access and the website can use the same running host; no configuration switch is required. Avoid running an older host on the same port.
