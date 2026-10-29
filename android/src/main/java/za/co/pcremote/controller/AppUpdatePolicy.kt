package za.co.pcremote.controller

object AppUpdatePolicy {
    const val MAX_BYTES=100L*1024*1024
    fun valid(version:String,size:Long,sha256:String)=Regex("^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$").matches(version)&&size in 1..MAX_BYTES&&Regex("^[a-fA-F0-9]{64}$").matches(sha256)
}
