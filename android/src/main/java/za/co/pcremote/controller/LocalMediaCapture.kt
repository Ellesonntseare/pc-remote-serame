package za.co.pcremote.controller

import android.annotation.SuppressLint
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.graphics.YuvImage
import android.hardware.Camera
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Foreground-only fallback for a private HTTP WebView. One frame/audio block
 * may be outstanding at a time; a busy WebView drops capture instead of queuing. */
@Suppress("DEPRECATION")
class LocalMediaCapture(private val emit:(JSONObject)->Unit) {
    private val worker=HandlerThread("PCRemoteLocalMedia").apply{start()}
    private val handler=Handler(worker.looper)
    @Volatile private var active=false
    @Volatile private var frameCredit=true
    @Volatile private var audioCredit=true
    private var camera:Camera?=null
    private var texture:SurfaceTexture?=null
    private var recorder:AudioRecord?=null
    private var audioThread:Thread?=null
    @Volatile private var generation=0
    fun credit(kind:String){if(kind=="frame")frameCredit=true else if(kind=="audio")audioCredit=true}
    private fun message(kind:String)=JSONObject().put("kind",kind)
    @SuppressLint("MissingPermission")
    fun start(video:Boolean,audio:Boolean,front:Boolean,displayDegrees:Int){
        stop();val version=++generation;active=true;frameCredit=true;audioCredit=true
        handler.post{
            if(!active||version!=generation)return@post
            try{
                if(video){
                    var id=-1;val info=Camera.CameraInfo()
                    for(index in 0 until Camera.getNumberOfCameras()){Camera.getCameraInfo(index,info);if(info.facing==if(front)Camera.CameraInfo.CAMERA_FACING_FRONT else Camera.CameraInfo.CAMERA_FACING_BACK){id=index;break}}
                    if(id<0){if(Camera.getNumberOfCameras()==0)throw IllegalStateException("No phone camera is available.");id=0}
                    Camera.getCameraInfo(id,info)
                    val rotation=if(info.facing==Camera.CameraInfo.CAMERA_FACING_FRONT)(360-(info.orientation+displayDegrees)%360)%360 else (info.orientation-displayDegrees+360)%360
                    val opened=Camera.open(id);camera=opened
                    val params=opened.parameters
                    val size=params.supportedPreviewSizes.filter{it.width<=960&&it.height<=720}.maxByOrNull{it.width*it.height}?:params.supportedPreviewSizes.minByOrNull{it.width*it.height}?:throw IllegalStateException("Camera preview is unavailable.")
                    params.setPreviewSize(size.width,size.height);params.previewFormat=ImageFormat.NV21
                    params.supportedPreviewFpsRange?.minByOrNull{kotlin.math.abs(it[1]-15000)}?.let{params.setPreviewFpsRange(it[0],it[1])}
                    opened.parameters=params
                    texture=SurfaceTexture(0);opened.setPreviewTexture(texture)
                    var lastFrame=0L
                    opened.setPreviewCallbackWithBuffer{bytes,source->
                        try{
                            val now=SystemClock.elapsedRealtime()
                            if(active&&version==generation&&frameCredit&&now-lastFrame>=83){
                                lastFrame=now;frameCredit=false
                                val output=ByteArrayOutputStream();YuvImage(bytes,ImageFormat.NV21,size.width,size.height,null).compressToJpeg(Rect(0,0,size.width,size.height),65,output)
                                emit(message("frame").put("data",Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)).put("rotation",rotation))
                            }
                        }catch(_:Exception){frameCredit=true}finally{if(active&&version==generation)runCatching{source.addCallbackBuffer(bytes)}}
                    }
                    repeat(3){opened.addCallbackBuffer(ByteArray(size.width*size.height*3/2))};opened.startPreview()
                }
                if(audio){
                    val rate=16000;val minimum=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
                    if(minimum<=0)throw IllegalStateException("Microphone capture is unavailable.")
                    val input=AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(minimum*2,6400));recorder=input
                    if(!active||version!=generation){input.release();if(recorder===input)recorder=null;return@post}
                    if(input.state!=AudioRecord.STATE_INITIALIZED)throw IllegalStateException("The microphone is unavailable or in use.")
                    input.startRecording()
                    audioThread=Thread{
                        val samples=ShortArray(1600)
                        try{while(active&&version==generation){
                            val count=runCatching{input.read(samples,0,samples.size)}.getOrDefault(-1);if(count<=0)break
                            if(audioCredit){audioCredit=false;val data=ByteBuffer.allocate(count*2).order(ByteOrder.LITTLE_ENDIAN);for(index in 0 until count)data.putShort(samples[index]);emit(message("audio").put("data",Base64.encodeToString(data.array(),Base64.NO_WRAP)).put("rate",rate))}
                        }}finally{runCatching{input.stop()};runCatching{input.release()};if(recorder===input)recorder=null}
                    }.apply{name="PCRemoteMicrophone";start()}
                }
                if(active&&version==generation)emit(message("started"))
            }catch(error:Exception){emit(message("error").put("message",error.message?:"Could not open the phone camera or microphone."));stop()}
        }
    }
    fun stop(){
        val wasActive=active;active=false;generation++
        val input=recorder;recorder=null;runCatching{input?.stop()}
        // Wait briefly before releasing AudioRecord so its read cannot outlive it.
        val oldAudio=audioThread;audioThread=null;if(oldAudio!==Thread.currentThread())runCatching{oldAudio?.join(250)};runCatching{input?.release()}
        handler.post{runCatching{camera?.setPreviewCallbackWithBuffer(null);camera?.stopPreview();camera?.release()};camera=null;texture?.release();texture=null}
        if(wasActive)emit(message("stopped"))
    }
    fun close(){stop();handler.post{worker.quitSafely()}}
}
