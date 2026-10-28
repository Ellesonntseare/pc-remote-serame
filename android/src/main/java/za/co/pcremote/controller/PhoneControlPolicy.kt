package za.co.pcremote.controller

data class PhonePoint(val x: Double, val y: Double) {
    fun valid() = x.isFinite() && y.isFinite() && x in 0.0..1.0 && y in 0.0..1.0
    fun pixels(width: Int, height: Int) = (x * (width - 1).coerceAtLeast(0)).toFloat() to (y * (height - 1).coerceAtLeast(0)).toFloat()
}
data class PhoneCommand(val action: String, val points: List<PhonePoint> = emptyList(), val duration: Int = 0, val text: String = "", val key: String = "", val modifiers: Int = 0) {
    fun valid(): Boolean = when (action) {
        "tap", "longpress", "pointer", "touch-start", "touch-move", "touch-end" -> points.size == 1 && points.all { it.valid() }
        "swipe" -> points.size == 2 && points.all { it.valid() } && duration in 100..1500
        "back", "home", "recents", "hide-pointer", "touch-cancel" -> true
        "text" -> text.length <= 2000 && !text.contains('\u0000')
        "insert" -> text.isNotEmpty() && text.length <= 256 && !text.contains('\u0000')
        "key" -> key in PhoneTypingKeys.names && modifiers in 0..7
        else -> false
    }
}
/** Local consent is required even if a server were to send an unsolicited action. */
class PhoneControlPolicy(private val now: () -> Long) {
    private var id: String? = null
    private var until = 0L
    private var lastSeq = 0L
    fun grant(request: String, duration: Long = 600000) { require(Regex("^[a-f0-9]{32}$").matches(request)); id = request; until = now() + duration.coerceIn(1,600000); lastSeq = 0 }
    fun revoke() { id = null; until = 0; lastSeq = 0 }
    fun active(request: String) = id == request && now() < until
    fun accept(request: String, seq: Long, generation: Int, currentGeneration: Int, command: PhoneCommand): Boolean {
        if (!active(request) || seq <= lastSeq || seq !in 1..1000000 || generation != currentGeneration || !command.valid()) return false
        lastSeq = seq; return true
    }
}
