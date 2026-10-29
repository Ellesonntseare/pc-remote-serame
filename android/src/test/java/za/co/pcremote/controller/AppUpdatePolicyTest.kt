package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class AppUpdatePolicyTest {
    @Test fun boundsAndDigestAreRequired(){assertTrue(AppUpdatePolicy.valid("2.3.0",3000000,"a".repeat(64)));assertFalse(AppUpdatePolicy.valid("https://other.invalid",3000000,"a".repeat(64)));assertFalse(AppUpdatePolicy.valid("2.3.0",0,"a".repeat(64)));assertFalse(AppUpdatePolicy.valid("2.3.0",AppUpdatePolicy.MAX_BYTES+1,"a".repeat(64)));assertFalse(AppUpdatePolicy.valid("2.3.0",3,"unknown"))}
}
