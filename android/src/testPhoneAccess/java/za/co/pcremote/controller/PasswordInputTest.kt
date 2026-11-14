package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test
import za.co.pcremote.controller.keyboard.PasswordInput

class PasswordInputTest {
    @Test fun rejectsTextWebVisibleAndNumericPasswordsWithOtherFlags() {
        for (type in listOf(0x81, 0x91, 0xe1, 0x12)) {
            assertTrue(PasswordInput.isPassword(type))
            assertTrue(PasswordInput.isPassword(type or 0x80000))
        }
    }
    @Test fun allowsOrdinaryTextNumberEmailAndPhoneFields() {
        for (type in listOf(0x1, 0x2, 0x21, 0x3)) assertFalse(PasswordInput.isPassword(type))
    }
}
