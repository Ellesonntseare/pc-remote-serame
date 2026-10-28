package za.co.pcremote.controller

import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadNamesTest {
    @Test fun preservesExtensionsWhenLegacyWebViewSuppliesGenericNames() {
        assertEquals("holiday photo.jpg", DownloadNames.resolve("https://pc/api/files/download?name=%40desktop%2Fholiday%20photo.jpg", "attachment; filename=\"download\"", "download.bin"))
        assertEquals("Projects.zip", DownloadNames.resolve("https://pc/api/files/folder?name=Projects", "attachment; filename=\"folder.zip\"", "folder.zip"))
        assertEquals("paper.pdf", DownloadNames.resolve("https://pc/api/files/download?name=paper.pdf", null, "download.bin"))
    }
    @Test fun honoursUnicodeAndLiteralPlusInExtendedNames() {
        assertEquals("résumé + notes.pdf", DownloadNames.resolve("https://pc/api/files/download?name=ignored", "attachment; filename=\"download\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20+%20notes.pdf", "download.bin"))
        assertEquals("report.docx", DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"report.docx\"", "download.bin"))
    }
    @Test fun cleansUnsafeCharactersWithoutLosingTheExtension() {
        assertEquals("__report.pdf", DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"/:report.pdf\"", "download.bin"))
        val name = DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"${"a".repeat(200)}.mp4\"", "download.bin")
        assertEquals(180, name.length)
        assertEquals(".mp4", name.takeLast(4))
    }
}
