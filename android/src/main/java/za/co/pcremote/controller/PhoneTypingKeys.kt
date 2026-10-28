package za.co.pcremote.controller

/** Wire names are deliberately smaller than Android's complete key namespace. */
object PhoneTypingKeys {
    val names = setOf("Enter","Backspace","Delete","Tab","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","a","c","x","v","z","y")
    data class Edit(val text: String, val start: Int, val end: Int)
    fun edit(text: String, start: Int, end: Int, insert: String? = null, key: String = "", shift: Boolean = false): Edit? {
        if(start !in 0..text.length || end !in 0..text.length)return null
        val a=minOf(start,end);val b=maxOf(start,end)
        fun replace(from:Int,to:Int,value:String)=Edit(text.substring(0,from)+value+text.substring(to),from+value.length,from+value.length)
        if(insert!=null)return replace(a,b,insert)
        return when(key){
            "Backspace" -> if(a!=b)replace(a,b,"") else if(a>0)replace(text.offsetByCodePoints(a,-1),b,"") else Edit(text,a,b)
            "Delete" -> if(a!=b)replace(a,b,"") else if(b<text.length)replace(a,text.offsetByCodePoints(b,1),"") else Edit(text,a,b)
            "ArrowLeft","ArrowRight","Home","End" -> {
                val next=when(key){"Home"->0;"End"->text.length;"ArrowLeft"->if(!shift&&a!=b)a else if(end>0)text.offsetByCodePoints(end,-1) else 0;else->if(!shift&&a!=b)b else if(end<text.length)text.offsetByCodePoints(end,1) else text.length}
                Edit(text,if(shift)start else next,next)
            }
            else -> null
        }
    }
}
