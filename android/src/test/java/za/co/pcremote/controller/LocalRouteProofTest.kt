package za.co.pcremote.controller

import org.junit.Test
import org.junit.Assert.*
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

class LocalRouteProofTest {
    @Test fun bindsTheHostNonceAndActualLocalAddress(){val pair=KeyPairGenerator.getInstance("RSA").apply{initialize(2048)}.generateKeyPair();val publicKey=Base64.getEncoder().encodeToString(pair.public.encoded);val nonce="a".repeat(64);val origin="http://192.168.8.100:7666";val signature=Signature.getInstance("SHA256withRSA").run{initSign(pair.private);update("EllesonConnectLocal/v1|$nonce|$origin".toByteArray());Base64.getEncoder().encodeToString(sign())};assertTrue(LocalRouteProof.verify(publicKey,nonce,origin,signature));assertFalse(LocalRouteProof.verify(publicKey,"b".repeat(64),origin,signature));assertFalse(LocalRouteProof.verify(publicKey,nonce,"http://192.168.8.101:7666",signature));assertFalse(LocalRouteProof.verify("invalid",nonce,origin,signature))}
}
