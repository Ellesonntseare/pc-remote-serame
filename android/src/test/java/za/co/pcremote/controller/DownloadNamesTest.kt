package za.co.pcremote.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
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
    @Test fun reportsImpossibleNamesInsteadOfSilentlyRewritingOrTruncatingThem() {
        assertThrows(IllegalArgumentException::class.java) { DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"/:report.pdf\"", "download.bin") }
        val name = DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"${"a".repeat(200)}.mp4\"", "download.bin")
        assertEquals(204, name.length)
        assertEquals(".mp4", name.takeLast(4))
    }

    @Test fun originalUrlKeepsUnicodeWhenOnlyAsciiHeaderFallbackIsAvailable() {
        assertEquals("résumé + 日本語 100%.pdf", DownloadNames.resolve("https://pc/api/files/download?name=%40desktop%2Fr%C3%A9sum%C3%A9%20%2B%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20100%25.pdf", "attachment; filename=\"resume + ___ 100%.pdf\"", "download.bin"))
        assertEquals(".gitignore", DownloadNames.resolve("https://pc/api/files/download?name=.gitignore", null, "download.bin"))
    }

    @Test fun namesKeepSpacesSemicolonsQuotesAndCompoundExtensions() {
        assertEquals("  Project; final.tar.gz", DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"  Project; final.tar.gz\"", "download.bin"))
        assertEquals("photo+video.png", DownloadNames.resolve("https://pc/api/files/download?name=photo%2Bvideo.png", null, "download.bin"))
        assertEquals("notes \"final\".txt", DownloadNames.resolve("https://pc/api/files/download", "attachment; filename=\"notes \\\"final\\\".txt\"", "download.bin"))
    }

    @Test fun malformedExtendedEncodingFallsBackWithoutReplacingLetters() {
        assertEquals("résumé.pdf", DownloadNames.resolve("https://pc/api/files/download?name=r%C3%A9sum%C3%A9.pdf", "attachment; filename*=UTF-8''bad%C3%28.pdf; filename=\"download\"", "download.bin"))
        assertEquals("picture.webp", DownloadNames.resolve("https://pc/api/files/download?name=picture.webp", "attachment; filename*=UTF-8''bad%GG.pdf", "download.bin"))
    }
}
