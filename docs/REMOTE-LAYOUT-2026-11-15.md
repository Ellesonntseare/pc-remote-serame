# Remote screen, trackpad and navigation — 15 November 2026

The phone remote view reserves independent areas for the PC picture, trackpad controls and bottom navigation. Portrait places the controls below the picture; landscape places them beside the picture. Trackpad size is bounded by the available controls area so restoring a large saved height cannot collapse the PC picture. The canvas keeps its existing zoom and refits through the existing view ResizeObserver.

Move is now an explicit mode. Tap Move, drag the panel body and tap Done. In this mode PC pointer input is blocked, including the left/right click buttons; the top resize handle can also be used as a movement surface. Movement is clamped within the controls area, so the panel cannot cover the picture or navigation. Opening Size, changing page, opening typing or losing focus ends the movement mode as appropriate.

Remote navigation is pinned below the screen and controls on phones, including landscape and fullscreen with mouse controls. A saved floating/hidden navigation preference is retained for other pages. Layout changes also account for visual viewport resizing, keyboard return and rotation.

Validation: 38 focused UI/input/navigation checks passed. A full served-app headless Chrome test used a synthetic PC image and real touch input at 390x844, 360x640, 412x915, 844x390, 640x360 and 568x320. It checked initial layout, maximum requested size, dragging on the panel body, fullscreen controls, restoration, keyboard return and rotation. Assertions checked that the complete image fits its viewport, the panel never intersects that viewport, navigation stays below, and moving the panel emits no PC input. Physical-device confirmation remains necessary.

The corrected public assets are deployed to the installed host. Existing Android APKs load this interface on reconnect/reload, so this layout correction does not require a new APK.
