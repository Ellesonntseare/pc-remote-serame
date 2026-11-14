# Responsive interface motion — 11 November 2026

The host now supplies a small CSS and Web Animations layer for touch-origin ripples, press/release feedback, staggered page content and floating mode choices, animated selected navigation icons, screen-placement movement, and confirmation of newly completed transfers. Existing page layouts, handlers and remote input transport provide the underlying interactions.

Pointer listeners are passive and never capture, cancel or synthesize PC input. Pointer movement, cancellation, loss of capture and blur release the pressed appearance. Remote mouse buttons, repeated command controls, video and canvas surfaces are excluded. New navigation cancels prior interface animations. Success feedback ignores old completed transfer history and cancelled transfers.

The layer follows the system reduced-motion preference and the existing Lightweight appearance choice. It cancels its own effects when the app is hidden, on sign-out, or when reduced motion is selected. It uses the existing host asset bundles and requires no new Android permissions, APK, service, or external animation account.

Validation: 35 focused checks passed across interaction motion, asset bundles, page navigation, Explorer and floating controls, Second screen gestures and Android update UI. Live browser inspection was unavailable because local browser use is disabled in Work settings; visual feel and physical Android performance remain to be reviewed on a device.
