package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class KeyboardNavigationTest {
    @Test fun typingKeepsSystemNavigationAvailableUntilImeFinishesClosing() {
        assertTrue(KeyboardNavigation.immersive(true, false, false))
        assertFalse(KeyboardNavigation.immersive(true, true, false))
        assertFalse(KeyboardNavigation.immersive(true, false, true))
        assertFalse(KeyboardNavigation.immersive(true, true, true))
        assertFalse(KeyboardNavigation.immersive(false, false, false))
    }

    @Test fun frameworkFittedKeyboardDoesNotGetADoubleNavigationGap() {
        val buttons=KeyboardNavigation.Space(bottom=48)
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 552, 400, 400, 400, 1000, buttons))
        assertEquals(KeyboardNavigation.Space(bottom=48), KeyboardNavigation.overlap(0, 600, 400, 400, 400, 1000, buttons))
        assertEquals(KeyboardNavigation.Space(bottom=24), KeyboardNavigation.overlap(0, 576, 400, 400, 400, 1000, buttons))
    }

    @Test fun gestureNavigationAndRepeatedLayoutsReserveOnlyTheActualOverlap() {
        val gestures=KeyboardNavigation.Space(bottom=24)
        repeat(3) {
            assertEquals(gestures, KeyboardNavigation.overlap(0, 550, 400, 450, 400, 1000, gestures))
        }
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 526, 400, 450, 400, 1000, gestures))
    }

    @Test fun landscapeSideNavigationAndRotationClearTheOldBottomSpace() {
        assertEquals(KeyboardNavigation.Space(right=48), KeyboardNavigation.overlap(0, 160, 1000, 240, 1000, 400, KeyboardNavigation.Space(right=48)))
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 160, 952, 240, 1000, 400, KeyboardNavigation.Space(right=48)))
        assertEquals(KeyboardNavigation.Space(left=48), KeyboardNavigation.overlap(0, 160, 1000, 240, 1000, 400, KeyboardNavigation.Space(left=48)))
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 600, 400, 400, 400, 1000, KeyboardNavigation.Space()))
    }

    @Test fun detachedOrUnmeasuredViewsDoNotReserveNavigationSpace() {
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 0, 0, 0, 400, 1000, KeyboardNavigation.Space(bottom=48)))
        assertEquals(KeyboardNavigation.Space(), KeyboardNavigation.overlap(0, 0, 400, 400, 0, 0, KeyboardNavigation.Space(bottom=48)))
    }
}
