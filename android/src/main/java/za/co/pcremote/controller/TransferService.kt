package za.co.pcremote.controller

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.*
import android.provider.OpenableColumns
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

/** The service, rather than the Activity/WebView, owns each transfer. No cookies are persisted. */
class TransferService : Service() {
    companion object {
        fun completedDownload(context:Context,origin:String,id:String):JSONObject? {
            if(TrustedOrigin.normalize(origin)!=origin||!id.matches(Regex("[a-fA-F0-9-]{36}")))return null
            val rows=runCatching{live?.synchronizedSnapshot()?:JSONArray(File(context.filesDir,"transfer-queue.json").readText())}.getOrDefault(JSONArray())
            for(i in 0 until rows.length()){val row=rows.getJSONObject(i);if(row.optString("id")==id&&row.optString("origin")==origin&&row.optString("direction")=="download"&&row.optString("state")=="complete"&&Uri.parse(row.optString("uri")).scheme=="content")return row}
            return null
        }
        private var live: TransferService? = null
        var events: ((JSONObject) -> Unit)? = null
        const val ADD = "pcr.transfer.ADD"
        const val CONTROL = "pcr.transfer.CONTROL"
        fun snapshot(context: Context, origin: String): JSONObject {
            val source=live?.synchronizedSnapshot() ?: runCatching { JSONArray(File(context.filesDir,"transfer-queue.json").readText()) }.getOrDefault(JSONArray())
            val rows=JSONArray()
            for(i in 0 until source.length()) { val row=source.getJSONObject(i);if(row.optString("origin")==origin) {
                rows.put(JSONObject().put("id",row.optString("id")).put("name",row.optString("name")).put("direction",row.optString("direction")).put("state",if(live==null&&row.optString("state") in listOf("queued","running","saving"))"paused" else row.optString("state")).put("received",row.optLong("transferred",row.optLong("received"))).put("size",row.optLong("size")).put("message",row.optString("message")).put("pcName",row.optString("pcName")).put("conflictingETag",row.optString("conflictingETag")))
            }}
            return JSONObject().put("origin",origin).put("tasks",rows)
        }
        fun stopOrigin(context: Context, origin: String) {
            val running=live;if(running!=null){running.cancelOrigin(origin);return}
            runCatching{val file=File(context.filesDir,"transfer-queue.json");val old=JSONArray(file.readText());val retained=JSONArray();for(i in 0 until old.length()){val row=old.getJSONObject(i);if(row.optString("origin")!=origin)retained.put(row)else File(context.filesDir,"transfer-"+row.optString("id")+".part").delete()};val atomic=android.util.AtomicFile(file);val out=atomic.startWrite();try{out.write(retained.toString().toByteArray());atomic.finishWrite(out)}catch(e:Exception){atomic.failWrite(out)}}
        }
    }
    private val tasks=mutableListOf<JSONObject>()
    private val cookies=mutableMapOf<String,String>()
    private val lock=Object()
    private var working=false
    @Volatile private var activeId=""
    @Volatile private var activeCall:Call?=null
    private var lastNotice=0L
    private var wake:PowerManager.WakeLock?=null
    private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(15,TimeUnit.SECONDS).readTimeout(45,TimeUnit.SECONDS).writeTimeout(120,TimeUnit.SECONDS).build()
    override fun onBind(intent:Intent?)=null
    override fun onCreate() {
        super.onCreate();live=this
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("transfers","File transfers",NotificationManager.IMPORTANCE_LOW))
        val saved=runCatching{JSONArray(File(filesDir,"transfer-queue.json").readText())}.getOrDefault(JSONArray())
        for(i in 0 until saved.length().coerceAtMost(200)) { val row=saved.optJSONObject(i)?:continue;row.put("state",if(row.optString("state") in listOf("running","queued","saving"))"paused" else row.optString("state"));tasks.add(row) }
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        // Called immediately, including notification actions, before starting any disk/network work.
        if(Build.VERSION.SDK_INT>=29)startForeground(119,notification(null),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)else startForeground(119,notification(null))
        val origin=TrustedOrigin.normalize(intent?.getStringExtra("origin").orEmpty())
        if(origin!=null)intent?.getStringExtra("cookie")?.takeIf{it.contains("pc_remote_session=")}?.let{cookies[origin]=it}
        synchronized(lock) {
            if(intent?.action==ADD&&origin!=null&&cookies.containsKey(origin)) {
                val items=runCatching{JSONArray(intent.getStringExtra("items"))}.getOrDefault(JSONArray())
                // Keep completed rows bounded; do not discard paused/running transfers.
                tasks.removeAll{it.optString("state") in listOf("complete","cancelled")&&tasks.size>=100}
                for(i in 0 until items.length().coerceAtMost(200-tasks.size)) {
                    val item=items.optJSONObject(i)?:continue
                    val direction=item.optString("direction");val uri=runCatching{Uri.parse(item.optString("uri"))}.getOrNull()
                    if(direction !in listOf("upload","download")||uri?.scheme!="content")continue
                    val row=JSONObject(item.toString()).put("id",UUID.randomUUID().toString()).put("origin",origin).put("state","queued").put("received",0)
                    if(direction=="download"&&!validDownload(row.optString("path")))continue
                    tasks.add(row)
                }
            }
            if(intent?.action==CONTROL) {
                val id=intent.getStringExtra("id");val action=intent.getStringExtra("command")
                tasks.find{it.optString("id")==id&&(origin==null||it.optString("origin")==origin)}?.let { row ->
                    val savedOrigin=row.optString("origin");val currentCookie=android.webkit.CookieManager.getInstance().getCookie(savedOrigin).orEmpty();if(currentCookie.contains("pc_remote_session="))cookies[savedOrigin]=currentCookie
                    if(row.optString("state") !in listOf("complete","cancelled"))when(action) {
                        "pause"->{row.put("state","paused");if(id==activeId)activeCall?.cancel()}
                        "resume"->{val target=row.optString("origin");val current=android.webkit.CookieManager.getInstance().getCookie(target).orEmpty();if(current.contains("pc_remote_session="))cookies[target]=current;if(cookies.containsKey(target)){if(id==activeId)row.put("resumeRequested",true)else row.put("state","queued")}else row.put("message","Open PC Remote and sign in before resuming.")}
                        "replace"->{
                            val etag=row.optString("conflictingETag")
                            if(row.optString("direction")=="upload"&&row.optString("state")=="paused"&&etag.matches(Regex("\"[a-f0-9]{64}\""))){
                                if(cookies.containsKey(savedOrigin)){
                                    row.put("replaceETag",etag);row.remove("conflictingETag")
                                    if(id==activeId)row.put("resumeRequested",true)else row.put("state","queued")
                                }else row.put("message","Open PC Remote and sign in before replacing this file.")
                            }
                        }
                        "cancel"->{row.put("state","cancelled");if(id==activeId)activeCall?.cancel();cleanup(row)}
                    }
                }
            }
            persist();publish();if(!working){working=true;Thread{drain()}.start()}
        }
        return START_NOT_STICKY
    }
    private fun synchronizedSnapshot():JSONArray=synchronized(lock){JSONArray(tasks.map{JSONObject(it.toString())})}
    private fun persist() {
        val file=android.util.AtomicFile(File(filesDir,"transfer-queue.json"));val out=file.startWrite()
        try{out.write(JSONArray(tasks.map{JSONObject(it.toString())}).toString().toByteArray());file.finishWrite(out)}catch(e:Exception){file.failWrite(out);throw e}
    }
    private fun publish() { tasks.map{it.optString("origin")}.distinct().forEach{events?.invoke(snapshot(this,it))} }
    private fun drain() {
        val ownedWake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"PCRemote:transfer").apply{acquire(6*60*60*1000L)}
        wake=ownedWake
        try { while(true) {
            discardCancelled()
            val row=synchronized(lock){val next=tasks.find{it.optString("state")=="queued"&&cookies.containsKey(it.optString("origin"))};if(next==null){working=false;null}else{next.put("state","running").put("message","");activeId=next.getString("id");next}}?:break
            try { if(row.optString("direction")=="upload")upload(row)else download(row);synchronized(lock){if(row.optString("state")=="running"||row.optString("state")=="saving")row.put("state","complete")} }
            catch(e:Exception) { synchronized(lock){if(row.optString("state") !in listOf("paused","cancelled"))row.put("state","paused").put("message",if(e is IOException)"Connection interrupted. Resume to continue." else e.message?.take(180)?:"Transfer paused.")} }
            finally { activeCall=null;activeId="";synchronized(lock){if(row.optBoolean("resumeRequested")&&row.optString("state")=="paused"){row.remove("resumeRequested");row.put("state","queued")};persist();publish()} }
        }} finally {
            if(ownedWake.isHeld)ownedWake.release();if(wake===ownedWake)wake=null
            Handler(mainLooper).post { synchronized(lock){if(!working){val unfinished=tasks.lastOrNull();getSystemService(NotificationManager::class.java).notify(119,notification(unfinished));stopForeground(STOP_FOREGROUND_DETACH);stopSelf()}} }
        }
    }
    private fun check(row:JSONObject) { synchronized(lock){if(row.optString("state") !in listOf("running","saving"))throw IOException("Transfer paused")} }
    private fun request(row:JSONObject,path:String):Request.Builder {
        if(!path.startsWith("/api/files/"))throw IllegalArgumentException("Invalid transfer action")
        return Request.Builder().url(row.getString("origin")+path).header("Cookie",cookies[row.getString("origin")].orEmpty()).header("X-PCR","1").header("X-PCR-Transfer",row.getString("id"))
    }
    private fun execute(row:JSONObject,builder:Request.Builder):Response {check(row);val call=client.newCall(builder.build());activeCall=call;return call.execute().also{if(it.code==401||it.code==403){it.close();throw IllegalStateException("Sign in again, then resume this transfer.")}}}
    private fun json(row:JSONObject,path:String,body:JSONObject?=null):JSONObject {
        val builder=request(row,path);if(body!=null)builder.post(body.toString().toRequestBody("application/json".toMediaType()))
        execute(row,builder).use { response -> return metadata(row,response) }
    }
    private fun metadata(row:JSONObject,response:Response):JSONObject {
        // Read only bounded JSON metadata, including a final-chunk conflict.
        val source=response.body?.source()?:throw IOException("No host response")
        if(response.body!!.contentLength()>65536)throw IOException("Invalid host response")
        val buffer=okio.Buffer();while(!source.exhausted()){if(buffer.size>65536)throw IOException("Invalid host response");source.read(buffer,4096)}
        if(buffer.size>65536)throw IOException("Invalid host response")
        val value=JSONObject(buffer.readUtf8())
        if(!response.isSuccessful||!value.optBoolean("ok")){
            val etag=value.optJSONObject("existing")?.optString("etag").orEmpty()
            synchronized(lock){
                row.remove("conflictingETag")
                if(response.code==409&&value.optString("code")=="filename_conflict"&&etag.matches(Regex("\"[a-f0-9]{64}\"")))row.put("conflictingETag",etag)
            }
            throw IllegalStateException(value.optString("error","The host rejected this transfer."))
        }
        synchronized(lock){row.remove("conflictingETag");row.remove("replaceETag")}
        return value
    }
    private fun upload(row:JSONObject) {
        val uri=Uri.parse(row.getString("uri"));var displayName:String?=null;var size=row.optLong("size",-1)
        contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE),null,null,null)?.use { c -> if(c.moveToFirst()){if(!c.isNull(0))displayName=c.getString(0);if(size<0&&!c.isNull(1))size=c.getLong(1)} }
        if(size<0)throw IllegalStateException("This provider cannot report file size. Save the file on your phone, then choose it again.")
        val name=TransferFileNames.upload(displayName,row.optString("name"),row.has("uploadId"))
        row.put("name",name).put("size",size)
        val replaceETag=synchronized(lock){row.optString("replaceETag").takeIf{it.matches(Regex("\"[a-f0-9]{64}\""))}}
        var state=if(row.has("uploadId"))json(row,"/api/files/uploads/"+row.getString("uploadId")+"/resume",JSONObject().put("resumeSecret",row.getString("resumeSecret")).apply{if(replaceETag!=null)put("replaceETag",replaceETag)})else{
            val destination=row.optString("destination").trim('/')
            json(row,"/api/files/uploads",JSONObject().put("name",name).put("size",size).put("relativePath",if(destination.isBlank())name else "$destination/$name").apply{if(replaceETag!=null)put("replaceETag",replaceETag)}).also{row.put("uploadId",it.getString("id")).put("resumeSecret",it.getString("resumeSecret"))}
        }
        var offset=state.getLong("received");val chunk=state.optInt("chunkBytes",1048576).coerceIn(1,8388608)
        synchronized(lock){row.put("received",offset);persist()}
        if(state.optBoolean("complete")){state.optJSONObject("file")?.optString("name")?.let{row.put("pcName",it)};return}
        contentResolver.openInputStream(uri)?.use { input ->
            var skip=offset;while(skip>0){check(row);val n=input.skip(skip);if(n>0)skip-=n else if(input.read()<0)throw IOException("The source file changed")else skip--}
            while(offset<size) {
                check(row);val length=minOf(chunk.toLong(),size-offset);val start=offset
                val body=object:RequestBody(){override fun contentType()="application/octet-stream".toMediaType();override fun contentLength()=length;override fun writeTo(sink:BufferedSink){val buffer=ByteArray(65536);var left=length;while(left>0){check(row);val n=input.read(buffer,0,minOf(buffer.size.toLong(),left).toInt());if(n<0)throw IOException("The source file changed");sink.write(buffer,0,n);left-=n;progress(row,start+length-left,false)}}}
                execute(row,request(row,"/api/files/uploads/"+row.getString("uploadId")+"?offset=$offset").put(body)).use { response ->
                    state=metadata(row,response)
                    val next=state.getLong("received");if(next!=offset+length)throw IOException("Upload position changed");offset=next;progress(row,offset,true)
                }
            }
        }?:throw IllegalStateException("The phone no longer has access to this file. Choose it again.")
        if(!state.optBoolean("complete"))throw IOException("The PC has not confirmed the file")
        state.optJSONObject("file")?.optString("name")?.let{row.put("pcName",it)}
    }
    private fun validDownload(path:String)=runCatching{val u=java.net.URI(path);!u.isAbsolute&&u.rawAuthority==null&&u.path in listOf("/api/files/download","/api/files/folder")&&!path.contains('#')}.getOrDefault(false)
    private fun download(row:JSONObject) {
        val path=row.getString("path");if(!validDownload(path))throw IllegalArgumentException("Invalid download")
        val destination=Uri.parse(row.getString("uri"))
        fun verifyDestination(){
            val actual=contentResolver.query(destination,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { c -> if(c.moveToFirst()&&!c.isNull(0))c.getString(0)else null }
            TransferFileNames.destination(row.getString("name"),actual)
        }
        // ACTION_CREATE_DOCUMENT can silently suffix duplicate names or append a
        // MIME-based extension. Do not write to that renamed document unnoticed.
        verifyDestination()
        val part=File(filesDir,"transfer-"+row.getString("id")+".part");var offset=if(part.exists())part.length()else 0L
        val builder=request(row,path);if(offset>0&&row.has("etag"))builder.header("Range","bytes=$offset-").header("If-Range",row.getString("etag"))else offset=0
        execute(row,builder).use { response ->
            if(response.code !in listOf(200,206))throw IOException("Download interrupted")
            if(response.code==200)offset=0
            if(response.code==206&&!response.header("Content-Range").orEmpty().startsWith("bytes $offset-"))throw IOException("Download position changed")
            row.put("name",DownloadNames.resolve(row.getString("origin")+path,response.header("Content-Disposition"),row.optString("name")))
            verifyDestination()
            val length=response.body?.contentLength()?:-1;row.put("size",if(length>=0)offset+length else -1);response.header("ETag")?.let{row.put("etag",it)}
            java.io.FileOutputStream(part,offset>0).use { out -> response.body!!.byteStream().use { input -> val bytes=ByteArray(65536);while(true){check(row);val n=input.read(bytes);if(n<0)break;out.write(bytes,0,n);offset+=n;progress(row,offset,false)} };out.fd.sync() }
        }
        if(row.optLong("size",-1)>=0&&offset!=row.getLong("size"))throw IOException("Download incomplete")
        row.put("state","saving");progress(row,offset,true)
        verifyDestination()
        contentResolver.openOutputStream(destination,"wt")?.use { out -> part.inputStream().use { input -> val bytes=ByteArray(65536);while(true){check(row);val n=input.read(bytes);if(n<0)break;out.write(bytes,0,n)} } }?:throw IOException("Could not save to that folder")
        part.delete()
    }
    private fun progress(row:JSONObject,bytes:Long,durable:Boolean) {
        val now=SystemClock.elapsedRealtime();synchronized(lock){row.put("transferred",bytes);if(durable)row.put("received",bytes);if(durable)persist();if(now-lastNotice>350||durable){lastNotice=now;publish();getSystemService(NotificationManager::class.java).notify(119,notification(row,bytes))}}
    }
    private fun cleanup(row:JSONObject) {File(filesDir,"transfer-"+row.optString("id")+".part").delete()}
    private fun discardCancelled(){
        val cancelled=synchronized(lock){tasks.filter{it.optString("state")=="cancelled"&&it.has("uploadId")&&cookies.containsKey(it.optString("origin"))}.toList()}
        for(row in cancelled)for(attempt in 0..4){
            try{val call=client.newCall(request(row,"/api/files/uploads/"+row.getString("uploadId")).delete().build());call.timeout().timeout(3,TimeUnit.SECONDS);val code=call.execute().use{it.code}
                if(code in 200..299||code==404){synchronized(lock){row.remove("uploadId");row.remove("resumeSecret");persist()};break}
                if(code!=409)break
            }catch(_:Exception){break}
            Thread.sleep(200)
        }
    }
    private fun cancelOrigin(origin:String) {synchronized(lock){tasks.filter{it.optString("origin")==origin}.forEach{it.put("state","cancelled");cleanup(it)};tasks.removeAll{it.optString("origin")==origin};cookies.remove(origin);activeCall?.cancel();persist();publish()}}
    private fun notification(row:JSONObject?,bytes:Long=row?.optLong("received")?:0):Notification {
        val open=PendingIntent.getActivity(this,109,Intent(this,MainActivity::class.java).putExtra("openFiles",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val state=row?.optString("state").orEmpty();val size=row?.optLong("size",-1)?:-1
        val builder=Notification.Builder(this,"transfers").setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle(row?.optString("name")?.takeIf{it.isNotBlank()}?:"PC Remote transfers").setContentText(when(state){"running"->"${if(row?.optString("direction")=="upload")"Sending to PC" else "Receiving on phone"} · ${bytes/1024} KB";"saving"->"Saving on your phone…";"complete"->"Transfer complete";"paused"->row?.optString("message")?.ifBlank{"Paused · tap Resume to continue"};"cancelled"->"Transfer cancelled";else->"Preparing transfer…"}).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(state in listOf("running","saving","queued")).setAutoCancel(state=="complete")
        if(state in listOf("running","saving","queued"))builder.setProgress(100,if(size>0)(100.0*bytes/size).toInt().coerceIn(0,100)else 0,size<=0)
        if(row!=null&&state !in listOf("complete","cancelled"))for(command in listOf(if(state=="paused")"resume" else "pause","cancel")) {
            val action=Intent(this,TransferService::class.java).setAction(CONTROL).putExtra("id",row.optString("id")).putExtra("command",command)
            val pending=PendingIntent.getService(this,(row.optString("id")+command).hashCode(),action,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(Notification.Action.Builder(null,command.replaceFirstChar{it.uppercase()},pending).build())
        }
        if(row!=null&&state=="complete"&&row.optString("direction")=="download")for(command in listOf("open","share")){
            val action=Intent(this,TransferActionActivity::class.java).putExtra("origin",row.optString("origin")).putExtra("id",row.optString("id")).putExtra("command",command)
            val pending=PendingIntent.getActivity(this,(row.optString("id")+command).hashCode(),action,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(Notification.Action.Builder(null,command.replaceFirstChar{it.uppercase()},pending).build())
        }
        return builder.build()
    }
    override fun onTimeout(startId:Int,fgsType:Int) {synchronized(lock){tasks.filter{it.optString("state") in listOf("running","queued","saving")}.forEach{it.put("state","paused").put("message","Android paused this long transfer. Open the app to resume.")};activeCall?.cancel();persist();publish()};stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onDestroy(){live=null;activeCall?.cancel();client.dispatcher.executorService.shutdown();if(wake?.isHeld==true)wake?.release();super.onDestroy()}
}
