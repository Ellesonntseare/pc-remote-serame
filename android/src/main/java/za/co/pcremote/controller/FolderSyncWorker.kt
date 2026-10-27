package za.co.pcremote.controller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.util.AtomicFile
import androidx.work.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Incremental two-way copies. Deletions never propagate; conflicting edits keep both. */
class FolderSyncWorker(context:Context,params:WorkerParameters):Worker(context,params){
    companion object{private val locks=ConcurrentHashMap<String,Any>()}
    private data class Entry(val uri:Uri,val size:Long,val modified:Long,val digest:String?=null)
    private val client=OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(45,TimeUnit.SECONDS).writeTimeout(45,TimeUnit.SECONDS).followRedirects(false).build()
    private lateinit var pair:JSONObject
    private lateinit var ledger:JSONObject
    private lateinit var ledgerFile:AtomicFile
    private val resolver=applicationContext.contentResolver
    private var call:Call?=null
    private fun encoded(text:String)=URLEncoder.encode(text,"UTF-8")
    private fun check(){if(isStopped)throw IOException("Sync paused")}
    private fun builder(route:String)=Request.Builder().url(pair.getString("origin")+route).header("X-PCR","1").header("Cookie",pair.getString("cookie"))
    private fun execute(builder:Request.Builder):Response{check();val next=client.newCall(builder.build());call=next;return next.execute().also{if(it.code==401||it.code==403){it.close();throw IllegalStateException("Open PC Remote and sign in to resume folder sync.")}}}
    private fun responseJson(response:Response):JSONObject{val text=response.body?.string().orEmpty();if(text.length>4*1024*1024)throw IOException("Folder listing is too large");val value=runCatching{JSONObject(text)}.getOrElse{if(!response.isSuccessful)throw SyncHttpFailure(response.code,"PC connection interrupted (${response.code})");throw IOException("PC returned an incomplete response",it)};if(!response.isSuccessful)throw SyncHttpFailure(response.code,value.optString("error","Sync request failed"));return value}
    private fun json(route:String,body:JSONObject?=null):JSONObject{val b=builder(route);if(body!=null)b.post(body.toString().toRequestBody("application/json".toMediaType()));return execute(b).use(::responseJson)}
    private fun save(){val stream=ledgerFile.startWrite();try{stream.write(ledger.toString().toByteArray());ledgerFile.finishWrite(stream)}catch(e:Exception){ledgerFile.failWrite(stream);throw e}}
    private fun safe(relative:String)=relative.split('/').all{it.isNotBlank()&&it!="."&&it!=".."&&!it.startsWith('.')&&it.length<=180&&!Regex("[<>:\"\\\\|?*\\x00-\\x1f]").containsMatchIn(it)}
    private fun scan(tree:Uri):MutableMap<String,Entry>{val result=linkedMapOf<String,Entry>();fun walk(parent:String,prefix:String,depth:Int){check();if(depth>10||result.size>2000)throw IOException("Choose a smaller folder with fewer than 2,000 files.");resolver.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree,parent),arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED),null,null,null)?.use{c->while(c.moveToNext()){check();val id=c.getString(0);val label=c.getString(1)?:continue;if(label.startsWith('.'))continue;val relative=if(prefix.isBlank())label else "$prefix/$label";if(!safe(relative))continue;if(c.getString(2)==DocumentsContract.Document.MIME_TYPE_DIR)walk(id,relative,depth+1)else result[relative]=Entry(DocumentsContract.buildDocumentUriUsingTree(tree,id),if(c.isNull(3))-1 else c.getLong(3),if(c.isNull(4))0 else c.getLong(4))}}};walk(DocumentsContract.getTreeDocumentId(tree),"",0);return result}
    private fun fingerprint(entry:Entry):String{entry.digest?.let{return it};if(entry.modified>0)return "${entry.size}:${entry.modified}";return hash(entry.uri)}
    private fun hash(uri:Uri):String{val digest=MessageDigest.getInstance("SHA-256");resolver.openInputStream(uri)?.use{input->val bytes=ByteArray(65536);while(true){check();val count=input.read(bytes);if(count<0)break;digest.update(bytes,0,count)}}?:throw IOException("Folder access was removed");return digest.digest().joinToString(""){"%02x".format(it)}}
    private fun localInfo(uri:Uri):Entry{resolver.query(uri,arrayOf(DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED),null,null,null)?.use{c->if(c.moveToFirst())return Entry(uri,if(c.isNull(0))-1 else c.getLong(0),if(c.isNull(1))0 else c.getLong(1))};throw IOException("The phone file changed")}
    private fun recoverPending(relative:String,sourceStamp:String?,remote:JSONObject?):JSONObject?{
        val key="pending:$relative";val saved=ledger.optJSONObject(key)?:return null
        val ticket=SyncUploadTicket(saved.getString("id"),saved.getString("secret"),saved.getString("fingerprint"),saved.getString("match"))
        return SyncUploadRecovery.reconcile(ticket,sourceStamp,remote?.optString("etag")?:"new",
            resume={json("/api/files/uploads/${ticket.id}/resume",JSONObject().put("resumeSecret",ticket.secret))},
            isComplete={it.optBoolean("complete")},
            completed={state->val file=state.optJSONObject("file")?:throw IOException("Upload receipt is incomplete");if(sourceStamp!=null)ledger.put(relative,JSONObject().put("local",ticket.stamp).put("remote",file.getString("etag")))},
            discard={execute(builder("/api/files/uploads/${ticket.id}").delete()).use{responseJson(it)};Unit},
            forget={ledger.remove(key);save()})
    }
    private fun upload(relative:String,entry:Entry,stamp:String,remote:JSONObject?):JSONObject{
        if(entry.size<0)throw IOException("This phone folder provider cannot report file sizes.")
        val destination=pair.getString("destination").trim('/');val name="$destination/$relative";val pendingKey="pending:$relative";val pending=ledger.optJSONObject(pendingKey)
        if(pending!=null&&(pending.optString("fingerprint")!=stamp||pending.optString("match")!=(remote?.optString("etag")?:"new")))throw IOException("Phone file changed. Sync will retry.")
        var state=if(pending!=null)json("/api/files/uploads/"+pending.getString("id")+"/resume",JSONObject().put("resumeSecret",pending.getString("secret")))else null
        if(state==null){state=json("/api/files/uploads",JSONObject().put("name",relative.substringAfterLast('/')).put("relativePath",name).put("size",entry.size).put("replaceETag",remote?.optString("etag")?:"new"));ledger.put(pendingKey,JSONObject().put("id",state.getString("id")).put("secret",state.getString("resumeSecret")).put("fingerprint",stamp).put("match",remote?.optString("etag")?:"new"));save()}
        val id=ledger.getJSONObject(pendingKey).getString("id");var offset=state.getLong("received");val chunk=state.optInt("chunkBytes",1048576).coerceIn(1,8388608)
        if(!state.optBoolean("complete"))resolver.openInputStream(entry.uri)?.use{input->var skip=offset;while(skip>0){check();val n=input.skip(skip);if(n>0)skip-=n else if(input.read()<0)throw IOException("Phone file changed")else skip--};while(offset<entry.size){check();val length=minOf(chunk.toLong(),entry.size-offset);val body=object:RequestBody(){override fun contentType()="application/octet-stream".toMediaType();override fun contentLength()=length;override fun writeTo(sink:BufferedSink){val bytes=ByteArray(65536);var left=length;while(left>0){check();val count=input.read(bytes,0,minOf(left,bytes.size.toLong()).toInt());if(count<0)throw IOException("Phone file changed");sink.write(bytes,0,count);left-=count}}};state=execute(builder("/api/files/uploads/$id?offset=$offset").put(body)).use(::responseJson);val next=state.getLong("received");if(next!=offset+length)throw IOException("Upload position changed");offset=next}}?:throw IOException("Phone folder access was removed")
        val completed=state.optJSONObject("file")?:throw IOException("Upload did not finish");ledger.remove(pendingKey);return completed
    }
    private fun parent(tree:Uri,relative:String):Uri{var current=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));for(part in relative.split('/').dropLast(1)){var next:Uri?=null;resolver.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getDocumentId(current)),arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE),null,null,null)?.use{c->while(c.moveToNext())if(c.getString(1)==part&&c.getString(2)==DocumentsContract.Document.MIME_TYPE_DIR)next=DocumentsContract.buildDocumentUriUsingTree(tree,c.getString(0))};current=next?:DocumentsContract.createDocument(resolver,current,DocumentsContract.Document.MIME_TYPE_DIR,part)?:throw IOException("Could not create phone folder")};return current}
    private fun download(tree:Uri,relative:String,remote:JSONObject,existing:Entry?,expectedStamp:String?):Entry{
        val parent=parent(tree,relative);val label=relative.substringAfterLast('/');val temp=DocumentsContract.createDocument(resolver,parent,java.net.URLConnection.guessContentTypeFromName(label)?:"application/octet-stream",".pcr-part-${java.util.UUID.randomUUID()}")?:throw IOException("Choose a writable phone folder")
        var committed=false;val digest=MessageDigest.getInstance("SHA-256")
        try{execute(builder("/api/files/download?name="+encoded(remote.getString("name")))).use{response->if(!response.isSuccessful||response.header("ETag")!=remote.optString("etag"))throw IOException("PC file changed. Sync will retry.");val source=response.body?.byteStream()?:throw IOException("Download interrupted");resolver.openOutputStream(temp,"wt")?.use{out->val bytes=ByteArray(65536);var total=0L;source.use{input->while(true){check();val count=input.read(bytes);if(count<0)break;out.write(bytes,0,count);digest.update(bytes,0,count);total+=count}};if(total!=remote.getLong("size"))throw IOException("Download interrupted")}?:throw IOException("Phone folder is read-only")}
            if(existing!=null&&fingerprint(localInfo(existing.uri))!=expectedStamp)throw IOException("Phone file changed while receiving. Sync will retry.")
            var previous:Uri?=null;if(existing!=null)previous=DocumentsContract.renameDocument(resolver,existing.uri,".pcr-previous-${System.currentTimeMillis()}-$label")?:throw IOException("Could not preserve the previous phone file")
            val result=try{DocumentsContract.renameDocument(resolver,temp,label)?:throw IOException("Phone provider could not finish the file")}catch(e:Exception){if(previous!=null)runCatching{DocumentsContract.renameDocument(resolver,previous,label)};throw e};committed=true;val info=localInfo(result);return if(info.modified>0)info else info.copy(digest=digest.digest().joinToString(""){"%02x".format(it)})
        }finally{if(!committed)runCatching{DocumentsContract.deleteDocument(resolver,temp)}}
    }
    private fun notifyProgress(message:String){val manager=applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager;manager.createNotificationChannel(NotificationChannel("folder-sync","Folder sync",NotificationManager.IMPORTANCE_LOW));val pause=PendingIntent.getBroadcast(applicationContext,pair.getString("id").hashCode(),Intent(applicationContext,FolderSyncControl::class.java).putExtra("pair",pair.getString("id")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);val notification=Notification.Builder(applicationContext,"folder-sync").setSmallIcon(R.drawable.ic_remote).setContentTitle("Sync · "+pair.optString("name")).setContentText(message).setOngoing(true).addAction(Notification.Action.Builder(null,"Pause",pause).build()).build();val info=if(Build.VERSION.SDK_INT>=29)ForegroundInfo(6000+(pair.getString("id").hashCode()and 32767),notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)else ForegroundInfo(6000+(pair.getString("id").hashCode()and 32767),notification);setForegroundAsync(info).get(10,TimeUnit.SECONDS);FolderSync.status(applicationContext,pair.getString("id"),message)}
    override fun doWork():Result{val id=inputData.getString("pair")?:return Result.failure();if(!Regex("[a-f0-9-]{36}").matches(id))return Result.failure();return synchronized(locks.getOrPut(id){Any()}){runPair(id)}}
    private fun runPair(id:String):Result{
        pair=FolderSync.pairs(applicationContext).find{it.optString("id")==id}?:return Result.success();if(!pair.optBoolean("enabled")||!pair.optString("cookie").contains("pc_remote_session="))return Result.success();if(TrustedOrigin.normalize(pair.optString("origin"))==null)return Result.failure()
        val folder=File(applicationContext.filesDir,"folder-sync");folder.mkdirs();ledgerFile=AtomicFile(File(folder,"$id.json"));ledger=runCatching{JSONObject(ledgerFile.openRead().bufferedReader().use{it.readText()})}.getOrDefault(JSONObject())
        return try{notifyProgress("Checking for changes…");val tree=Uri.parse(pair.getString("uri"));val local=scan(tree);val destination=pair.getString("destination");json("/api/files/mkdir",JSONObject().put("path",destination));
            fun manifest():Map<String,JSONObject>{val listing=json("/api/files/manifest?path="+encoded(destination));if(listing.optBoolean("truncated"))throw IOException("Choose a smaller PC folder with fewer than 2,000 files.");val array=listing.getJSONArray("files");val files=linkedMapOf<String,JSONObject>();for(i in 0 until array.length()){val item=array.getJSONObject(i);val relative=item.getString("name").removePrefix(destination.trim('/')+"/");if(safe(relative))files[relative]=item};return files}
            var remote=manifest()
            // Reclaim obsolete partials before opening new uploads, including old
            // conflict-copy tickets. Network/busy errors retain the original ticket.
            val pendingKeys=ledger.keys().asSequence().toList().filter{it.startsWith("pending:")}
            for(key in pendingKeys){val relative=key.removePrefix("pending:");recoverPending(relative,local[relative]?.let{fingerprint(localInfo(it.uri))},remote[relative])}
            // Resume may publish a last chunk received before a host restart.
            if(pendingKeys.isNotEmpty())remote=manifest()
            var changed=0;for(relative in (local.keys+remote.keys).sorted()){check();val phone=local[relative]?.let{localInfo(it.uri)};val pc=remote[relative];val before=ledger.optJSONObject(relative);val stamp=phone?.let{fingerprint(it)};val localChanged=phone!=null&&(before==null||before.optString("local")!=stamp);val remoteChanged=pc!=null&&(before==null||before.optString("remote")!=pc.optString("etag"));var current=phone;var localCheckpoint=stamp;var latest=pc
                if(phone!=null&&pc!=null&&before==null&&phone.size==pc.optLong("size")&&hash(phone.uri)==json("/api/files/hash?name="+encoded(pc.getString("name"))).optString("sha256")){ledger.put(relative,JSONObject().put("local",stamp).put("remote",pc.optString("etag")));save();continue}
                if(localChanged&&remoteChanged){val dot=relative.lastIndexOf('.');val suffix=" (conflict "+System.currentTimeMillis()+")";val conflict=if(dot>relative.lastIndexOf('/'))relative.substring(0,dot)+suffix+relative.substring(dot)else relative+suffix;upload(conflict,phone!!,stamp!!,null);changed++;ledger.put(relative,JSONObject().put("local",stamp).put("remote",if(pair.optString("direction")=="upload")pc?.optString("etag")else before?.optString("remote").orEmpty()));save();if(fingerprint(localInfo(phone.uri))!=stamp)throw IOException("Phone file changed while sending. Sync will retry.");if(pair.optString("direction")=="upload")continue}
                else if(localChanged){notifyProgress("Sending · "+relative.substringAfterLast('/'));latest=upload(relative,phone!!,stamp!!,pc);changed++}
                if(remoteChanged&&pair.optString("direction")!="upload"){notifyProgress("Receiving · "+relative.substringAfterLast('/'));current=download(tree,relative,pc!!,phone,stamp);localCheckpoint=fingerprint(current);changed++}
                if(current!=null&&latest!=null)ledger.put(relative,JSONObject().put("local",localCheckpoint).put("remote",latest.optString("etag")));save()
                if(current!=null&&fingerprint(localInfo(current.uri))!=localCheckpoint)throw IOException("Phone file changed while syncing. Sync will retry.")
            };FolderSync.status(applicationContext,id,"Up to date · $changed file(s) updated");Result.success()
        }catch(e:IllegalStateException){FolderSync.status(applicationContext,id,e.message?:"Open PC Remote to continue sync");Result.success()}catch(e:Exception){FolderSync.status(applicationContext,id,if(isStopped)"Paused" else e.message?:"Waiting for the PC");if(isStopped)Result.success()else Result.retry()}
    }
    override fun onStopped(){call?.cancel();super.onStopped()}
}
