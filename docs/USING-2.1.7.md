# PC Remote 2.1.7 personal preview

Install PC-Remote-Android-2.1.7.apk over the existing personal app. Serame Keyboard is included; select Serame Keyboard · PC Remote in Android keyboard settings.

## Original file names

Uploads retain the original provider filename, including Unicode, spaces, plus signs, extension and long Windows-compatible names. Downloads resolve the original name from the host instead of a generic WebView .bin guess. The host supports valid dotfiles and names up to 255 UTF-16 units, subject to the destination filesystem's limits.

If a PC destination already has that name, the transfer pauses. Choose Replace existing file deliberately, or select another PC folder and use that destination. Upload bytes already received are retained when resolving a final-chunk naming conflict. Existing files are not overwritten automatically. Browser-managed downloads may still use the browser's own duplicate-name behaviour. Android document providers that alter the requested name are reported instead of being presented as a successful unchanged-name transfer.

Folder sync preserves original names and reports incompatible names. If both devices edit the same file, it stops for a conflict decision rather than creating timestamped conflict filenames.

## Word suggestions

Serame Keyboard displays up to three tappable suggestions for the current word. The offline English starter vocabulary is supplemented by frequently typed words learned on the phone, including words in other languages. It does not automatically correct or replace words. Settings offer Show word suggestions, Learn my frequently typed words and Clear learned words.

Suggestions use the active phone text connection, including normal typing into the remote PC view. They are hidden in password, number, address and private input fields, and in the explicit PC toolbar typing mode where the phone cannot inspect the PC cursor. Learned words stay in the phone's keyboard preferences.

## Verification

Portable host tests passed after correcting the legacy ASCII header fallback; targeted HTTP/UI regressions cover exact filenames and bytes, duplicates, explicit replacement and resuming to another folder. The live host combination passed 57 transfer and sync checks. Android compilation, unit tests and the existing signing certificate are verified by the APK workflow. Actual suggestions, provider names and keyboard navigation still require a physical phone check.
