package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class BiometricPromptGateTest {
    private val origin="https://pc.example"
    @Test fun aVisibleForegroundLockStartsWithoutAnIconTap(){
        assertTrue(BiometricPromptGate().request(origin,true,true,false))
    }
    @Test fun duplicateResumeAndPostedCallbacksNeverOpenAnotherPrompt(){
        val gate=BiometricPromptGate()
        assertTrue(gate.request(origin,true,true,false))
        assertFalse(gate.request(origin,true,true,true))
        assertFalse(gate.request(origin,true,true,false))
    }
    @Test fun aCancelledPromptStaysDismissedUntilTheNextForegroundVisit(){
        val gate=BiometricPromptGate()
        assertTrue(gate.request(origin,true,true,false))
        assertFalse(gate.request(origin,true,true,false))
        gate.reset()
        assertTrue(gate.request(origin,true,true,false))
    }
    @Test fun aBackgroundScreenDoesNotConsumeItsForegroundPrompt(){
        val gate=BiometricPromptGate()
        assertFalse(gate.request(origin,false,true,false))
        assertTrue(gate.request(origin,true,true,false))
    }
    @Test fun anUnlockedScreenAndAnExistingOperationDoNotStartAuthentication(){
        val gate=BiometricPromptGate()
        assertFalse(gate.request(origin,true,false,false))
        assertFalse(gate.request(origin,true,true,true))
        assertTrue(gate.request(origin,true,true,false))
    }
    @Test fun aDifferentProtectedOriginReceivesItsOwnPrompt(){
        val gate=BiometricPromptGate()
        assertTrue(gate.request(origin,true,true,false))
        assertTrue(gate.request("https://another-pc.example",true,true,false))
    }
}
