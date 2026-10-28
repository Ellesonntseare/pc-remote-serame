package za.co.pcremote.controller.keyboard

import java.util.Locale

/** Small offline vocabulary. Only completed words explicitly typed here are learned. */
internal class WordSuggestions(saved: String = "") {
    private val learned = linkedMapOf<String, Int>()
    init {
        saved.lineSequence().take(600).forEach { line ->
            val parts=line.split('\t'); val word=parts.firstOrNull().orEmpty()
            val count=parts.getOrNull(1)?.toIntOrNull()?:0
            if(valid(word)&&count>0) learned[word]=count.coerceAtMost(10000)
        }
    }
    fun learn(word: String) {
        val key=word.lowercase(Locale.ROOT)
        if(!valid(key))return
        learned[key]=((learned[key]?:0)+1).coerceAtMost(10000)
        if(learned.size>500)learned.minByOrNull { it.value }?.key?.let { learned.remove(it) }
    }
    fun saved()=learned.entries.joinToString("\n") { "${it.key}\t${it.value}" }
    fun suggest(prefix: String, personal: Boolean = true): List<String> {
        if(prefix.isNotEmpty()&&!valid(prefix,1))return emptyList()
        val key=prefix.lowercase(Locale.ROOT)
        val ranked=(if(personal)learned.keys else emptySet()).plus(common).distinct()
            .filter { it.startsWith(key)&&it!=key }
            .sortedWith(compareByDescending<String> { if(personal)learned[it]?:0 else 0 }.thenBy { common.indexOf(it).let { n->if(n<0)Int.MAX_VALUE else n } }.thenBy { it })
        return ranked.take(3).map { word ->
            when {
                prefix.length>1&&prefix.all { !it.isLetter()||it.isUpperCase() } -> word.uppercase(Locale.ROOT)
                prefix.firstOrNull()?.isUpperCase()==true -> word.replaceFirstChar { it.titlecase(Locale.ROOT) }
                else -> word
            }
        }
    }
    companion object {
        fun prefix(text: String)=text.takeLastWhile { it.isLetter()||it=='\''||it=='’' }.takeIf { it.length<=40 }.orEmpty()
        private fun valid(word: String, minimum:Int=2)=word.length in minimum..40&&word.first().isLetter()&&word.last().isLetter()&&word.all { it.isLetter()||it=='\''||it=='’' }
        private val common=("the to and you that have for with this can will your what are please thanks hello yes okay good " +
            "morning night today tomorrow yesterday later now soon time want need like know think come going home work " +
            "call message send see help thank sorry welcome great how where when why who which about after again also " +
            "always another answer anything because before better both bring busy check clear close computer connect " +
            "could day did different does done down each easy email enough even every everything example family fast " +
            "file find fine first folder friend from get give happy here hope house important inside just keep keyboard " +
            "last leave left let link list little live look love make many meet more most much music name never next " +
            "nice not nothing number off once one only open other our out over people phone photo picture place play " +
            "problem ready really remember right same save screen select share should show simple something start still " +
            "stop sure take talk tell text then there these thing those through together too transfer try two typing " +
            "under understand until update use very video wait way week well were while wish without word would write " +
            "wrong year yourself myself myself I'm I'll it's don't can't isn't let's we've you're that's").split(' ').map { it.lowercase(Locale.ROOT) }.distinct()
    }
}
