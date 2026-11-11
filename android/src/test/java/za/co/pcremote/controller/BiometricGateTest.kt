package za.co.pcremote.controller
import org.junit.Assert.*
import org.junit.Test
class BiometricGateTest {
 @Test fun cancelledOrBackgroundAttemptsNeverUnlock(){val gate=BiometricGate();val attempt=gate.begin("https://pc.example");assertFalse(gate.unlocked(attempt.origin));gate.lock();assertFalse(gate.accept(attempt));assertFalse(gate.unlocked(attempt.origin))}
 @Test fun successIsBoundToTheCurrentOriginAndAttempt(){val gate=BiometricGate();val old=gate.begin("https://old.example");val current=gate.begin("https://new.example");assertFalse(gate.accept(old));assertTrue(gate.accept(current));assertFalse(gate.unlocked(old.origin));assertTrue(gate.unlocked(current.origin));gate.lock();assertFalse(gate.unlocked(current.origin))}
}
