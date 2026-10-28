package za.co.pcremote.controller
import org.junit.Assert.*
import org.junit.Test
class PhoneTypingKeysTest {
    @Test fun insertsAtCursorAndReplacesOnlySelection(){
        assertEquals(PhoneTypingKeys.Edit("hello world",6,6),PhoneTypingKeys.edit("helloworld",5,5," "))
        assertEquals(PhoneTypingKeys.Edit("one three",9,9),PhoneTypingKeys.edit("one two",4,7,"three"))
        assertNull(PhoneTypingKeys.edit("text",-1,2,"x"))
    }
    @Test fun deletionNeverSplitsSurrogatePairs(){
        assertEquals(PhoneTypingKeys.Edit("ab",1,1),PhoneTypingKeys.edit("a😀b",3,3,key="Backspace"))
        assertEquals(PhoneTypingKeys.Edit("ab",1,1),PhoneTypingKeys.edit("a😀b",1,1,key="Delete"))
        assertEquals(PhoneTypingKeys.Edit("ac",1,1),PhoneTypingKeys.edit("abc",1,2,key="Backspace"))
    }
    @Test fun arrowsCanMoveAndExtendSelection(){
        assertEquals(PhoneTypingKeys.Edit("a😀b",1,1),PhoneTypingKeys.edit("a😀b",3,3,key="ArrowLeft"))
        assertEquals(PhoneTypingKeys.Edit("abc",1,2),PhoneTypingKeys.edit("abc",1,1,key="ArrowRight",shift=true))
    }
    @Test fun directInputIsBoundedAndRequiresValidKeyNames(){
        assertTrue(PhoneCommand("insert",text="hello 😀").valid());assertFalse(PhoneCommand("insert",text="").valid())
        assertFalse(PhoneCommand("insert",text="x".repeat(257)).valid());assertFalse(PhoneCommand("insert",text="\u0000").valid())
        assertTrue(PhoneCommand("key",key="Enter").valid());assertTrue(PhoneCommand("key",key="v",modifiers=2).valid())
        assertFalse(PhoneCommand("key",key="shell").valid());assertFalse(PhoneCommand("key",key="Enter",modifiers=8).valid())
        assertTrue(PhoneCommand("touch-start",listOf(PhonePoint(.2,.7))).valid());assertFalse(PhoneCommand("touch-move").valid())
    }
}
