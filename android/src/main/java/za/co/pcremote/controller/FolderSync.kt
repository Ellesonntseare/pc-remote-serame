package za.co.pcremote.controller

import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.net.Uri
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

object FolderSync {
    var events:((JSONObject)->Unit)?=null
    private val observed=mutableMapOf<String,android.database.ContentObserver>()
    private val changes=mutableMapOf<String,Runnable>()
    private val handler=android.os.Handler(android.os.Looper.getMainLooper())
    @Synchronized fun observe(context:Context){val app=context.applicationContext;val rows=pairs(app).filter{it.optBoolean("enabled")};val valid=rows.map{it.getString("id")}.toSet();for(id in observed.keys.toList())if(id !in valid){app.contentResolver.unregisterContentObserver(observed.remove(id)!!);changes.remove(id)?.let(handler::removeCallbacks)};for(row in rows){val id=row.getString("id");if(observed.containsKey(id))continue;val observer=object:android.database.ContentObserver(handler){override fun onChange(selfChange:Boolean){synchronized(FolderSync){if(!observed.containsKey(id))return;changes.remove(id)?.let(handler::removeCallbacks);val task=Runnable{synchronized(FolderSync){changes.remove(id)};runNow(app,id)};changes[id]=task;handler.postDelayed(task,5000)}}};runCatching{app.contentResolver.registerContentObserver(Uri.parse(row.getString("uri")),true,observer);observed[id]=observer}}}
    private fun prefs(context:Context)=context.getSharedPreferences("pc_remote_folder_sync",Context.MODE_PRIVATE)
    @Synchronized fun connect(context:Context,hostId:String,origin:String,cookie:String){if(!Regex("[a-f0-9]{24}").matches(hostId)||!cookie.contains("pc_remote_session="))return;prefs(context).edit().putString("host:"+origin,hostId).apply();val rows=pairs(context);var changed=false;for(row in rows)if(row.optString("hostId")==hostId||row.optString("origin")==origin){if(row.optString("origin")!=origin||row.optString("cookie")!=cookie||row.optString("hostId")!=hostId){row.put("origin",origin).put("cookie",cookie).put("hostId",hostId);changed=true}};if(changed){save(context,rows);rows.filter{it.optBoolean("enabled")}.forEach{schedule(context,it)}}}
    @Synchronized fun pairs(context:Context):List<JSONObject>{val array=runCatching{JSONArray(prefs(context).getString("pairs","[]"))}.getOrDefault(JSONArray());return (0 until array.length()).mapNotNull{array.optJSONObject(it)}}
    @Synchronized private fun save(context:Context,rows:List<JSONObject>){prefs(context).edit().putString("pairs",JSONArray(rows).toString()).apply();observe(context);events?.invoke(snapshot(context))}
    fun snapshot(context:Context)=JSONObject().put("pairs",JSONArray(pairs(context).map{JSONObject(it.toString()).apply{remove("cookie");remove("uri")}}))
    @Synchronized fun add(context:Context,uri:Uri,name:String,origin:String,cookie:String,destination:String,direction:String){
        val rows=pairs(context).toMutableList();require(rows.size<8){"Use up to eight folder pairs."};val safe=name.replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1f]"),"_").trim().trimEnd('.').take(100).ifBlank{"Phone folder"};val target=destination.ifBlank{"Synced folders/$safe"};
        val row=JSONObject().put("id",UUID.randomUUID().toString()).put("name",safe).put("uri",uri.toString()).put("origin",origin).put("hostId",prefs(context).getString("host:"+origin,"")).put("cookie",cookie).put("destination",target).put("direction",if(direction=="upload")"upload"else"both").put("enabled",true).put("message","Waiting to sync");rows.add(row);save(context,rows);schedule(context,row);runNow(context,row.getString("id"))
    }
    fun schedule(context:Context,row:JSONObject){val id=row.getString("id");if(!row.optBoolean("enabled"))return;val work=PeriodicWorkRequestBuilder<FolderSyncWorker>(15,TimeUnit.MINUTES).setInputData(workDataOf("pair" to id)).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();WorkManager.getInstance(context).enqueueUniquePeriodicWork("folder-$id",ExistingPeriodicWorkPolicy.UPDATE,work)}
    fun runNow(context:Context,id:String){val row=pairs(context).find{it.optString("id")==id}?:return;if(!row.optBoolean("enabled"))return;WorkManager.getInstance(context).enqueueUniqueWork("folder-now-$id",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<FolderSyncWorker>().setInputData(workDataOf("pair" to id)).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())}
    @Synchronized fun control(context:Context,id:String,command:String){val rows=pairs(context).toMutableList();val row=rows.find{it.optString("id")==id}?:return;when(command){"pause"->{row.put("enabled",false).put("message","Paused");WorkManager.getInstance(context).cancelUniqueWork("folder-$id");WorkManager.getInstance(context).cancelUniqueWork("folder-now-$id")};"resume"->{row.put("enabled",true);schedule(context,row)};"remove"->{WorkManager.getInstance(context).cancelUniqueWork("folder-$id");WorkManager.getInstance(context).cancelUniqueWork("folder-now-$id");rows.remove(row)};"run"->runNow(context,id)};save(context,rows)}
    @Synchronized fun status(context:Context,id:String,message:String){val rows=pairs(context).toMutableList();rows.find{it.optString("id")==id}?.put("message",message)?.put("updated",System.currentTimeMillis());save(context,rows)}
    @Synchronized fun updateCookie(context:Context,origin:String,cookie:String){if(!cookie.contains("pc_remote_session="))return;val rows=pairs(context);var changed=false;for(row in rows)if(row.optString("origin")==origin&&row.optString("cookie")!=cookie){row.put("cookie",cookie);changed=true};if(changed)save(context,rows)}
    @Synchronized fun disconnect(context:Context,origin:String){val rows=pairs(context);for(row in rows)if(row.optString("origin")==origin){row.put("cookie","").put("message","Sign in to resume sync");WorkManager.getInstance(context).cancelUniqueWork("folder-"+row.getString("id"));WorkManager.getInstance(context).cancelUniqueWork("folder-now-"+row.getString("id"))};save(context,rows)}
}
class FolderSyncControl:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){val id=intent.getStringExtra("pair")?:return;FolderSync.control(context,id,"pause")}}
