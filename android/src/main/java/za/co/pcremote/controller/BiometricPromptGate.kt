package za.co.pcremote.controller

/** Open one automatic prompt per locked origin in a foreground visit. */
internal class BiometricPromptGate {
    private var promptedOrigin:String?=null
    fun request(origin:String,foreground:Boolean,locked:Boolean,busy:Boolean):Boolean {
        if(!foreground||!locked||busy||promptedOrigin==origin)return false
        promptedOrigin=origin
        return true
    }
    fun reset(){promptedOrigin=null}
}
