# Carbon & Vermilion redesign — implementation map

The active user brief is saved in `UI-REDESIGN-BRIEF.md`. It supersedes the former Explorer-copying visual direction. The existing Elleson Connect product name, accounts and capabilities remain intact.

## Reference status

Sculpted Flow was received as an actual image at C:/Users/elles/Pictures/Screenshots/file_0000000065a08211ab1de275b5426a31.png. The user subsequently authorized making remaining decisions while they sleep. It is the primary reference: curved shared surfaces, restrained vermilion, editorial identity, a retractable remote shelf and continuous shaped navigation. The other two concepts have not been supplied; no claim is made to have inspected them.

## Existing architecture

- Vanilla JavaScript with persistent DOM elements and small feature modules, not a component framework. `index.html` provides the original remote state/functions; the host splits and serves allowlisted scripts/styles through `asset-bundles.js` and `asset-cache.js`.
- `public/page-navigation.js` coordinates real dialog-backed full pages, browser history, focus, return targets and scroll state. Its `pcr:page` event is the central integration point for presentation changes. The new navigation must extend this lifecycle rather than creating a second independent router.
- `public/desktop-controls.js`, `workspace-ui.js`, `mission-control.js` and `home-panels.js` compose the present home. Saved tile visibility/order belongs to `PCRWorkspace`; redesign should retain access to those preferences without retaining the old oversized grid.
- Remote JPEG regions, direct H.264 video, input sockets, touch gestures and typing have independent controllers. Opening or closing a visual control panel must not tear down those connections.
- Files use the existing transfer manager, file browser and Explorer workspace. Preserve their directory, selection, destination and transfer queue while replacing the Explorer-copying composition with a purpose-built transfer/browsing environment.
- Audio is already consolidated through `audio-hub.js`, which reuses the original playback and phone-audio controls. Preserve actual player state across navigation; stop/restart only when the user explicitly changes the audio route or session ends.
- Android native features are exposed through the trusted `PCRAndroid` web-message bridge and the `pcr:native-ready` capabilities event. Foreground services own phone screen sharing, audio, transfers and the new update download.

## Structural approach

1. Preserve working DOM nodes and feature APIs so their handlers, drafts, selected folders and services remain connected. Rebuild their surroundings and composition deliberately instead of adding an overriding colour stylesheet.
2. Establish Carbon (`#10100F`), Vermilion (`#FC563E`), warm white (`#EFE7DC`) and muted gray (`#77756E`) tokens, readable typography, spacing and motion primitives. Align the EC artwork and native surfaces with the final reference-led direction.
3. Build one transforming navigation object. Native dialog top-layer behavior means the navigation must stay accessible within the active environment; placing a high-z-index bar under a modal dialog is insufficient. Use one persistent controller and preserve predictable destination order/labels.
4. Separate environment presentation state from transport state. A navigation transition may hide a surface while retaining a remote session or audio route. Explicit disconnect and sign-out still use the existing cleanup and permission paths.
5. Give Home an original entry interaction, Remote a display-first composition and retractable gesture panel, Files clear locations/selection/delivery state, and Audio real route/volume/activity feedback. Secondary functions remain reachable without becoming duplicate nested journeys.
6. Centralize press, entry, exit, panel, shared-element and navigation timings. Animate transform/opacity; suspend idle effects and honor reduced motion and the existing Lightweight preference. Never animate invented transfer or audio data.

## Keyboard scope

The new brief explicitly requests preventing unintended zoom/clipping when Android's keyboard opens. That now authorizes investigating and fixing the earlier keyboard-triggered zoom/crash report, which had previously been deferred. Preserve the user's desktop zoom, selected field and live draft across IME inset changes. Insets must not be mistaken for a deliberate orientation change or user zoom gesture.

## Required verification

Use isolated test accounts, synthetic files/audio/video and no real clipboard access. Cover small Android viewports, portrait/landscape, keyboard insets, bottom system navigation, reduced motion, fullscreen/touchpad/direct-touch gestures, folder state retention, ongoing transfers and audio continuity. Render actual working screens and compare them with all three references before finalizing. No fake online counts, throughput, FPS or meter activity.
