package za.co.pcremote.controller

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.TimeUnit

object FastLocalConnection {
    data class Result(val origin:String,val cookie:String?,val milliseconds:Long)
    fun choose(current:String,cookie:String,candidates:List<String>):Result {
        fun get(url:String,auth:String?=null,timeout:Int=2500):JSONObject {val connection=URL(url).openConnection() as HttpURLConnection;try{connection.connectTimeout=timeout;connection.readTimeout=timeout;connection.instanceFollowRedirects=false;connection.setRequestProperty("X-PCR","1");if(auth!=null)connection.setRequestProperty("Cookie",auth);require(connection.responseCode==200);val output=ByteArrayOutputStream();connection.inputStream.use{input->val buffer=ByteArray(2048);while(true){val count=input.read(buffer);if(count<0)break;require(output.size()+count<=16384);output.write(buffer,0,count)}};return JSONObject(output.toString("UTF-8"))}finally{connection.disconnect()}}
        val key=get(current+"/api/local-route-key",cookie,5000);val started=System.nanoTime();get(current+"/api/ping",cookie);val initial=(System.nanoTime()-started)/1000000;val publicKey=key.getString("publicKey")
        val pool=Executors.newFixedThreadPool(4);val completion=ExecutorCompletionService<Pair<String,Long>?>(pool);val submitted=candidates.distinct().take(16).mapNotNull{TrustedOrigin.normalize(it)}.filter{it!=current&&it.startsWith("http://")}.map{target->completion.submit(java.util.concurrent.Callable{runCatching{val nonceBytes=ByteArray(32);SecureRandom().nextBytes(nonceBytes);val nonce=nonceBytes.joinToString(""){"%02x".format(it)};val at=System.nanoTime();val proof=get(target+"/api/local-proof?nonce="+nonce);val elapsed=(System.nanoTime()-at)/1000000;require(proof.getString("origin")==target&&proof.getString("nonce")==nonce&&LocalRouteProof.verify(publicKey,nonce,target,proof.getString("signature")));Pair(target,elapsed)}.getOrNull()})}
        var best:Pair<String,Long>?=null
        try{val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(4);repeat(submitted.size){val remaining=end-System.nanoTime();if(remaining<=0)return@repeat;val result=completion.poll(remaining,TimeUnit.NANOSECONDS)?.get();if(result!=null&&(best==null||result.second<best!!.second))best=result}}finally{submitted.forEach{it.cancel(true)};pool.shutdownNow()}
        val chosen=best?.takeIf{it.second+5<initial}?:return Result(current,null,initial)
        val session=cookie.split(';').map{it.trim()}.firstOrNull{it.startsWith("pc_remote_session=")}?:return Result(current,null,initial)
        val age=if(key.optBoolean("persistent"))"; Max-Age="+((key.optLong("expiresAt")-System.currentTimeMillis())/1000).coerceAtLeast(1)else""
        return Result(chosen.first,session+"; Path=/; HttpOnly; SameSite=Strict"+age,chosen.second)
    }
}
