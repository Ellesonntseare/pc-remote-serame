package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class TrustedOriginTest {
    @Test fun approvedPrivateNetworksStayBoundToTheirOrigin() {
        assertEquals("http://192.168.1.2:7666", TrustedOrigin.normalize("http://192.168.1.2:7666/path"))
        assertEquals("http://10.0.0.2:7666", TrustedOrigin.normalize("http://10.0.0.2:7666/"))
    }
    @Test fun websiteUsesHttpsAndItsExactHost() {
        assertEquals("https://remote.teamtrader.co.za", TrustedOrigin.normalize("https://remote.teamtrader.co.za/"))
        assertNull(TrustedOrigin.normalize("http://remote.teamtrader.co.za/"))
        assertNull(TrustedOrigin.normalize("https://remote.teamtrader.co.za.example.com/"))
        assertNull(TrustedOrigin.normalize("https://remote.teamtrader.co.za:444/"))
    }
    @Test fun outsideOriginsCredentialsAndLocalFilesCannotUseTheBridge() {
        for (value in listOf("file:///sdcard/private", "javascript:alert(1)", "https://evil.example/", "http://8.8.8.8:7666/", "https://user:password@remote.teamtrader.co.za/", "http://192.168.999.2:7666/")) assertNull(value, TrustedOrigin.normalize(value))
    }
}
