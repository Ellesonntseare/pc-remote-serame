# Elleson Connect 2.1.8 — PC mouse controls your Android phone

Install this APK over your existing personal app. Elleson Keyboard remains included.

## Start controlling your phone

1. Sign in on the phone and PC. Your main owner account works on both; a guest login is optional.
2. On the phone, tap **Use PC mouse** on Home. Approve Android's screen-sharing prompt for the entire screen.
3. On the PC, open **Phone control** and choose the phone if several devices are sharing.
4. Click **Request phone control**. Approve on the phone. The first time, enable **Elleson Connect phone control** in Android Accessibility settings, return to Elleson Connect, then approve.
5. Click or drag the phone preview, right-click to long-press, and use the mouse wheel to scroll. Back, Home and Recent apps remain beside the controls.
6. Click **Use PC mouse** on the PC for captured mouse movement. The pointer appears on the phone even while you use other Android apps. Press **Escape** to return the mouse to the PC, or click **Release mouse**.

The PC's Phone control page must stay open and in the foreground for captured mouse mode. Direct clicking and scrolling over the preview also work without pointer capture. A browser that declines capture can use this direct mode.

This release shares the mouse through the Elleson Connect page. Moving the pointer beyond the edge of the Windows desktop to switch devices automatically remains a separate enhancement. The phone continues running Android apps; this is not an extra Windows monitor.

## Stop or pause

- Escape releases mouse capture. You may capture it again within the same approved session.
- Closing the PC control page, leaving the browser, disconnecting, or revoking control releases the mouse.
- On the phone, use **Stop control** or **Stop sharing** in the ongoing Android notification.
- Control requires approval for each session, expires after ten minutes, and cannot operate the locked phone. Password fields are excluded from Set text. Some protected apps and system screens restrict capture or simulated input.
- Rotating the phone releases capture until its new screen is displayed. Restart mouse capture after the new frame arrives.

## Implementation and verification

- Owner and guest screen publishers are distinct from owner viewers. Only the PC granted control can send inputs, with increasing sequence numbers and the current screen generation.
- Cursor positions use the same consent and display-generation checks as gestures, but do not wait behind a tap or scroll acknowledgement.
- Cursor movement is limited to approximately 30 updates per second. Wheel bursts retain one bounded pending scroll, rather than replaying a backlog.
- The touch-through cursor is an accessibility overlay. It requires no separate Draw over other apps permission, hides on stop/rotation, and expires if cursor messages stop arriving.
- Automated checks cover wheel geometry, pointer capture/release, authorization, replay rejection, stale display coordinates, concurrent pointer/gesture messages and native owner publishing. Physical pointer placement and accessibility behaviour still need testing on the user's phone.
