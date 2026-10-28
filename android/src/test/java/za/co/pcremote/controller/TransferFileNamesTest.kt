package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class TransferFileNamesTest {
    @Test fun providerOriginalWinsOverGenericWebViewLabelsOnFreshUploads() {
        for (name in listOf("  résumé + 日本語 100%.tar.gz", ".gitignore", "Photo 01.HEIC", "a".repeat(245)+".docx")) {
            assertEquals(name, TransferFileNames.upload(name, "download.bin", false))
            assertEquals(name, TransferFileNames.download(name))
        }
    }

    @Test fun resumeKeepsTheOriginalNameChosenWhenTheTransferStarted() {
        assertEquals("Original.pdf", TransferFileNames.upload("Renamed on phone.pdf", "Original.pdf", true))
        assertEquals("Supplied filename.txt", TransferFileNames.upload(null, "Supplied filename.txt", false))
    }

    @Test fun incompatibleWindowsNamesAreReportedWithoutChangingThem() {
        for (name in listOf("photo?.jpg", "notes:today.txt", "trailing.txt ", "CON.pdf", "LPT¹.txt", "a".repeat(256), "../file.txt", "")) {
            assertThrows(IllegalArgumentException::class.java) { TransferFileNames.upload(name, name, false) }
        }
    }

    @Test fun providerSuffixesTruncationAndMimeExtensionsCannotSilentlyRenameDownloads() {
        TransferFileNames.destination("report.pdf", "report.pdf")
        for (actual in listOf("report (1).pdf", "report.pdf.bin", "repo.pdf", "Report.pdf", null)) {
            assertThrows(IllegalStateException::class.java) { TransferFileNames.destination("report.pdf", actual) }
        }
    }

    @Test fun invalidLeafNamesNeverBecomeGenericSharedFiles() {
        for (name in listOf("", ".", "..", "folder/file.txt", "bad\u0000.txt", "bad\n.txt")) {
            assertThrows(IllegalArgumentException::class.java) { TransferFileNames.download(name) }
        }
    }
}
