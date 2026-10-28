package za.co.pcremote.controller

import android.app.*
import android.content.Intent
import android.content.res.Configuration
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

/** Explicit screen sharing; phone input needs separate local session consent. */
class ScreenShareService : Service() {
    companion object {
        const val STOP = "za.co.pcremote.controller.STOP_SHARING"
        const val STOP_CONTROL = "za.co.pcremote.controller.STOP_CONTROL"
        @Volatile var events: ((JSONObject) -> Unit)? = null
        @Volatile var previewEnabled = true
        @Volatile private var live: ScreenShareService? = null
        fun forwardMark(mark: JSONObject) { live?.socket?.send(mark.toString()) }
        fun stopSharing() { live?.finish("Screen sharing stopped.") }
        fun stopPhoneControl() { live?.main?.post { live?.endControl() } }
        fun pendingControl(): String? = live?.pendingControlId
        fun respondControl(id: String, allow: Boolean) { live?.respond(id, allow) }
    }
    private val main = Handler(Looper.getMainLooper())
    private val workerThread = HandlerThread("GuestScreenCapture")
    private lateinit var worker: Handler
    private val client = OkHttpClient.Builder().pingInterval(15, TimeUnit.SECONDS).build()
    @Volatile private var socket: WebSocket? = null
    @Volatile private var networkReady=false
    private var connectionOrigin=""
    private var connectionCookie=""
    private var reconnectAttempt=0
    private var disconnectedAt=0L
    private val shareKey=java.util.UUID.randomUUID().toString().replace("-","")
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var pixels = ByteArray(0)
    private var cropped: Bitmap? = null
    private var imageWidth = 0
    private var imageHeight = 0
    private var lastFrame = 0L
    private var lastPreview = 0L
    @Volatile private var framesSent = 0L
    @Volatile private var ending = false
    private var ready = false
    private var consent: Intent? = null
    private var consentCode = 0
    private var projectionCallback: MediaProjection.Callback? = null
    private val controlPolicy = PhoneControlPolicy { SystemClock.elapsedRealtime() }
    private var pendingControlId: String? = null
    private var controlId: String? = null
    private var resumeProof=""
    private var resumeClientKey=""
    private var resumeUntil=0L
    private var pendingClientKey=""
    private var controlBusy = false
    @Volatile private var captureGeneration = 0
    @Volatile private var captureWidth = 0
    @Volatile private var captureHeight = 0
    private fun notification(): Notification {
        val stop = PendingIntent.getService(this,1,Intent(this,ScreenShareService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this,2,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title = if(!networkReady&&ready)"Phone sharing · reconnecting" else if (pendingControlId != null) "Phone control request — tap to review" else if (controlId != null) "Serame is controlling this phone" else "Sharing your phone screen"
        val builder=Notification.Builder(this,"screen-sharing").setSmallIcon(R.drawable.ic_remote).setContentTitle(title).setContentText("Entire screen is shared. You can stop anytime.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop sharing",stop).build())
        if (controlId != null || pendingControlId != null) {
            val stopControl=PendingIntent.getService(this,3,Intent(this,ScreenShareService::class.java).setAction(STOP_CONTROL),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(Notification.Action.Builder(null,"Stop control",stopControl).build())
        }
        return builder.build()
    }
    private fun updateNotification() { if (!ending) getSystemService(NotificationManager::class.java).notify(104,notification()) }
    private fun endControl(notifyServer: Boolean = true, keepResume:Boolean=false) {
        PhoneControlService.instance?.releaseInput()
        if(!keepResume){resumeProof="";resumeClientKey="";resumeUntil=0}
        pendingControlId=null;controlId=null;controlPolicy.revoke();controlBusy=false
        if(notifyServer)socket?.send("{\"type\":\"control-stop\"}")
        emit(JSONObject().put("type","control-state").put("state","off"));updateNotification()
    }
    private fun respond(id: String, allow: Boolean, resuming:Boolean=false) {
        if (ending || pendingControlId != id || display == null) return
        val approved=allow && PhoneControlService.instance != null
        pendingControlId=null
        val duration=if(resuming)(resumeUntil-SystemClock.elapsedRealtime()).coerceIn(1,600000)else 600000L
        if(approved){controlId=id;controlPolicy.grant(id,duration);resumeUntil=SystemClock.elapsedRealtime()+duration;resumeClientKey=pendingClientKey;resumeProof=java.util.UUID.randomUUID().toString().replace("-","");main.postDelayed({ if(controlId==id)endControl() },duration)}
        socket?.send(JSONObject().put("type","control-response").put("id",id).put("approved",approved).put("expiresIn",duration).apply{if(approved&&resumeClientKey.isNotEmpty())put("resumeProof",resumeProof)}.toString());updateNotification()
    }
    private fun controlMessage(value: JSONObject) {
        when(value.optString("type")) {
            "control-request" -> {
                val id=value.optString("id");if(!Regex("^[a-f0-9]{32}$").matches(id)||controlId!=null||pendingControlId!=null||display==null)return
                pendingControlId=id;pendingClientKey=value.optString("clientKey").takeIf{Regex("^[a-f0-9]{32}$").matches(it)}?:""
                val proof=value.optString("resumeProof")
                if(proof.isNotEmpty()){
                    if(proof==resumeProof&&pendingClientKey==resumeClientKey&&resumeUntil>SystemClock.elapsedRealtime())respond(id,true,true)else respond(id,false)
                }else{updateNotification();emit(value);main.postDelayed({if(pendingControlId==id){respond(id,false);endControl(false)}},120000)}
            }
            "control-state" -> {if(value.optString("state")!="active"||value.optString("id")!=controlId)endControl(false,value.optBoolean("reconnect")) else emit(value)}
            "control", "pointer" -> {
                val id=value.optString("id");val seq=value.optLong("seq",-1);val generation=value.optInt("generation",-1)
                val payload=value.optJSONObject("command")?:return;val points=payload.optJSONArray("points")
                val command=PhoneCommand(payload.optString("action"),if(points==null)emptyList() else (0 until points.length()).map { val p=points.getJSONObject(it);PhonePoint(p.getDouble("x"),p.getDouble("y")) },payload.optInt("duration",0),payload.optString("text",""),payload.optString("key",""),payload.optInt("modifiers",0))
                val pointerMessage=value.optString("type")=="pointer"
                if(pointerMessage != (command.action in listOf("pointer","hide-pointer")))return
                fun result(ok: Boolean,message: String){socket?.send(JSONObject().put("type","control-result").put("id",id).put("seq",seq).put("ok",ok).put("message",message).toString())}
                val input=PhoneControlService.instance
                if(ending||!networkReady||(!pointerMessage&&controlBusy)||id!=controlId||input==null||!controlPolicy.accept(id,seq,generation,captureGeneration,command)){if(!pointerMessage)result(false,"Phone control is unavailable or the display changed.");return}
                if(pointerMessage){input.perform(command,captureWidth,captureHeight,{!ending&&controlId==id&&controlPolicy.active(id)&&captureGeneration==generation}){_,_->};return}
                controlBusy=true
                input.perform(command,captureWidth,captureHeight,{!ending&&controlId==id&&controlPolicy.active(id)&&captureGeneration==generation}){ok,message->controlBusy=false;result(ok,message)}
            }
        }
    }
    override fun onCreate() { super.onCreate(); workerThread.start(); worker = Handler(workerThread.looper); live = this }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP_CONTROL) { endControl(); return START_NOT_STICKY }
        if (intent == null || intent.action == STOP) { finish("Screen sharing stopped."); return START_NOT_STICKY }
        if (socket != null) return START_NOT_STICKY
        val origin = intent.getStringExtra("origin")?.let(TrustedOrigin::normalize)
        val cookie = intent.getStringExtra("cookie")
        consent = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("consent", Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra("consent")
        consentCode = intent.getIntExtra("resultCode", 0)
        if (origin == null || cookie.isNullOrBlank() || !cookie.contains("pc_remote_session=") || consent == null || consentCode != Activity.RESULT_OK) {
            finish("Sign in before sharing your phone."); return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("screen-sharing", "Screen sharing", NotificationManager.IMPORTANCE_LOW))
        val notification = notification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(104, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(104, notification)
        connectionOrigin=origin;connectionCookie=cookie
        emit(JSONObject().put("type", "starting"))
        openSocket()
        main.postDelayed({ if (!ending && projection == null) finish("Screen sharing timed out. Try again.") }, 30000)
        return START_NOT_STICKY
    }
    private fun openSocket(){
        if(ending||socket!=null)return
        val url=connectionOrigin.replaceFirst("https://","wss://").replaceFirst("http://","ws://")+"/api/guest-screen"
        val request=Request.Builder().url(url).header("Origin",connectionOrigin).header("Cookie",connectionCookie).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (ending || webSocket!==socket || text.length > 16000) return
                try {
                    val value = JSONObject(text)
                    when (value.optString("type")) {
                        "ready" -> if (value.optString("role") in listOf("guest","owner")) webSocket.send(JSONObject().put("type","start").put("controlSupported",true).put("mouseSupported",true).put("advancedInput",true).put("shareKey",shareKey).put("deviceId",getSharedPreferences("pc_remote_android",MODE_PRIVATE).getString("syncDeviceId","")).put("device",getSharedPreferences("pc_remote_android",MODE_PRIVATE).getString("deviceName","")?.takeIf{it.isNotBlank()} ?: "${Build.MANUFACTURER} ${Build.MODEL}").toString()) else finish("Sign in before sharing this phone.")
                        "sharing" -> {networkReady=true;reconnectAttempt=0;disconnectedAt=0;if (!ready) { ready = true; worker.post { beginProjection() } }else worker.post{if(!ending&&captureWidth>0){sendCapture();emit(JSONObject().put("type","sharing"))}};main.post{updateNotification()};PhoneFileReceiver.collect(this@ScreenShareService,connectionOrigin,connectionCookie)}
                        "file-offer" -> value.optJSONArray("offers")?.let{PhoneFileReceiver.offer(this@ScreenShareService,connectionOrigin,connectionCookie,it){message->emit(JSONObject().put("type","file-transfer").put("message",message))}}
                        "mark" -> emit(value)
                        "control-request", "control-state", "control", "pointer" -> main.post { try { controlMessage(value) } catch (_: Exception) { endControl() } }
                    }
                } catch (_: Exception) { finish("Screen sharing could not start.") }
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null);main.post{lost(webSocket,code)} }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { main.post{lost(webSocket,code)} }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { main.post{lost(webSocket,response?.code?:0)} }
        })
    }
    private fun lost(channel:WebSocket,code:Int){
        if(ending||socket!==channel)return
        socket=null;networkReady=false;channel.cancel();endControl(false,true)
        if(code in setOf(1000,1001,1008,401,403)){finish("Sharing access ended. Sign in and share again.");return}
        if(disconnectedAt==0L)disconnectedAt=SystemClock.elapsedRealtime()
        if(SystemClock.elapsedRealtime()-disconnectedAt>300000){finish("PC unavailable for five minutes. Share again when it reconnects.");return}
        emit(JSONObject().put("type","reconnecting").put("message","Waiting for your PC · screen sharing will reconnect automatically."));updateNotification()
        val delay=minOf(15000L,500L shl minOf(reconnectAttempt++,5))
        main.postDelayed({if(!ending&&socket==null)openSocket()},delay)
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
            val dimensions = screenDimensions()
            configureReader(dimensions.first, dimensions.second)
            display = current.createVirtualDisplay("PC Remote guest screen", imageWidth, imageHeight, resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader!!.surface, null, worker)
            emit(JSONObject().put("type", "sharing"))
            main.postDelayed({ if (!ending && framesSent == 0L) finish("No screen frames arrived. Stop sharing and approve the entire screen again.") }, 10000)
        } catch (_: Exception) { finish("Android could not start sharing. Grant screen-sharing permission and try again.") }
    }
    private fun screenDimensions(): Pair<Int, Int> {
        val windowManager = getSystemService(WindowManager::class.java)
        return if (Build.VERSION.SDK_INT >= 30) windowManager.maximumWindowMetrics.bounds.let { it.width() to it.height() } else {
            val metrics = DisplayMetrics(); @Suppress("DEPRECATION") windowManager.defaultDisplay.getRealMetrics(metrics); metrics.widthPixels to metrics.heightPixels
        }
    }
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Before Android 14 there is no captured-content resize callback.
        if (Build.VERSION.SDK_INT < 34) worker.post {
            if (!ending && display != null) { val size = screenDimensions(); resize(size.first, size.second) }
        }
    }
    private fun dimensions(width: Int, height: Int): Pair<Int, Int> {
        require(width > 0 && height > 0)
        val scale = min(1.0, 960.0 / max(width, height))
        return max(2, (width * scale).roundToInt() / 2 * 2) to max(2, (height * scale).roundToInt() / 2 * 2)
    }
    private fun configureReader(width: Int, height: Int) {
        main.post { PhoneControlService.instance?.releaseInput() }
        captureWidth=width;captureHeight=height;captureGeneration++
        sendCapture()
        val size = dimensions(width, height); imageWidth = size.first; imageHeight = size.second
        reader = ImageReader.newInstance(imageWidth, imageHeight, PixelFormat.RGBA_8888, 2).also { capture -> capture.setOnImageAvailableListener({ readFrame(it) }, worker) }
    }
    private fun sendCapture(){socket?.send(JSONObject().put("type","capture").put("generation",captureGeneration).put("width",captureWidth).put("height",captureHeight).toString())}
    private fun resize(width: Int, height: Int) {
        if (width == captureWidth && height == captureHeight) return
        try {
            display?.surface = null; reader?.setOnImageAvailableListener(null, null); reader?.close(); cropped?.recycle(); cropped = null; pixels = ByteArray(0)
            configureReader(width, height); display?.resize(imageWidth, imageHeight, resources.displayMetrics.densityDpi); display?.surface = reader!!.surface
        } catch (_: Exception) { finish("Screen size changed. Start sharing again.") }
    }
    private fun readFrame(capture: ImageReader) {
        val image = try { capture.acquireLatestImage() } catch (_: Exception) { null } ?: return
        image.use {
            if (ending || !networkReady || socket == null || socket!!.queueSize() > 256 * 1024 || SystemClock.elapsedRealtime() - lastFrame < 100) return
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
                val channel=socket?:return
                if (!channel.send(bytes.toByteString())) { main.post{lost(channel,0)}; return }
                framesSent++
                if (previewEnabled && SystemClock.elapsedRealtime() - lastPreview >= 1000) { lastPreview = SystemClock.elapsedRealtime(); emit(JSONObject().put("type", "frame").put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("width", imageWidth).put("height", imageHeight)) }
            } catch (_: Exception) { finish("Phone capture stopped. Start sharing again.") }
        }
    }
    private fun emit(value: JSONObject) { main.post { events?.invoke(value) } }
    private fun finish(message: String) {
        if (ending) return
        ending = true; main.post { endControl();emit(JSONObject().put("type", "stopped").put("message", message));stopSelf() }
    }
    override fun onTaskRemoved(rootIntent: Intent?) { finish("Screen sharing stopped."); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        endControl()
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
