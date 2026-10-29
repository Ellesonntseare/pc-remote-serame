# Elleson Connect 2.1.9 — shared mouse and keyboard

Install the APK over your current personal app. The Windows host update includes the new mouse handoff component and tray shortcut. Elleson Keyboard is included.

## Use

1. Phone: **Use PC mouse**, then approve entire-screen sharing.
2. PC: **Phone control**. Request control and approve on the phone; enable Elleson Connect phone control in Accessibility settings the first time.
3. Open **Arrange phone & PC**, choose left/right/above/below, and enable **Move mouse across the screen edge**. The keyboard follows the pointer to the phone. Move back across the joining edge, or press Escape, to return to Windows.
4. You can also control the phone preview directly. Click a phone text field and type; there is no separate composing box. Android 13+ uses its accessibility input connection. Older versions can use the included Elleson Keyboard for full key support, with plain editable fields supported through accessibility as a fallback.
5. Hold and drag items in real time. Right-click performs a long press. The wheel supports both axes and fine trackpad deltas, with bounded pending scrolls.
6. Drop PC files onto the phone preview. Names are preserved. On the phone, **Choose incoming-files folder** selects a destination. Android 10+ defaults to a grouped folder inside Downloads/Elleson Connect. Existing names in a selected folder are left intact; choose another folder if needed. Receiving joins the existing Android Pause/Cancel transfer notification.
7. Right-click the Windows tray icon and choose **Control my phone…** to open the control page directly.

## Rotation and connection recovery

Rotation updates the screen dimensions without requiring another mouse-capture click. A drag is safely released when the screen rotates; press again to start a new drag. Input queued for the old orientation is discarded.

Brief network interruptions release Windows input immediately, retain the phone's existing projection, and reconnect automatically. The PC restores the selected phone and requests resumption using a secret issued during the previous approval. The phone accepts this only for that same client and within the original ten-minute approval window. Resuming does not extend that window. Explicit Stop, sign-out and expiration require approval again. Android itself ending screen sharing requires a new Android consent prompt.

The Windows helper installs input hooks only during an approved session with edge switching enabled. Keyboard events outside the captured phone mode are passed through and never published. A heartbeat timeout, EOF or explicit Stop releases input and removes hooks. Pending clicks, text and drags are never replayed after reconnection.

## Verification

Automated checks cover protocol authorization, ordered input, queue bounds, Unicode editing, file destinations, layout geometry and native process cleanup. Physical mouse handoff, Android continued gestures, keyboard compatibility and Android background-transfer restrictions also need testing on the user's hardware.
