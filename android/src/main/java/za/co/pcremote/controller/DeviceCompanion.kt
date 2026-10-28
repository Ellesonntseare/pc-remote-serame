package za.co.pcremote.controller

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import androidx.core.content.FileProvider
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** The app and its IME share one authenticated connection. Credentials stay in memory. */
object DeviceCompanion {
    private lateinit var app: Context
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val inputWorker = Executors.newSingleThreadExecutor()
    private val client = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS).pingInterval(20, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build()
    private data class Link(val origin: String, val cookie: String, val account: String, val id: String, val name: String, val generation: Long)
    private data class Pending(val value: JSONObject, val time: Long)
    @Volatile private var link: Link? = null
    private var socket: WebSocket? = null
    private var generation = 0L
    private var reconnect = 0
    private var focused = false
    private var watching = false
    private var ready = false
    private var sharedEnabled = true
    private var picturesEnabled = true
    private var pending: Pending? = null
    private var revision = 0L
    private var appliedId = ""
    private var appliedHash = ""
    private var lastLocalHash = ""
    private var suppressedClip: ClipData? = null
    private var page = ""
    private var pcTyping = false
    private var lastCopyTime = 0L
    private var serverOffset = 0L
    private var publishing: Pending? = null
    private val inputQueue = ArrayList<String>()
    private var inputScheduled = false
    private var inputBusy = false
    private val listeners = linkedSetOf<() -> Unit>()
    var state = "Open PC Remote and sign in to connect"
        private set
    val connected: Boolean get() = ready && link != null
    val remoteContext: Boolean get() = connected && page in setOf("rs", "presentation")
    val typingToPC: Boolean get() = connected && pcTyping
    private val clipboard get() = app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    fun initialize(context: Context) {
        if (!::app.isInitialized) app = context.applicationContext
        if (!watching) {
            watching = true
            clipboard.addPrimaryClipChangedListener { captureClipboard() }
        }
    }
    fun observe(listener: () -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
    private fun notifyState(message: String = state) {
        state = message
        listeners.toList().forEach { runCatching { it() } }
    }
    fun foreground(context: Context, active: Boolean) {
        initialize(context); focused = active
        if (active && link != null && socket == null) openSocket(link!!)
    }
    fun context(pageId: String, pcInput: Boolean) {
        page = pageId.take(40)
        // Never send keystrokes from another Android app to the PC implicitly.
        if (!pcInput) pcTyping = false
        notifyState()
    }
    fun pcMode(enabled: Boolean) { pcTyping = enabled && connected; notifyState() }
    fun defaultKeyboard(): Boolean = ::app.isInitialized && Settings.Secure.getString(app.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD).orEmpty().startsWith(app.packageName + "/")
    fun ownsClipboardFile(name: String): Boolean = name == "$appliedHash.png"

    fun connect(context: Context, origin: String, cookie: String, account: String, id: String, name: String) {
        initialize(context)
        val normalized = TrustedOrigin.normalize(origin) ?: return
        if (!cookie.contains("pc_remote_session=") || account.isBlank() || !id.matches(Regex("[-a-zA-Z0-9]{12,80}"))) return
        val old = link
        if (old?.origin == normalized && old.cookie == cookie && old.account == account && old.id == id) {
            if (socket == null) openSocket(old)
            return
        }
        disconnect()
        val next = Link(normalized, cookie, account, id, name.take(80), ++generation)
        link = next
        notifyState("Connecting shared clipboard…")
        worker.execute {
            val verified = runCatching {
                client.newCall(request(next, "/api/session").build()).execute().use { response ->
                    val body = jsonBody(response, 128 * 1024)
                    response.isSuccessful && body.optString("role") == "owner" && body.optString("workspaceId") == next.account
                }
            }.getOrDefault(false)
            main.post { if (link === next) { if (verified) openSocket(next) else disconnect("Sign in again to reconnect your keyboard") } }
        }
    }
    fun disconnect(message: String = "Shared clipboard disconnected") {
        generation++; link = null; ready = false; pcTyping = false; pending = null; publishing = null; inputQueue.clear(); inputBusy = false; inputScheduled = false
        reconnect = 0; revision = 0; appliedId = ""; appliedHash = ""; lastLocalHash = ""
        socket?.close(1000, "Signed out"); socket = null
        notifyState(message)
    }
    private fun request(current: Link, path: String): Request.Builder = Request.Builder().url(current.origin + path)
        .header("Cookie", current.cookie).header("X-PCR", "1").header("X-PCR-Account", current.account)
    private fun jsonBody(response: Response, limit: Int): JSONObject {
        val body = response.body ?: throw IllegalStateException("Empty response")
        val bytes = body.byteStream().use { readBounded(it, limit) }
        return JSONObject(bytes.toString(Charsets.UTF_8))
    }
    private fun openSocket(current: Link) {
        if (link !== current || socket != null) return
        val url = current.origin.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/api/device-channel"
        socket = client.newWebSocket(request(current, "/api/device-channel").url(url).header("Origin", current.origin).build(), object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) { main.post {
                if (link !== current || socket !== ws) { ws.close(1000, "Connection changed"); return@post }
                ws.send(JSONObject().put("type", "hello").put("deviceId", current.id).put("name", current.name).put("after", revision)
                    .put("capabilities", JSONObject().put("clipboardText", true).put("clipboardImages", true).put("backgroundClipboard", defaultKeyboard()).put("keyboard", true)).toString())
            } }
            override fun onMessage(ws: WebSocket, text: String) { if (text.length > 2 * 1024 * 1024) return; val value = runCatching { JSONObject(text) }.getOrNull() ?: return
                main.post { if (link === current && socket === ws) receive(current, value) }
            }
            override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(code, reason) }
            override fun onClosed(ws: WebSocket, code: Int, reason: String) { main.post { lost(current, ws, code) } }
            override fun onFailure(ws: WebSocket, error: Throwable, response: Response?) { main.post { lost(current, ws, response?.code ?: 0) } }
        })
    }
    private fun lost(current: Link, ws: WebSocket, code: Int) {
        if (link !== current || socket !== ws) return
        socket = null; ready = false; pcTyping = false
        if (code in setOf(401, 403, 1008) || code == 1001) { disconnect("Your session ended. Open PC Remote to sign in."); return }
        notifyState("Waiting for your PC · reconnecting")
        val delay = minOf(30000L, 1000L shl minOf(reconnect++, 5))
        main.postDelayed({ if (link === current && socket == null) openSocket(current) }, delay)
    }
    private fun receive(current: Link, value: JSONObject) {
        when (value.optString("type")) {
            "connected" -> {
                if (value.optString("account") != current.account) { disconnect(); return }
                serverOffset = value.optLong("serverTime", System.currentTimeMillis()) - System.currentTimeMillis()
                reconnect = 0
            }
            "clipboard" -> {
                sharedEnabled = value.optBoolean("enabled", true)
                picturesEnabled = value.optBoolean("images", true)
                ready = true
                notifyState(if (sharedEnabled) "Connected · shared clipboard" else "Connected · clipboard paused")
                if (!sharedEnabled) { pending=null; return }
                val local = pending
                if (local != null && local.time + serverOffset > value.optLong("time")) { publish(current, local); return }
                pending = null
                if (!sharedEnabled || !value.optBoolean("changed") || value.optLong("revision") < revision) return
                revision = value.optLong("revision")
                if (value.optString("sourceId") == current.id || value.optString("id") == appliedId) return
                if (value.optString("kind") == "image") receivePicture(current, value) else apply(current, value)
            }
            "command" -> {
                val result = JSONObject().put("type", "reply").put("id", value.optString("id"))
                if (value.optString("action") == "keyboard-context") {
                    context(value.optJSONObject("payload")?.optString("page").orEmpty(), value.optJSONObject("payload")?.optBoolean("pcInput") == true)
                    result.put("ok", true).put("result", JSONObject().put("keyboard", defaultKeyboard()))
                } else result.put("ok", false).put("error", "This phone action is not available in this app version.")
                socket?.send(result.toString())
            }
        }
    }
    private fun receivePicture(current: Link, value: JSONObject) {
        if (!picturesEnabled) return
        val hash = value.optString("hash")
        if (!hash.matches(Regex("[a-f0-9]{64}"))) return
        val expectedRevision = value.optLong("revision")
        val localCopyAtStart = lastCopyTime
        worker.execute {
            val file = runCatching {
                client.newCall(request(current, "/api/clipboard/image/$hash").build()).execute().use { response ->
                    if (!response.isSuccessful) throw IllegalStateException()
                    val bytes = response.body!!.byteStream().use { readBounded(it, 20 * 1024 * 1024) }
                    if (hash(bytes) != hash) throw IllegalStateException()
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 24000000) throw IllegalStateException()
                    val dir = File(app.filesDir, "clips").apply { mkdirs() }
                    File(dir, "$hash.png").apply { writeBytes(bytes) }
                }
            }.getOrNull()
            main.post {
                if (link !== current || revision != expectedRevision || lastCopyTime != localCopyAtStart) return@post
                if (file == null) notifyState("Picture could not sync · copy it again to retry") else {
                    val uri = FileProvider.getUriForFile(app, "${app.packageName}.clipfiles", file)
                    applyClip(current, value, ClipData.newUri(app.contentResolver, "PC Remote picture", uri))
                }
            }
        }
    }
    private fun apply(current: Link, value: JSONObject) {
        val clip = when (value.optString("kind")) {
            "text" -> { val text = value.optString("text"); if (text.length > 250000) return; ClipData.newPlainText("PC Remote", text) }
            "empty" -> ClipData.newPlainText("PC Remote", "")
            else -> return
        }
        applyClip(current, value, clip)
    }
    private fun applyClip(current: Link, value: JSONObject, clip: ClipData) {
        if (link !== current || !sharedEnabled) return
        appliedId = value.optString("id"); appliedHash = value.optString("hash"); lastLocalHash = appliedHash
        suppressedClip = clip
        runCatching { clipboard.setPrimaryClip(clip) }.onFailure { notifyState("Android paused clipboard access · open PC Remote") }
    }
    fun captureClipboard() {
        if (!::app.isInitialized || link == null || !sharedEnabled || (!focused && !defaultKeyboard())) return
        val clip = runCatching { clipboard.primaryClip }.getOrNull() ?: return
        if (clip === suppressedClip) return
        val sensitive = clip.description.extras?.getBoolean("android.content.extra.IS_SENSITIVE", false) == true
        if (sensitive || clip.itemCount == 0) return
        val item = clip.getItemAt(0)
        val current = link ?: return
        val copiedAt = System.currentTimeMillis(); lastCopyTime = copiedAt
        val text = item.text?.toString()
        if (text != null) {
            if (text.length > 250000 || text.indexOf('\u0000') >= 0) return
            val kind = if (text.isEmpty()) "empty" else "text"
            localCopy(current, JSONObject().put("id", UUID.randomUUID()).put("kind", kind).put("text", text), hash("$kind:$text".toByteArray()), copiedAt)
        } else if (picturesEnabled && item.uri != null && clip.description.hasMimeType("image/*")) {
            val uri = item.uri
            if (uri.authority == "${app.packageName}.clipfiles" && uri.lastPathSegment == "$appliedHash.png") return
            worker.execute {
                val data = runCatching {
                    if (uri.scheme != "content") throw IllegalStateException()
                    val original = app.contentResolver.openInputStream(uri)!!.use { readBounded(it, 20 * 1024 * 1024) }
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 24000000) throw IllegalStateException()
                    val bitmap = BitmapFactory.decodeByteArray(original, 0, original.size) ?: throw IllegalStateException()
                    try { val out = LimitedBytes(20 * 1024 * 1024); if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) throw IllegalStateException(); out.toByteArray() } finally { bitmap.recycle() }
                }.getOrNull()
                main.post { if (link === current && copiedAt == lastCopyTime) {
                    if (data == null) notifyState("Copy a picture up to 20 MB to sync it") else localCopy(current, JSONObject().put("id", UUID.randomUUID()).put("kind", "image").put("data", Base64.encodeToString(data, Base64.NO_WRAP)), hash(data), copiedAt)
                } }
            }
        }
    }
    private fun localCopy(current: Link, value: JSONObject, hash: String, time: Long) {
        if (hash == appliedHash || hash == lastLocalHash || link !== current) return
        lastLocalHash = hash; appliedHash = ""
        val copy = Pending(value, time); pending = copy
        if (ready) publish(current, copy)
    }
    private fun publish(current: Link, copy: Pending) {
        if (pending !== copy || link !== current || publishing === copy) return
        publishing = copy
        worker.execute {
            var unauthorized = false
            val succeeded = runCatching {
                client.newCall(request(current, "/api/clipboard/current").post(copy.value.toString().toRequestBody("application/json".toMediaType())).build()).execute().use { response ->
                    unauthorized = response.code in setOf(401, 403)
                    if (!response.isSuccessful) throw IllegalStateException()
                    jsonBody(response, 2 * 1024 * 1024)
                }
            }.getOrNull()
            main.post {
                if (link !== current) return@post
                if (publishing === copy) publishing = null
                if (unauthorized) { disconnect("Sign in again to share your clipboard"); return@post }
                if (succeeded != null) {
                    if (pending === copy) pending = null
                    appliedId = copy.value.optString("id")
                    notifyState("Connected · clipboard synced")
                } else {
                    notifyState("Clipboard waiting for the PC")
                    main.postDelayed({ if (link === current && pending === copy && ready) publish(current, copy) }, 5000)
                }
            }
        }
    }
    fun input(commands: List<String>, done: ((Boolean) -> Unit)? = null) {
        val current = link
        if (!connected || current == null) { done?.invoke(false); return }
        inputWorker.execute {
            val ok = runCatching {
                val body = JSONObject().put("cmds", JSONArray(commands))
                client.newCall(request(current, "/api/input").post(body.toString().toRequestBody("application/json".toMediaType())).build()).execute().use { it.isSuccessful }
            }.getOrDefault(false)
            main.post { if (link === current) { if (!ok) notifyState("PC typing paused · check the connection"); done?.invoke(ok) } }
        }
    }
    private fun enqueue(commands: List<String>) {
        if (!connected || inputQueue.size + commands.size > 500) { notifyState("PC typing paused · check the connection"); return }
        inputQueue.addAll(commands)
        if (!inputScheduled && !inputBusy) { inputScheduled = true; main.postDelayed({ inputScheduled = false; flushInput() }, 16) }
    }
    private fun flushInput() {
        if (inputBusy || inputQueue.isEmpty() || !connected) return
        val commands = inputQueue.take(50); repeat(commands.size) { inputQueue.removeAt(0) }; inputBusy = true
        input(commands) { ok -> inputBusy = false; if (ok) flushInput() else inputQueue.clear() }
    }
    fun type(text: String) {
        val commands = ArrayList<String>(); val chunk = StringBuilder()
        for (point in text.codePoints().toArray()) {
            if (chunk.length >= 140) { commands.add("text " + Base64.encodeToString(chunk.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)); chunk.setLength(0) }
            chunk.appendCodePoint(point)
        }
        if (chunk.isNotEmpty()) commands.add("text " + Base64.encodeToString(chunk.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
        enqueue(commands)
    }
    fun key(code: Int) = enqueue(listOf("key $code"))
    fun shortcut(vararg codes: Int) = enqueue(listOf("combo " + codes.joinToString(",")))
    private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private fun readBounded(input: java.io.InputStream, limit: Int): ByteArray {
        val out = LimitedBytes(limit); val buffer = ByteArray(16384)
        while (true) { val count = input.read(buffer); if (count < 0) break; out.write(buffer, 0, count) }
        return out.toByteArray()
    }
    private class LimitedBytes(private val limit: Int) : ByteArrayOutputStream() {
        override fun write(bytes: ByteArray, offset: Int, length: Int) { if (count + length > limit) throw IllegalStateException("Clipboard item too large"); super.write(bytes, offset, length) }
        override fun write(value: Int) { if (count >= limit) throw IllegalStateException("Clipboard item too large"); super.write(value) }
    }
}
