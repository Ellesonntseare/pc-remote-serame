package za.co.pcremote.controller

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Incoming PC drops join the existing persistent Pause/Cancel transfer queue. */
internal object PhoneFileReceiver {
    private val worker=Executors.newSingleThreadExecutor()
    private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(15,TimeUnit.SECONDS).build()
    private fun readBounded(input:java.io.InputStream,limit:Int):ByteArray{val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){val n=input.read(buffer);if(n<0)break;require(out.size()+n<=limit);out.write(buffer,0,n)};return out.toByteArray()}
    private fun prefs(context:Context)=context.getSharedPreferences("phone_drop_receipts",Context.MODE_PRIVATE)
    private fun remember(context:Context,key:String,id:String){val values=LinkedHashSet(prefs(context).getStringSet(key,emptySet()).orEmpty());values.add(id);while(values.size>200)values.remove(values.first());prefs(context).edit().putStringSet(key,values).apply()}
    private fun acknowledged(context:Context,id:String)=id in prefs(context).getStringSet("complete",emptySet()).orEmpty()
    private fun ack(origin:String,cookie:String,id:String){
        val body=JSONObject().put("id",id).toString().toRequestBody("application/json".toMediaType())
        client.newCall(Request.Builder().url(origin+"/api/sync/inbox/ack").header("Cookie",cookie).header("X-PCR","1").post(body).build()).execute().use{require(it.isSuccessful)}
    }
    fun completed(context:Context,row:JSONObject){
        val id=row.optString("inboxId");if(!id.matches(Regex("^[a-f0-9-]{36}$")))return
        if(row.optBoolean("mediaStorePending")&&Build.VERSION.SDK_INT>=29)context.contentResolver.update(Uri.parse(row.getString("uri")),ContentValues().apply{put(MediaStore.MediaColumns.IS_PENDING,0)},null,null)
        remember(context,"complete",id)
    }
    fun collect(context:Context,origin:String,cookie:String){worker.execute{runCatching{
        client.newCall(Request.Builder().url(origin+"/api/phone/inbox").header("Cookie",cookie).header("X-PCR","1").build()).execute().use{response->
            if(!response.isSuccessful)return@use
            val bytes=response.body?.byteStream()?.use{readBounded(it,1024*1024)}?:return@use
            val items=JSONObject(bytes.toString(Charsets.UTF_8)).optJSONArray("inbox")?:return@use
            for(i in 0 until items.length().coerceAtMost(100)){val item=items.optJSONObject(i)?:continue;if(item.optString("kind")!="file")continue
                val offer=JSONObject().put("id",item.optString("id")).put("name",item.optString("label")).put("path","/api/files/download?name="+Uri.encode(item.optString("name"))).put("group",item.optString("id"))
                runCatching{receive(context,origin,cookie,offer)}
            }
        }
    }}}
    fun offer(context:Context,origin:String,cookie:String,offers:JSONArray,done:(String)->Unit){worker.execute{for(i in 0 until offers.length().coerceAtMost(100))runCatching{receive(context,origin,cookie,offers.getJSONObject(i))}.onFailure{done(it.message?:"Open Files on your phone to receive the pending delivery.")}}}
    private fun receive(context:Context,origin:String,cookie:String,offer:JSONObject){
        val id=offer.optString("id");require(id.matches(Regex("^[a-f0-9-]{36}$")))
        if(acknowledged(context,id)){runCatching{ack(origin,cookie,id)};return}
        if(id in prefs(context).getStringSet("accepted",emptySet()).orEmpty())return
        val name=TransferFileNames.download(offer.getString("name"));val path=offer.getString("path")
        require(path.startsWith("/api/files/download?name=")&&!path.contains('#'))
        val resolver=context.contentResolver;val folder=context.getSharedPreferences("pc_remote_android",Context.MODE_PRIVATE).getString("phoneDropFolder","").orEmpty()
        val mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.',"").lowercase(Locale.ROOT))?:"application/octet-stream"
        var pending=false
        val destination=if(folder.isNotEmpty()){
            val tree=Uri.parse(folder);val document=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))
            val children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getDocumentId(document))
            val duplicate=resolver.query(children,arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),null,null,null)?.use{cursor->var found=false;while(cursor.moveToNext()){if(cursor.getString(0).equals(name,ignoreCase=true)){found=true;break}};found}?:false
            require(!duplicate){"$name already exists in the receiving folder. Choose another folder; the original name is preserved."}
            DocumentsContract.createDocument(resolver,document,mime,name)?:error("Choose a writable receiving folder.")
        }else if(Build.VERSION.SDK_INT>=29){
            val group=offer.optString("group").filter{it.isLetterOrDigit()||it=='-'}.take(36)
            val label=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(Date())+" "+group.take(8)
            pending=true
            resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,ContentValues().apply{put(MediaStore.MediaColumns.DISPLAY_NAME,name);put(MediaStore.MediaColumns.MIME_TYPE,mime);put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Elleson Connect/"+label);put(MediaStore.MediaColumns.IS_PENDING,1)})?:error("Could not create the phone download.")
        }else error("Choose an incoming-files folder in Elleson Connect first.")
        try{
            val actual=resolver.query(destination,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)else null};TransferFileNames.destination(name,actual)
            val row=JSONObject().put("direction","download").put("name",name).put("uri",destination.toString()).put("path",path).put("inboxId",id).put("mediaStorePending",pending)
            val intent=Intent(context,TransferService::class.java).setAction(TransferService.ADD).putExtra("origin",origin).putExtra("cookie",cookie).putExtra("items",JSONArray().put(row).toString())
            (PhoneControlService.instance?:context).startForegroundService(intent);remember(context,"accepted",id)
        }catch(error:Exception){if(pending)runCatching{resolver.delete(destination,null,null)};throw error}
    }
}
