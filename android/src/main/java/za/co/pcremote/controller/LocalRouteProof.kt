package za.co.pcremote.controller

import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

object LocalRouteProof {
    fun verify(publicKey:String,nonce:String,origin:String,signature:String):Boolean=runCatching{
        require(publicKey.length<=4096&&signature.length<=2048&&Regex("^[a-f0-9]{64}$").matches(nonce))
        val key=KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)))
        Signature.getInstance("SHA256withRSA").run{initVerify(key);update("EllesonConnectLocal/v1|$nonce|$origin".toByteArray(Charsets.UTF_8));verify(Base64.getDecoder().decode(signature))}
    }.getOrDefault(false)
}
