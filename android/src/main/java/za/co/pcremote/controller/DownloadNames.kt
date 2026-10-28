package za.co.pcremote.controller

import java.net.URI
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Resolve the source name; a WebView's generic .bin guess must never replace it. */
internal object DownloadNames {
    fun resolve(url: String, disposition: String?, fallback: String): String {
        val header = disposition.orEmpty()
        val encoded = Regex("(?:^|;)\\s*filename\\*\\s*=\\s*UTF-8'[^']*'([^;]+)", RegexOption.IGNORE_CASE)
            .find(header)?.groupValues?.get(1)?.trim()?.trim('"')
        val extended = encoded?.let { runCatching { decode(it, false) }.getOrNull() }?.takeIf { it.isNotEmpty() }
        val ordinary = Regex("(?:^|;)\\s*filename\\s*=\\s*(?:\"((?:\\\\.|[^\"])*)\"|([^;]+))", RegexOption.IGNORE_CASE)
            .find(header)?.let { match ->
                if (match.groupValues[1].isNotEmpty()) match.groupValues[1].replace(Regex("\\\\(.)"), "$1")
                else match.groupValues[2].trim()
            }?.takeIf { it.isNotEmpty() }
        val uri = runCatching { URI(url) }.getOrNull()
        val fromQuery = runCatching {
            uri?.rawQuery?.split('&')?.firstOrNull { decode(it.substringBefore('='), true) == "name" }
                ?.substringAfter('=', "")?.let { decode(it, true).substringAfterLast('/') }
                ?.takeIf { it.isNotEmpty() }?.let { if (uri?.path == "/api/files/folder") "$it.zip" else it }
        }.getOrNull()
        // The host's filename* is authoritative. Its ASCII filename fallback can
        // lose accents, so otherwise use the original name in the download URL.
        return TransferFileNames.download(extended ?: fromQuery ?: ordinary ?: fallback)
    }

    private fun decode(value: String, form: Boolean): String {
        val bytes = ByteArrayOutputStream()
        var index = 0
        while (index < value.length) {
            when {
                value[index] == '%' -> {
                    require(index + 2 < value.length) { "Invalid filename encoding" }
                    val byte = value.substring(index + 1, index + 3).toIntOrNull(16)
                        ?: throw IllegalArgumentException("Invalid filename encoding")
                    bytes.write(byte); index += 3
                }
                form && value[index] == '+' -> { bytes.write(32); index++ }
                else -> {
                    val point = value.codePointAt(index)
                    bytes.write(String(Character.toChars(point)).toByteArray(Charsets.UTF_8))
                    index += Character.charCount(point)
                }
            }
        }
        return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
    }
}
