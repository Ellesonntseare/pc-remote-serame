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
- [x] Rebuild the Files workspace structure against the screenshots, with responsive inner scrolling and working existing actions.
- [x] Add persistent per-account workspace/history storage. SQLite keeps full event text and indexed history; list responses use previews and pagination. Restart, deduplication and account-isolation checks passed. The Windows installer already bundles Node 22; source now requires Node 22.13 or newer.
- [x] Link main Google owner and local-owner identity; isolate other accounts' account data. Integration checks verify shared preferences/history across both sign-in methods and across host restart. Online account counts also combine those methods.
- [x] Scope existing settings/clipboard/shared-content sync to accounts and migrate the main owner's existing data. The main owner retains the original sync file; other account stores are separate. Integration checks verify isolated settings, inventories and deliveries.
- [x] Record server-side actions, transfers and clipboard events; update completed/paused/resumed/cancelled records without duplicates.
- [x] Sync favourites, file view, folder tabs/bookmarks, supported preferences and saved workspace state without replaying remote input or duplicating transfers.
- [x] Provide a full account History page and synchronise it across active devices, with search/filtering and retained clipboard text.
- [x] Check reconnects, server restart, Google/local owner linking, other-account isolation and cross-device updates.
- [x] Run appropriate full checks, responsive/live Windows checks, native builds and Android signing checks as required; publish and update the personal host.

## Current implementation state

- Explorer layout modules are implemented and pass an isolated browser review with the real Windows catalogue and fixture files at 1024, 844, 390 and 320 pixels. Remaining refinement includes native sidebar/type icons, complete toolbar operations, tab/state persistence and regression coverage. The live personal host has not been updated with this development branch.
- New account APIs expose revisioned workspace values, paginated/searchable history, full event detail and retry-safe client activity. Existing semantic host activity and sync clipboard sends now enter account history. Transfer lifecycle hooks, native clipboard observation, broader activity hooks and the visible History/sync client remain to be connected.
- Shared preference coverage now includes the existing control sensitivity, shortcut/key layout, live-typing preference, quality, hold-control and transfer-notification preferences. Device IDs, local permissions, connection grants and pending file handles remain device-bound.
- Targeted checks have passed for the store, canonical account scope, Google/password integration, legacy sync compatibility, keyboard transport and existing account/session controls. Complete-suite and release checks are still pending.

## Current verified mapping

The native helper identified the six known folders, OneDrive, the custom sidebar folders visible in the user's screenshots and C:. Paths are discovered at runtime and are not hard-coded into the app. Private account files and activity stores must remain excluded from Git and installers.

## Compatibility rules

- Preserve the existing transfer folder and resumable upload metadata/secrets. Activity sync must not restart or duplicate actual transfers.
- Preserve existing history/online-session controls. The new history is account-scoped; guest views must not inherit owner clipboard/history.
- Keep device-bound permissions, Android content-tree URIs and native device identifiers on their own devices. Sync the account-level definitions/capabilities without applying another phone's local URI or permissions.
- Maintain bounded polling, coalesced writes, pagination and incremental revisions. Retain all recorded events without rendering or transferring the entire history on each refresh.
- Never stage the user's untracked `start-at-login.bat`, private config/account/session stores or runtime output.

## Implemented after the foundation

- Explorer now has working folder tabs, native sidebar icons, matched date/size columns and usable compact actions. Two real Chromium contexts verified matching folder/tab changes, history search and full text. Layouts at 1024, 844, 390 and 320 pixels had no page errors or document overflow. Full Windows copy/cut/paste and Recycle Bin remain follow-up file operations rather than placeholder controls.
- History UI supports search, activity/device filtering, older pages and full-text detail; pinned text and old snippets migrate to the account. Open entries survive history refreshes.
- A hidden Windows clipboard listener uses change notifications and shuts down with the host. Native readiness and an existing clipboard event were verified without printing or modifying clipboard contents. Clipboard text is retained; file/image events retain metadata.
- Upload completion, HTTP delivery/interruption, folder/file operations, shared content, settings/device rename and supported screen/audio/camera/presentation/recording/page/native transfer events enter account history. Stable transfer IDs and client event IDs deduplicate retries. HTTP delivery alone is not proof that an OS has saved a file; native completion is a separate report.
- Shared file workspace, compose drafts, transfer progress and folder-sync metadata now use account state. Native permissions/URIs, pending file handles and remote input remain local. Defaults are distinguished from explicit edits; key revisions prevent stale workspace updates from silently replacing other keys.
- Two-client tests verify folder selection/scroll state, history delivery, disconnected draft recovery and no native/input replay. API tests verify restart durability, canonical owner linking, other-account isolation, batch validation, migration and revision conflicts.
- The first complete Windows test run had 343/344 pass; its guest-action audit regression was fixed, then all 17 related account/guest/file checks passed. Final CI/release checks are required before publishing.

Final review also added retained chat/notes, voice/whiteboard activity and image/OCR/screenshot/recording preparation hooks. A stale-tab account header prevents a tab from writing the previous account’s cached state after its browser cookie changes accounts. Last-moment drafts flush synchronously on page exit. New focused tests cover those cases. The 51b13df base passed all 344 Windows and 328 portable checks plus native builds/codec checks; final hooks require the next complete run.

Released personal 2.1.4 at 689bc74. Full source checks passed at fc2ae44 (347 Windows/331 portable); the final timer-handle correction passed focused and real two-browser checks. Final installer/runtime checks passed at 689bc74. APK source is unchanged from its signed 758af77 build. Local/public host verification passed and the verification session was revoked. Native Clipboard capture is enabled on the production host; QA fixtures use their own clipboard.
