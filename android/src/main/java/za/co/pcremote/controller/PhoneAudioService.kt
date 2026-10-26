package za.co.pcremote.controller

import android.Manifest
import android.annotation.SuppressLint
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

/** Explicit, audio-only phone capture; an ongoing notification owns Stop. */
class PhoneAudioService:Service(){
    companion object{
        const val STOP="za.co.pcremote.controller.STOP_PHONE_AUDIO"
        @Volatile var events:((JSONObject)->Unit)?=null
        @Volatile private var live:PhoneAudioService?=null
        fun stop(){live?.finish("Audio streaming stopped.")}
        fun control(volume:Double,muted:Boolean){live?.apply{if(volume.isFinite())level=volume.coerceIn(0.0,1.0);this.muted=muted;socket?.send(JSONObject().put("type","volume").put("value",if(muted)0.0 else level).toString());state()}}
        fun status(){live?.state()}
        fun stopThen(callback:(Boolean)->Unit){
            stop();val handler=Handler(Looper.getMainLooper());val until=SystemClock.elapsedRealtime()+2000
            fun check(){if(live==null)callback(true)else if(SystemClock.elapsedRealtime()>=until)callback(false)else handler.postDelayed({check()},25)}
            check()
        }
    }
    private val main=Handler(Looper.getMainLooper())
    private val client=OkHttpClient.Builder().pingInterval(15,TimeUnit.SECONDS).build()
    @Volatile private var ending=false
    @Volatile private var muted=false
    @Volatile private var level=.6
    private var source="microphone"
    private var origin=""
    private var channels=1
    private var socket:WebSocket?=null
    private var projection:MediaProjection?=null
    private var recorder:AudioRecord?=null
    private var encoder:MediaCodec?=null
    private var encoding="s16le"
    private var presentationUs=0L
    private var worker:Thread?=null
    private var consent:Intent?=null
    private var consentCode=0
    @Volatile private var streaming=false
    private var endMessage="Audio streaming stopped."
    private fun emit(value:JSONObject){value.put("origin",origin);if(Looper.myLooper()==Looper.getMainLooper())events?.invoke(value) else main.post{events?.invoke(value)}}
    private fun state(){emit(JSONObject().put("state",if(streaming)"streaming" else "connecting").put("source",source).put("muted",muted).put("volume",level).put("encoding",encoding))}
    override fun onBind(intent:Intent?)=null
    override fun onCreate(){super.onCreate();live=this}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        if(intent==null||intent.action==STOP){finish("Audio streaming stopped.");return START_NOT_STICKY}
        if(socket!=null)return START_NOT_STICKY
        origin=intent.getStringExtra("origin")?.let(TrustedOrigin::normalize).orEmpty();val cookie=intent.getStringExtra("cookie").orEmpty()
        source=if(intent.getStringExtra("source")=="playback")"playback" else "microphone";channels=if(source=="playback")2 else 1
        level=intent.getDoubleExtra("volume",.6).let{if(it.isFinite())it.coerceIn(0.0,1.0)else .6}
        if(origin.isEmpty()||!cookie.contains("pc_remote_session=")){finish("Sign in and pair your PC before sending audio.");return START_NOT_STICKY}
        if(source=="playback"&&Build.VERSION.SDK_INT<29){finish("Phone audio capture needs Android 10 or newer.");return START_NOT_STICKY}
        consent=if(Build.VERSION.SDK_INT>=33)intent.getParcelableExtra("consent",Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra("consent")
        consentCode=intent.getIntExtra("resultCode",0)
        if(source=="playback"&&(consent==null||consentCode!=Activity.RESULT_OK)){finish("Android audio-sharing permission is required.");return START_NOT_STICKY}
        try{
            if(intent.getBooleanExtra("compressed",true))prepareEncoder()
            val manager=getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("phone-audio","Audio to PC",NotificationManager.IMPORTANCE_LOW))
            val stop=PendingIntent.getService(this,11,Intent(this,PhoneAudioService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val open=PendingIntent.getActivity(this,12,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification=Notification.Builder(this,"phone-audio").setSmallIcon(R.drawable.ic_remote).setContentTitle(if(source=="playback")"Phone audio → PC" else "Microphone → PC").setContentText("Streaming audio only. Tap to return to controls.").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build()
            if(source=="playback"&&Build.VERSION.SDK_INT>=29)startForeground(109,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            else if(Build.VERSION.SDK_INT>=30)startForeground(109,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else if(Build.VERSION.SDK_INT>=29)startForeground(109,notification,0)
            else startForeground(109,notification)
            val url=origin.replaceFirst("https://","wss://").replaceFirst("http://","ws://")+"/api/phone-audio"
            state();socket=client.newWebSocket(Request.Builder().url(url).header("Origin",origin).header("Cookie",cookie).build(),object:WebSocketListener(){
                override fun onMessage(webSocket:WebSocket,text:String){
                    if(ending||text.length>4096)return
                    try{val value=JSONObject(text);when(value.optString("type")){
                        "ready"->webSocket.send(JSONObject().put("type","format").put("source",source).put("encoding",encoding).put("sampleRate",48000).put("channels",channels).toString())
                        "started"->if(worker==null){streaming=true;state();webSocket.send(JSONObject().put("type","volume").put("value",level).toString());worker=Thread{capture()}.apply{name="PCRemotePhoneAudio";start()}}
                        "error"->finish(value.optString("error","PC audio could not start."))
                    }}catch(_:Exception){finish("The audio connection could not be started.")}
                }
                override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null);finish("PC audio access ended.")}
                override fun onClosed(webSocket:WebSocket,code:Int,reason:String){finish("Audio streaming stopped.")}
                override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?){finish("Audio disconnected. Open the app and try again.")}
            })
            main.postDelayed({if(!ending&&!streaming)finish("The PC did not start audio playback. Check the host and reconnect.")},12000)
        }catch(_:Exception){finish("Android could not start audio sharing. Check microphone permission and try again.")}
        return START_NOT_STICKY
    }
    @SuppressLint("MissingPermission")
    private fun capture(){
        var ownedInput:AudioRecord?=null
        try{
            val mask=if(channels==2)AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
            val minimum=AudioRecord.getMinBufferSize(48000,mask,AudioFormat.ENCODING_PCM_16BIT);if(minimum<=0)throw IllegalStateException()
            val format=AudioFormat.Builder().setSampleRate(48000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(mask).build()
            val builder=AudioRecord.Builder().setAudioFormat(format).setBufferSizeInBytes(maxOf(minimum*2,19200))
            if(source=="playback"&&Build.VERSION.SDK_INT>=29){
                val selected=getSystemService(MediaProjectionManager::class.java).getMediaProjection(consentCode,consent!!);projection=selected
                selected.registerCallback(object:MediaProjection.Callback(){override fun onStop(){finish("Android stopped phone audio sharing.")}},main)
                builder.setAudioPlaybackCaptureConfig(AudioPlaybackCaptureConfiguration.Builder(selected).addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME).addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build())
            }else builder.setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            val input=builder.build();ownedInput=input;recorder=input;if(input.state!=AudioRecord.STATE_INITIALIZED)throw IllegalStateException()
            if(ending)return;input.startRecording();val samples=ByteArray(960*channels*2);var lastLevel=0L
            while(!ending){
                val count=input.read(samples,0,samples.size,AudioRecord.READ_BLOCKING);if(count<=0){if(!ending)finish("Phone audio capture stopped. Check the microphone or selected app.");break}
                val bytes=samples.copyOf(count);if(muted)bytes.fill(0)
                if(encoding=="opus")encode(bytes)else if((socket?.queueSize()?:0)<24000&&socket?.send(bytes.toByteString())!=true){finish("Audio disconnected.");break}
                val now=SystemClock.elapsedRealtime();if(now-lastLevel>=250){lastLevel=now;var sum=0.0;for(i in 0 until count-1 step 2){val value=((bytes[i].toInt() and 255) or (bytes[i+1].toInt() shl 8)).toShort().toDouble()/32768.0;sum+=value*value};emit(JSONObject().put("state","streaming").put("source",source).put("muted",muted).put("volume",level).put("level",sqrt(sum/(count/2)).coerceIn(0.0,1.0)))}
            }
        }catch(_:Exception){if(!ending)finish(if(source=="playback")"This phone or app could not provide playback audio. Some apps block sharing." else "The microphone is unavailable. Close other microphone apps and retry.")}
        finally{runCatching{ownedInput?.stop()};runCatching{ownedInput?.release()};if(recorder===ownedInput)recorder=null;releaseEncoder()}
    }
    private fun prepareEncoder(){
        var candidate:MediaCodec?=null
        try{candidate=MediaCodec.createEncoderByType("audio/opus");val format=MediaFormat.createAudioFormat("audio/opus",48000,channels);format.setInteger(MediaFormat.KEY_BIT_RATE,if(channels==1)32000 else 96000);format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE,960*channels*2);candidate.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);candidate.start();encoder=candidate;encoding="opus"}catch(_:Exception){runCatching{candidate?.release()};encoder=null;encoding="s16le"}
    }
    private fun encode(bytes:ByteArray){
        val codec=encoder?:return;val index=codec.dequeueInputBuffer(20000)
        if(index>=0){val input=codec.getInputBuffer(index)?:throw IllegalStateException();input.clear();input.put(bytes);codec.queueInputBuffer(index,0,bytes.size,presentationUs,0);presentationUs+=bytes.size*1000000L/(48000*channels*2)}
        val info=MediaCodec.BufferInfo()
        while(!ending){val output=codec.dequeueOutputBuffer(info,0);if(output==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED)continue;if(output<0)break
            try{if(info.size>0&&info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG==0){val buffer=codec.getOutputBuffer(output)?:throw IllegalStateException();buffer.position(info.offset);buffer.limit(info.offset+info.size);val packet=ByteArray(info.size);buffer.get(packet);if(packet.size>4096)throw IllegalStateException();if((socket?.queueSize()?:0)<12000&&socket?.send(packet.toByteString())!=true)throw IllegalStateException()}}finally{codec.releaseOutputBuffer(output,false)}
        }
    }
    private fun releaseEncoder(){val codec=encoder;encoder=null;runCatching{codec?.stop()};runCatching{codec?.release()}}
    @Synchronized private fun finish(message:String){if(ending)return;ending=true;endMessage=message;main.post{emit(JSONObject().put("state","stopping").put("source",source));stopSelf()}}
    override fun onTaskRemoved(rootIntent:Intent?){finish("Audio streaming stopped.");super.onTaskRemoved(rootIntent)}
    override fun onDestroy(){
        ending=true;streaming=false;runCatching{recorder?.stop()};runCatching{worker?.join(500)};if(worker==null)releaseEncoder();runCatching{projection?.stop()};projection=null;socket?.close(1000,"Audio stopped");socket=null;client.dispatcher.executorService.shutdown();client.connectionPool.evictAll();main.removeCallbacksAndMessages(null);if(live===this)live=null;emit(JSONObject().put("state","stopped").put("message",endMessage).put("source",source));stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
    }
}
