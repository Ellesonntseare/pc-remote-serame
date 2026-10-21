package za.co.pcremote.controller

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit
import kotlin.math.*

/** Explicit, temporary guest screen sharing. No microphone, saved recording,
 * boot receiver, accessibility access, or restart after process death. */
class ScreenShareService : Service() {
    companion object {
        const val STOP = "za.co.pcremote.controller.STOP_SHARING"
        @Volatile var events: ((JSONObject) -> Unit)? = null
        @Volatile private var live: ScreenShareService? = null
        fun forwardMark(mark: JSONObject) { live?.socket?.send(mark.toString()) }
        fun stopSharing() { live?.finish("Screen sharing stopped.") }
    }
    private val main = Handler(Looper.getMainLooper())
    private val workerThread = HandlerThread("GuestScreenCapture")
    private lateinit var worker: Handler
    private val client = OkHttpClient.Builder().pingInterval(15, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var pixels = ByteArray(0)
    private var cropped: Bitmap? = null
    private var imageWidth = 0
    private var imageHeight = 0
    private var lastFrame = 0L
    private var lastPreview = 0L
    @Volatile private var ending = false
    private var ready = false
    private var consent: Intent? = null
    private var consentCode = 0
    private var projectionCallback: MediaProjection.Callback? = null
    override fun onCreate() { super.onCreate(); workerThread.start(); worker = Handler(workerThread.looper); live = this }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null || intent.action == STOP) { finish("Screen sharing stopped."); return START_NOT_STICKY }
        if (socket != null) return START_NOT_STICKY
        val origin = intent.getStringExtra("origin")?.let(TrustedOrigin::normalize)
        val cookie = intent.getStringExtra("cookie")
        consent = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("consent", Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra("consent")
        consentCode = intent.getIntExtra("resultCode", 0)
        if (origin == null || cookie.isNullOrBlank() || !cookie.contains("pc_remote_session=") || consent == null || consentCode != Activity.RESULT_OK) {
            finish("Sign in as an approved guest before sharing."); return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("screen-sharing", "Screen sharing", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 1, Intent(this, ScreenShareService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "screen-sharing").setSmallIcon(R.drawable.ic_remote).setContentTitle("Sharing your phone screen")
            .setContentText("Visible to Serame until you stop sharing.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null, "Stop sharing", stop).build()).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(104, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(104, notification)
        val url = origin.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/api/guest-screen"
        val request = Request.Builder().url(url).header("Origin", origin).header("Cookie", cookie).build()
        emit(JSONObject().put("type", "starting"))
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (ending || text.length > 16000) return
                try {
                    val value = JSONObject(text)
                    when (value.optString("type")) {
                        "ready" -> if (value.optString("role") == "guest") webSocket.send("{\"type\":\"start\"}") else finish("Use an approved guest account to share this phone.")
                        "sharing" -> if (!ready) { ready = true; worker.post { beginProjection() } }
                        "mark" -> emit(value)
                    }
                } catch (_: Exception) { finish("Screen sharing could not start.") }
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null); finish("Access ended or the connection closed.") }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { finish("Screen sharing stopped.") }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { finish("Sharing disconnected. Open the app to try again.") }
        })
        main.postDelayed({ if (!ending && projection == null) finish("Screen sharing timed out. Try again.") }, 15000)
        return START_NOT_STICKY
    }
    private fun beginProjection() {
        if (ending) return
        try {
            val manager = getSystemService(MediaProjectionManager::class.java)
            val current = manager.getMediaProjection(consentCode, consent!!) ?: throw IllegalStateException("Permission unavailable")
            consent = null; projection = current
            projectionCallback = object : MediaProjection.Callback() {
                override fun onStop() { finish("Android stopped screen sharing.") }
                override fun onCapturedContentResize(width: Int, height: Int) { worker.post { if (!ending && display != null) resize(width, height) } }
            }
            current.registerCallback(projectionCallback!!, worker)
            val windowManager = getSystemService(WindowManager::class.java)
            val dimensions = if (Build.VERSION.SDK_INT >= 30) windowManager.maximumWindowMetrics.bounds.let { it.width() to it.height() } else {
                val metrics = DisplayMetrics(); @Suppress("DEPRECATION") windowManager.defaultDisplay.getRealMetrics(metrics); metrics.widthPixels to metrics.heightPixels
            }
            configureReader(dimensions.first, dimensions.second)
            display = current.createVirtualDisplay("PC Remote guest screen", imageWidth, imageHeight, resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader!!.surface, null, worker)
            emit(JSONObject().put("type", "sharing"))
        } catch (_: Exception) { finish("Android could not start sharing. Grant screen-sharing permission and try again.") }
    }
    private fun dimensions(width: Int, height: Int): Pair<Int, Int> {
        require(width > 0 && height > 0)
        val scale = min(1.0, 960.0 / max(width, height))
        return max(2, (width * scale).roundToInt() / 2 * 2) to max(2, (height * scale).roundToInt() / 2 * 2)
    }
    private fun configureReader(width: Int, height: Int) {
        val size = dimensions(width, height); imageWidth = size.first; imageHeight = size.second
        reader = ImageReader.newInstance(imageWidth, imageHeight, PixelFormat.RGBA_8888, 2).also { capture -> capture.setOnImageAvailableListener({ readFrame(it) }, worker) }
    }
    private fun resize(width: Int, height: Int) {
        if (dimensions(width, height) == (imageWidth to imageHeight)) return
        try {
            display?.surface = null; reader?.setOnImageAvailableListener(null, null); reader?.close(); cropped?.recycle(); cropped = null; pixels = ByteArray(0)
            configureReader(width, height); display?.resize(imageWidth, imageHeight, resources.displayMetrics.densityDpi); display?.surface = reader!!.surface
        } catch (_: Exception) { finish("Screen size changed. Start sharing again.") }
    }
    private fun readFrame(capture: ImageReader) {
        val image = try { capture.acquireLatestImage() } catch (_: Exception) { null } ?: return
        image.use {
            if (ending || socket == null || socket!!.queueSize() > 256 * 1024 || SystemClock.elapsedRealtime() - lastFrame < 166) return
            try {
                lastFrame = SystemClock.elapsedRealtime()
                val plane = image.planes[0]; if (plane.pixelStride != 4) return
                val rowBytes = imageWidth * 4
                if (pixels.size != rowBytes * imageHeight) pixels = ByteArray(rowBytes * imageHeight)
                for (row in 0 until imageHeight) { plane.buffer.position(row * plane.rowStride); plane.buffer.get(pixels, row * rowBytes, rowBytes) }
                if (cropped?.width != imageWidth || cropped?.height != imageHeight) { cropped?.recycle(); cropped = Bitmap.createBitmap(imageWidth, imageHeight, Bitmap.Config.ARGB_8888) }
                cropped!!.copyPixelsFromBuffer(java.nio.ByteBuffer.wrap(pixels))
                val bytes = ByteArrayOutputStream().use { output -> cropped!!.compress(Bitmap.CompressFormat.JPEG, 65, output); output.toByteArray() }
                if (bytes.size > 1024 * 1024) return
                socket?.send(bytes.toByteString())
                if (SystemClock.elapsedRealtime() - lastPreview >= 1000) { lastPreview = SystemClock.elapsedRealtime(); emit(JSONObject().put("type", "frame").put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("width", imageWidth).put("height", imageHeight)) }
            } catch (_: Exception) { finish("Phone capture stopped. Start sharing again.") }
        }
    }
    private fun emit(value: JSONObject) { main.post { events?.invoke(value) } }
    private fun finish(message: String) {
        if (ending) return
        ending = true; emit(JSONObject().put("type", "stopped").put("message", message)); main.post { stopSelf() }
    }
    override fun onTaskRemoved(rootIntent: Intent?) { finish("Screen sharing stopped."); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        ending = true; if (live === this) live = null
        socket?.send("{\"type\":\"stop\"}"); socket?.close(1000, "Sharing stopped"); socket = null
        worker.post {
            display?.release(); display = null; reader?.close(); reader = null
            projectionCallback?.let { projection?.unregisterCallback(it) }; projection?.stop(); projection = null
            cropped?.recycle(); pixels = ByteArray(0); workerThread.quitSafely()
        }
        client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy()
    }
}
