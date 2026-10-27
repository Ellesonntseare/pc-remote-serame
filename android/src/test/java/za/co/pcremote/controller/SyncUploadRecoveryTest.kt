package za.co.pcremote.controller

import java.io.IOException
import org.junit.Assert.*
import org.junit.Test

class SyncUploadRecoveryTest {
    private data class State(val complete: Boolean, val tag: String = "pc-2", val offset: Long = 4096)
    private val ticket = SyncUploadTicket("upload", "secret", "phone-1", "pc-1")

    private class Store(var pending: Boolean = true, var checkpoint: Pair<String, String>? = null) {
        var discarded = 0
        fun recover(ticket: SyncUploadTicket, source: String?, remote: String, resume: () -> State, cancel: (() -> Unit)? = null): State? =
            SyncUploadRecovery.reconcile(ticket, source, remote, resume, { it.complete },
                { checkpoint = ticket.stamp to it.tag },
                { cancel?.invoke(); discarded++ }, { pending = false })
    }

    @Test fun interruptedUploadRetainsItsOffsetAndTicketAcrossTemporaryFailures() {
        for (failure in listOf(IOException("offline"), SyncHttpFailure(409, "chunk busy"), SyncHttpFailure(503, "PC restarting"))) {
            val store = Store()
            try { store.recover(ticket, "phone-1", "pc-1", { throw failure }); fail("Failure was swallowed") }
            catch (caught: IOException) { assertSame(failure, caught) }
            assertTrue(store.pending); assertEquals(0, store.discarded)
            assertEquals(4096L, store.recover(ticket, "phone-1", "pc-1", { State(false) })!!.offset)
            assertTrue(store.pending)
        }
    }

    @Test fun editsDuringUploadRemainDirtyAfterRecoveringTheCompletedReceipt() {
        val store = Store()
        assertNull(store.recover(ticket, "phone-2", "pc-2", { State(true) }))
        assertEquals("phone-1" to "pc-2", store.checkpoint)
        assertNotEquals("phone-2", store.checkpoint!!.first)
        assertFalse(store.pending); assertEquals(0, store.discarded)
        // The next pass sends phone-2 instead of mistaking it for uploaded data.
        val next = ticket.copy(stamp = "phone-2", match = "pc-2")
        store.pending = true
        store.recover(next, "phone-2", "pc-3", { State(true, "pc-3") })
        assertEquals("phone-2" to "pc-3", store.checkpoint)
    }

    @Test fun changedOrRemovedSourcesAndChangedDestinationsReleaseOldPartialsFirst() {
        for ((source, remote) in listOf("phone-2" to "pc-1", null to "pc-1", "phone-1" to "pc-2")) {
            val store = Store()
            assertNull(store.recover(ticket, source, remote, { State(false) }, { assertTrue(store.pending) }))
            assertEquals(1, store.discarded); assertFalse(store.pending); assertNull(store.checkpoint)
        }
    }

    @Test fun failedCancellationKeepsTheTicketUntilTheOldPartialIsReleased() {
        val store = Store()
        try { store.recover(ticket, "phone-2", "pc-1", { State(false) }, { throw IOException("offline") }); fail("Lost pending upload") }
        catch (_: IOException) { }
        assertTrue(store.pending)
        store.recover(ticket, "phone-2", "pc-1", { State(false) })
        assertFalse(store.pending); assertEquals(1, store.discarded)
    }

    @Test fun onlyMissingOrExpiredReceiptsPermitStartingOver() {
        for (status in listOf(404, 410)) {
            val store = Store()
            assertNull(store.recover(ticket, "phone-1", "pc-1", { throw SyncHttpFailure(status, "expired") }))
            assertFalse(store.pending); assertEquals(0, store.discarded)
        }
        val store = Store()
        try { store.recover(ticket, "phone-1", "pc-1", { throw SyncHttpFailure(401, "sign in") }); fail("Lost signed-out ticket") }
        catch (_: SyncHttpFailure) { }
        assertTrue(store.pending)
    }
}
