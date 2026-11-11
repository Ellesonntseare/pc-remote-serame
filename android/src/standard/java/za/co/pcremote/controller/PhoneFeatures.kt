package za.co.pcremote.controller

import android.content.Context
import org.json.JSONObject

object PhoneAccess {
    val controlEnabled = false
    fun transferContext(context: Context): Context = context
}

class ScreenShareService {
    companion object {
        var events: ((JSONObject) -> Unit)? = null
        var previewEnabled = false
        fun stopSharing() {}
        fun stopPhoneControl() {}
        fun forwardMark(mark: JSONObject) {}
        fun pendingControl(): String? = null
        fun respondControl(id: String, allow: Boolean) {}
    }
}

class PhoneAudioService {
    companion object {
        var events: ((JSONObject) -> Unit)? = null
        fun stop() {}
        fun status() {}
        fun control(volume: Double, muted: Boolean) {}
        fun stopThen(callback: (Boolean) -> Unit) { callback(true) }
    }
}

class LocalMediaCapture(private val emit: (JSONObject) -> Unit) {
    fun credit(kind: String) {}
    fun close() {}
    fun start(video: Boolean, audio: Boolean, front: Boolean, displayDegrees: Int) {
        emit(JSONObject().put("kind", "error").put("message", "Phone capture requires the optional Phone Access app."))
    }
}
