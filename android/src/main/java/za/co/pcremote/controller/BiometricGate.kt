package za.co.pcremote.controller

/** A result belongs to one origin and one foreground attempt. */
internal class BiometricGate {
    data class Attempt(val origin:String,val generation:Long)
    private var generation=0L
    private var unlocked:String?=null
    fun begin(origin:String)=Attempt(origin,++generation)
    fun current(attempt:Attempt)=attempt.generation==generation
    fun accept(attempt:Attempt):Boolean {
        if(attempt.generation!=generation)return false
        generation++
        unlocked=attempt.origin
        return true
    }
    fun unlocked(origin:String)=unlocked==origin
    fun lock(){generation++;unlocked=null}
}
