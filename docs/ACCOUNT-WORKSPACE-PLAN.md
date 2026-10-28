# Account workspace and Explorer update

This is the active implementation plan after personal 2.1.3. The current personal release remains 2.1.3 until this work is tested and published.

## Confirmed user requirements

- The screenshots supplied on 28 October 2026 define the Windows Explorer layout: sidebar, navigation/address/search row, compact command bar, file columns, grouped dates, drive capacity view and status bar. The website's existing colours may be retained. This is a functional file browser, not a screenshot background.
- Google owner and local owner-password sign-ins share the main account's data. Other accounts retain their own data.
- Sync all supported PC Remote account data across phone, browser and PC: recorded actions, transfer states/history, files/folder changes, captured clipboard text, links/shared content, settings, favourites and saved workspace state. Uploads/downloads/clipboard were examples, not the entire scope.
- Capture activity inside PC Remote and clipboard changes the platform permits. Android/browser background restrictions and other apps' private data remain explicit capability limits.
- Existing PC host remains the user's server. Preserve current features, queued/resumable transfers, local offline access, Google sign-in and the personal app's signing identity.

## Implementation checklist

- [x] Inspect actual Windows known-folder mappings, logical drives and Shell Home folder entries.
- [x] Implement a native catalogue for known folders, OneDrive, pinned/frequent folders and ready drives, including drive capacity. Filter archive shell items out of filesystem folders.
- [x] Connect the catalogue to an asynchronous, cached file-location provider. Keep filesystem fallback and configured locations. Avoid recursive watchers on drive roots.
- [x] Compile the Windows helper and verify the real folder catalogue. Seven focused provider/workspace checks passed.
- [ ] Rebuild the Files workspace structure against the screenshots, with responsive inner scrolling and working existing actions.
- [ ] Add persistent per-account workspace/history storage. Keep full historical records on the PC rather than the current in-memory recent-event list.
- [ ] Link main Google owner and local-owner identity; isolate other accounts' account data.
- [ ] Scope existing settings/clipboard/shared-content sync to accounts and migrate the main owner's existing data.
- [ ] Record server-side actions, transfers and clipboard events; update completed/paused/resumed/cancelled records without duplicates.
- [ ] Sync favourites, file view, folder tabs/bookmarks, supported preferences and saved workspace state without replaying remote input or duplicating transfers.
- [ ] Provide a full account History page and synchronise it across active devices, with search/filtering and retained clipboard text.
- [ ] Check reconnects, server restart, Google/local owner linking, other-account isolation and cross-device updates.
- [ ] Run appropriate full checks, responsive/live Windows checks, native builds and Android signing checks as required; publish and update the personal host.

## Current verified mapping

The native helper identified the six known folders, OneDrive, the custom sidebar folders visible in the user's screenshots and C:. Paths are discovered at runtime and are not hard-coded into the app. Private account files and activity stores must remain excluded from Git and installers.

## Compatibility rules

- Preserve the existing transfer folder and resumable upload metadata/secrets. Activity sync must not restart or duplicate actual transfers.
- Preserve existing history/online-session controls. The new history is account-scoped; guest views must not inherit owner clipboard/history.
- Keep device-bound permissions, Android content-tree URIs and native device identifiers on their own devices. Sync the account-level definitions/capabilities without applying another phone's local URI or permissions.
- Maintain bounded polling, coalesced writes, pagination and incremental revisions. Retain all recorded events without rendering or transferring the entire history on each refresh.
- Never stage the user's untracked `start-at-login.bat`, private config/account/session stores or runtime output.
