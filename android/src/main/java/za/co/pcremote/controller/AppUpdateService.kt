package za.co.pcremote.controller

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class AppUpdateService:Service(){
    companion object { const val STOP="za.co.pcremote.controller.STOP_APP_UPDATE";@Volatile var events:((JSONObject)->Unit)?=null;@Volatile private var readyFile:File?=null;@Volatile private var readyOrigin="";fun ready(origin:String)=readyFile?.takeIf{origin==readyOrigin&&it.isFile} }
    private val main=Handler(Looper.getMainLooper())
    @Volatile private var cancelled=false
    @Volatile private var running=false
    @Volatile private var connection:HttpURLConnection?=null
    private var origin=""
    override fun onBind(intent:Intent?)=null
    private fun emit(message:String,ready:Boolean=false)=main.post{events?.invoke(JSONObject().put("origin",origin).put("message",message).put("ready",ready))}
    private fun notification(message:String,percent:Int?=null,ready:File?=null):Notification {
        val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("app-updates","App updates",NotificationManager.IMPORTANCE_LOW))
        val builder=Notification.Builder(this,"app-updates").setSmallIcon(R.drawable.ic_notification).setContentTitle("Elleson Connect update").setContentText(message).setOnlyAlertOnce(true).setOngoing(ready==null&&running)
        if(percent!=null)builder.setProgress(100,percent,false)
        if(ready!=null){val open=PendingIntent.getActivity(this,61,Intent(this,AppUpdateActivity::class.java).putExtra("file",ready.absolutePath),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);builder.setContentIntent(open).addAction(Notification.Action.Builder(null,"Install update",open).build()).setAutoCancel(true)}
        else if(running){val stop=PendingIntent.getService(this,62,Intent(this,AppUpdateService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);builder.addAction(Notification.Action.Builder(null,"Cancel",stop).build())}
        return builder.build()
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action==STOP){cancelled=true;connection?.disconnect();return START_NOT_STICKY}
        if(running)return START_NOT_STICKY
        val target=TrustedOrigin.normalize(intent?.getStringExtra("origin").orEmpty())?:run{stopSelf();return START_NOT_STICKY}
        val sha=intent?.getStringExtra("sha256").orEmpty().lowercase();val size=intent?.getLongExtra("size",0)?:0;val version=intent?.getStringExtra("version").orEmpty();val cookie=intent?.getStringExtra("cookie").orEmpty()
        if(!AppUpdatePolicy.valid(version,size,sha)||!cookie.contains("pc_remote_session=")){stopSelf();return START_NOT_STICKY}
        origin=target;running=true;cancelled=false
        val initial=notification("Preparing a verified update…")
        if(Build.VERSION.SDK_INT>=29)startForeground(461,initial,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)else startForeground(461,initial)
        Thread{
            val directory=File(cacheDir,"updates").apply{mkdirs()};val part=File(directory,"update.part");val file=File(directory,"Elleson-Connect-Android-$version.apk")
            try{
                val http=(URL(target+"/api/updates/android/download").openConnection() as HttpURLConnection).apply{connectTimeout=15000;readTimeout=120000;instanceFollowRedirects=false;setRequestProperty("Cookie",cookie);setRequestProperty("X-PCR","1")};connection=http
                require(http.responseCode==200){"The PC could not prepare this update. Check for updates again."}
                val hash=MessageDigest.getInstance("SHA-256");var received=0L;var last=0L
                http.inputStream.use{input->part.outputStream().use{output->val buffer=ByteArray(65536);while(true){if(cancelled)error("Update cancelled.");val count=input.read(buffer);if(count<0)break;received+=count;require(received<=size){"The update exceeded its published size."};hash.update(buffer,0,count);output.write(buffer,0,count);val now=SystemClock.elapsedRealtime();if(now-last>500){last=now;(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(461,notification("Downloading $version…",(received*100/size).toInt()))}}}}
                require(received==size&&hash.digest().joinToString(""){"%02x".format(it)}==sha){"The downloaded update failed verification. Please retry."}
                AppUpdateVerifier.verify(this,part)
                require(part.renameTo(file)){"The update could not be saved."}
                readyFile=file;readyOrigin=origin;running=false;stopForeground(STOP_FOREGROUND_DETACH);(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(461,notification("Version $version is ready. Tap to install.",ready=file));emit("Version $version is ready. Choose Install downloaded update or tap its notification.",true)
            }catch(error:Exception){part.delete();running=false;stopForeground(STOP_FOREGROUND_REMOVE);emit(error.message?:"The update did not finish.")}
            finally{connection?.disconnect();connection=null;stopSelf()}
        }.start()
        return START_NOT_STICKY
    }
}
