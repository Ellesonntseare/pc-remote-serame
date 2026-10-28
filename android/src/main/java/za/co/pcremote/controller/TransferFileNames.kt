package za.co.pcremote.controller

/** Keep names verbatim. Unsupported names are reported instead of rewritten. */
internal object TransferFileNames {
    fun download(name: String): String {
        require(name.isNotEmpty() && name != "." && name != ".." &&
            !Regex("[\\\\/\\p{Cntrl}]").containsMatchIn(name) && Charsets.UTF_8.newEncoder().canEncode(name)) {
            "The original filename cannot be saved unchanged. Choose a different source file."
        }
        return name
    }

    fun upload(displayName: String?, supplied: String, started: Boolean): String {
        // A provider knows the original name, unlike a WebView's MIME-based guess.
        // Once an upload starts its persisted name must stay stable across resumes.
        val name = if (!started && !displayName.isNullOrEmpty()) displayName else supplied
        require(name.isNotEmpty()) {
            "This source does not provide its original filename. Save it on your phone, then choose it again."
        }
        require(name.length <= 255 && !Regex("[<>:\"/\\\\|?*\\x00-\\x1f]").containsMatchIn(name) &&
            name != "." && name != ".." && !name.endsWith('.') && !name.endsWith(' ') &&
            !Regex("^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\\.|$)", RegexOption.IGNORE_CASE).containsMatchIn(name) &&
            Charsets.UTF_8.newEncoder().canEncode(name)) {
            "Windows cannot store this filename unchanged. Rename it on the source before sending."
        }
        return name
    }

    fun destination(expected: String, actual: String?) {
        download(expected)
        check(actual != null) { "This phone folder does not report the saved filename. Choose another folder to keep the original name." }
        check(actual == expected) {
            "Android changed the filename to $actual. Choose another folder and download again to keep $expected."
        }
    }
}
