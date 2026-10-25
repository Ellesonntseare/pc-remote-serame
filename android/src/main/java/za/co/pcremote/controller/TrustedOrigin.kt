package za.co.pcremote.controller

import java.net.URI

object TrustedOrigin {
    fun localTarget(value:String,defaultPort:Int):Pair<String,Int>?=try{
        val raw=value.trim()
        val uri=URI(if(raw.startsWith("http://",true))raw else "http://$raw")
        val host=uri.host
        val port=if(uri.port==-1)defaultPort else uri.port
        if(uri.scheme?.lowercase()=="http"&&host!=null&&privateIp(host)&&port in 1..65535&&uri.userInfo==null&&uri.query==null&&uri.fragment==null&&uri.path in listOf("","/"))Pair(host.split('.').joinToString("."){it.toInt().toString()},port)else null
    }catch(_:Exception){null}
    fun normalize(value: String): String? = try {
        val uri = URI(value)
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        val port = if (uri.port == -1) if (scheme == "https") 443 else 80 else uri.port
        when {
            uri.userInfo != null || port !in 1..65535 -> null
            scheme == "https" && host == "remote.teamtrader.co.za" && port == 443 -> "https://remote.teamtrader.co.za"
            scheme == "http" && host != null && privateIp(host) -> "http://$host:$port"
            else -> null
        }
    } catch (_: Exception) { null }

    fun privateIp(text: String): Boolean {
        if (!Regex("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$").matches(text)) return false
        val parts = text.split('.').mapNotNull { it.toIntOrNull() }
        return parts.size == 4 && parts.all { it in 0..255 } &&
            (parts[0] == 10 || parts[0] == 172 && parts[1] in 16..31 || parts[0] == 192 && parts[1] == 168)
    }
}
