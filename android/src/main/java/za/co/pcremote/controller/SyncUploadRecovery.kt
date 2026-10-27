package za.co.pcremote.controller

import java.io.IOException

internal class SyncHttpFailure(val status: Int, message: String) : IOException(message)

/** A ticket describes the source snapshot being copied, never a later phone edit. */
internal data class SyncUploadTicket(val id: String, val secret: String, val stamp: String, val match: String)

internal object SyncUploadRecovery {
    fun <T> reconcile(
        ticket: SyncUploadTicket,
        sourceStamp: String?,
        destinationTag: String,
        resume: () -> T,
        isComplete: (T) -> Boolean,
        completed: (T) -> Unit,
        discard: () -> Unit,
        forget: () -> Unit
    ): T? {
        val state = try {
            resume()
        } catch (error: SyncHttpFailure) {
            if (error.status != 404 && error.status != 410) throw error
            forget()
            return null
        }
        if (isComplete(state)) {
            // Recover the saved snapshot before planning the next pass. A newer
            // source stamp then remains dirty and will be sent on that pass.
            completed(state)
            forget()
            return null
        }
        if (ticket.stamp != sourceStamp || ticket.match != destinationTag) {
            try {
                discard()
            } catch (error: SyncHttpFailure) {
                if (error.status != 404 && error.status != 410) throw error
            }
            forget()
            return null
        }
        return state
    }
}
