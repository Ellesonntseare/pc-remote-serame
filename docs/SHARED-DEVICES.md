# Personal 2.1: connected devices

Your Windows PC remains the host. Install the personal Android 2.1 APK for discovery, clipboard integration, widgets and background folder sync. The website provides the shared file workspace and settings/link delivery too.

## Start using it

1. On Android, choose **Find my PC nearby** on the connection screen, or in Settings → Connection. Choose the discovered PC; the saved IP field remains available. Discovery uses DNS-SD on the local network and does not require Internet access.
2. Sign in and open Settings → Connection → **Connected devices**. App layout, appearance and supported control preferences sync between paired owner devices. Clipboard text moves between Windows and the foreground Android app; browsers use their available clipboard permissions or the explicit Send clipboard action.
3. In Files → PC, choose Transfers, Desktop, Documents, Downloads or a folder added on the Windows host. The current location is also the upload destination. Select checkboxes to rename or move items; sorting, favourites and subfolder search stay in the same workspace.
4. Open Files → Phone → **Synced folders**. Choose a phone folder and the PC destination once. Select both-way sync or phone-to-PC backup. Sync now, Pause, Resume and Disconnect folder are beside each folder pair. The same controls are accessible from Connection settings.
5. Add the Elleson Connect widget from these controls or Android's widget picker. Long-press the app icon for Screen, Files, Keyboard and Audio shortcuts.

Folder sync copies additions and changes; it does not mirror deletions. Conflicting changes keep a separate conflict copy. Hidden/internal files and paths unsupported by Windows are excluded. Android requires granting access to each chosen phone folder; another device cannot grant that permission remotely. App-private storage and Android system settings are outside folder sync.

PC file changes and supported Android provider notifications trigger checks while the app is in use. WorkManager also checks in the background at intervals of at least fifteen minutes; Android's battery/network policies can delay work. An open remembered host session is required, and signing out cancels that origin's jobs until signing in again. Paused uploads retain their committed chunk offset; folder downloads complete one file at a time. Previously replaced phone files are retained under `.pcr-previous-…` names; PC versions are retained privately in `.pcr-versions` inside Transfers.

## Windows sending and network folders

The Windows installer adds **Send to → Elleson Connect** in Explorer. The tray menu also opens a Send to my phone window that accepts dropped files, links and text. Choose a receiving device or all your devices. Deliveries remain queued while the receiving app is disconnected.

On Android, shared files start sending as soon as you choose Elleson Connect and the phone connects to its paired PC. There is no second Send button. They save directly as ordinary files in the PC's **Downloads\PC Remote Transfers** folder, independently of the Explorer folder currently being browsed. The PC host must be running, but you do not need to open the PC interface, sign in there, or download the file a second time. Choosing files inside the app still uses the destination you selected.

PC-to-phone file deliveries also start automatically while the connected Android app is open, from any app page. They use the existing native background transfer service and save to the chosen incoming folder, or **Downloads/Elleson Connect** with dated delivery subfolders on Android 10 or later. Android 8/9 requires choosing an incoming folder once. A transfer that has started can continue after switching apps. A delivery sent while the app is closed waits for the next connection; background collection during active phone screen sharing remains available. Settings/clipboard sync does not need to be enabled for automatic file collection.

Only explicitly sent deliveries are collected automatically; browsing the PC's files does not download them all. Existing file permissions, original-name checks, duplicate handling, pause/resume and notification actions remain in use. The host inbox is acknowledged only after Android has saved the file. Browser clients retain a **Save to this device** link. Text and links remain available in Files or Connected devices.

The tray's **PC folders and network shares** control adds locations without relocating their contents. Windows must already be able to open a network share; its normal Windows credentials and availability apply. Removing a location from Elleson Connect keeps its files.

Nearby network discovery combines advertised Elleson Connect, SMB, web, printer and media services with Windows' recently seen network neighbours. A discovered device does not automatically expose all its data. Devices without Elleson Connect participate through supported services, such as a Windows-accessible shared folder. Browser access can provide app functionality without installing the APK, subject to browser capabilities. Network isolation and sleeping devices can limit discovery.

## Phone as a Windows microphone

Install [VB-CABLE from its publisher](https://vb-audio.com/Cable/) on the PC once and follow its installation/restart instructions. The driver is not redistributed or installed automatically by Elleson Connect.

In Audio, select the phone microphone and choose **Windows microphone · CABLE Output** as the PC destination. In Zoom, Discord or your recording app, choose **CABLE Output** as the microphone. The app detects the driver before enabling this destination. Speakers/headphones remain a separate choice. Android 2.1 is required for this routing from the APK; microphone permission is requested when used.

## Video and validation

The host probes Intel Quick Sync, NVIDIA NVENC and AMD AMF before selecting hardware H.264. Failed hardware falls back to software encoding. The phone/browser needs secure WebCodecs support for direct H.264 viewing; the compatibility stream remains available, including plain HTTP connections that cannot expose WebCodecs.

Real Windows/Chromium testing decoded Intel Quick Sync frames and exercised Remote Screen and Watch PC. Browser testing verified settings synchronisation between two sessions, file selection/scroll restoration, rename/move and responsive layouts. Android build verification is automated; physical-device document-provider behaviour, microphone routing, background scheduling and LAN multicast discovery still require device testing.
