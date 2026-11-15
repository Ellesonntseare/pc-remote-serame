package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test
import za.co.pcremote.controller.keyboard.WordSuggestions

class WordSuggestionsTest {
    @Test fun completesPrefixAndPreservesCapitalization() {
        val words=WordSuggestions()
        assertTrue(words.suggest("key").contains("keyboard"))
        assertTrue(words.suggest("Hel").contains("Hello"))
        assertTrue(words.suggest("HEL").contains("HELLO"))
        assertEquals("don't",WordSuggestions.prefix("please don't"))
        assertEquals("",WordSuggestions.prefix("hello "))
    }
    @Test fun frequentWordsRankFirstAndSurviveRestart() {
        val words=WordSuggestions()
        words.learn("helicopter");repeat(4){words.learn("helpful")}
        assertEquals("helpful",words.suggest("hel").first())
        assertEquals("helpful",WordSuggestions(words.saved()).suggest("hel").first())
        assertEquals("helpful",words.suggest("").first())
        assertFalse(words.suggest("hel",false).contains("helpful"))
    }
    @Test fun boundedDictionaryRejectsNumbersAddressesAndArbitraryPastedText() {
        val words=WordSuggestions()
        for(word in listOf("123456","mail@example.com","hello world","a".repeat(41),"bad\nword"))words.learn(word)
        assertEquals("",words.saved())
        words.learn("Molo");assertEquals("molo",words.suggest("mo").first())
        assertTrue(words.suggest("123").isEmpty())
        assertTrue(words.suggest("word@example").isEmpty())
        assertEquals("",WordSuggestions("invalid\t-2\nhello\t0").saved())
    }
}
