package za.co.pcremote.controller
import org.junit.Assert.*
import org.junit.Test
class PhoneControlPolicyTest {
    private val id = "a".repeat(32)
    @Test fun consentExpiryRevocationAndReplay() {
        var time = 0L; val policy = PhoneControlPolicy { time }; val tap = PhoneCommand("tap", listOf(PhonePoint(.5,.5)))
        assertFalse(policy.accept(id,1,1,1,tap));policy.grant(id);assertTrue(policy.accept(id,1,1,1,tap));assertFalse(policy.accept(id,1,1,1,tap))
        assertFalse(policy.accept("b".repeat(32),2,1,1,tap));assertFalse(policy.accept(id,2,1,2,tap));assertTrue(policy.accept(id,2,2,2,tap))
        time=600000;assertFalse(policy.accept(id,3,2,2,tap));policy.grant(id);policy.revoke();assertFalse(policy.accept(id,3,2,2,tap))
    }
    @Test fun commandsRejectInvalidCoordinatesAndBoundTextAndDuration() {
        assertFalse(PhoneCommand("tap",listOf(PhonePoint(Double.NaN,.5))).valid());assertFalse(PhoneCommand("tap",listOf(PhonePoint(1.1,0.0))).valid())
        assertFalse(PhoneCommand("swipe",listOf(PhonePoint(0.0,0.0),PhonePoint(1.0,1.0)),1501).valid());assertFalse(PhoneCommand("shell").valid())
        assertFalse(PhoneCommand("text",text="x".repeat(2001)).valid());assertFalse(PhoneCommand("text",text="\u0000").valid());assertTrue(PhoneCommand("text",text="你好\nhello").valid())
        assertEquals(1080f,PhonePoint(1.0,1.0).pixels(1081,2401).first);assertEquals(2400f,PhonePoint(1.0,1.0).pixels(1081,2401).second)
    }
}
