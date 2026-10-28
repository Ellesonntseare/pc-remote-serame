package za.co.pcremote.controller

import java.net.URI
import java.net.URLDecoder

/** Keep real file names even on WebViews that do not understand filename*. */
internal object DownloadNames {
    fun resolve(url: String, disposition: String?, fallback: String): String {
        val header = disposition.orEmpty()
        val encoded = Regex("filename\\*\\s*=\\s*UTF-8'[^']*'([^;]+)", RegexOption.IGNORE_CASE)
            .find(header)?.groupValues?.get(1)?.trim()?.trim('"')
        val extended = encoded?.let { runCatching { URLDecoder.decode(it.replace("+", "%2B"), "UTF-8") }.getOrNull() }
        val ordinary = Regex("filename\\s*=\\s*(?:\"([^\"]+)\"|([^;]+))", RegexOption.IGNORE_CASE)
            .find(header)?.let { it.groupValues[1].ifBlank { it.groupValues[2].trim() } }
        val uri = runCatching { URI(url) }.getOrNull()
        val original = runCatching { uri?.rawQuery?.split('&')?.firstOrNull { it.substringBefore('=') == "name" }
            ?.substringAfter('=', "")?.let { URLDecoder.decode(it, "UTF-8").substringAfterLast('/') } }.getOrNull()
        val fromQuery = original?.let { if (uri?.path == "/api/files/folder") "$it.zip" else it }
        val generic = ordinary?.lowercase() in listOf(null, "download", "download.bin", "folder.zip")
        val chosen = extended?.takeIf { it.isNotBlank() } ?: if (generic) fromQuery ?: ordinary ?: fallback else ordinary ?: fromQuery ?: fallback
        val clean = chosen.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().trimEnd('.', ' ')
        if (clean.isBlank() || clean in listOf(".", "..")) return "Shared-file"
        if (clean.length <= 180) return clean
        val extension = clean.substringAfterLast('.', "").takeIf { it.length in 1..16 }?.let { ".$it" }.orEmpty()
        return clean.take(180 - extension.length) + extension
    }
}
