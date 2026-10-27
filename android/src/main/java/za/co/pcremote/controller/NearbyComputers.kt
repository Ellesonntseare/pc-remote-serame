package za.co.pcremote.controller

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.Inet4Address
import java.util.ArrayDeque

/** Bounded DNS-SD discovery. Resolution is serial on older Android versions. */
class NearbyComputers(context:Context,private val event:(JSONObject)->Unit) {
    private val nsd=context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val handler=Handler(Looper.getMainLooper())
    private var listener:NsdManager.DiscoveryListener?=null
    private var generation=0
    private val queue=ArrayDeque<NsdServiceInfo>()
    private var resolving=false
    private val expiry=Runnable{stop();event(JSONObject().put("state","finished"))}
    fun start(){
        stop();val serial=++generation
        event(JSONObject().put("state","searching"))
        val next=object:NsdManager.DiscoveryListener{
            override fun onDiscoveryStarted(type:String){}
            override fun onDiscoveryStopped(type:String){}
            override fun onStartDiscoveryFailed(type:String,code:Int){handler.post{if(serial==generation){stop();event(JSONObject().put("state","error").put("message","Discovery is unavailable. Use the saved address below."))}}}
            override fun onStopDiscoveryFailed(type:String,code:Int){}
            override fun onServiceLost(info:NsdServiceInfo){}
            override fun onServiceFound(info:NsdServiceInfo){handler.post{if(serial==generation&&queue.size<16){queue.add(info);resolve(serial)}}}
        }
        listener=next
        try{nsd.discoverServices("_pcremote._tcp.",NsdManager.PROTOCOL_DNS_SD,next);handler.postDelayed(expiry,14000)}catch(_:Exception){stop();event(JSONObject().put("state","error").put("message","Use your PC's saved local address."))}
    }
    @Suppress("DEPRECATION") private fun resolve(serial:Int){
        if(resolving||queue.isEmpty()||serial!=generation)return
        resolving=true
        nsd.resolveService(queue.removeFirst(),object:NsdManager.ResolveListener{
            override fun onResolveFailed(info:NsdServiceInfo,code:Int){handler.post{if(serial==generation){resolving=false;resolve(serial)}}}
            override fun onServiceResolved(info:NsdServiceInfo){handler.post{
                if(serial!=generation)return@post
                resolving=false
                val host=info.host;val marker=info.attributes["app"]?.toString(Charsets.UTF_8)
                if(host is Inet4Address&&host.isSiteLocalAddress&&info.port in 1..65535&&marker=="pc-remote"){
                    event(JSONObject().put("state","found").put("name",info.serviceName.removeSuffix(" · PC Remote")).put("address",host.hostAddress).put("port",info.port).put("id",info.attributes["id"]?.toString(Charsets.UTF_8).orEmpty()))
                }
                resolve(serial)
            }}
        })
    }
    fun stop(){generation++;handler.removeCallbacks(expiry);queue.clear();resolving=false;listener?.let{runCatching{nsd.stopServiceDiscovery(it)}};listener=null}
}
