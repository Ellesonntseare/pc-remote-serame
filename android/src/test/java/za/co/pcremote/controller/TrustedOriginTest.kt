package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class TrustedOriginTest {
    @Test fun localConnectionAcceptsPlainAddressesAndFullUrls(){
        assertEquals(Pair("192.168.8.100",7666),TrustedOrigin.localTarget(" 192.168.8.100 ",7666))
        assertEquals(Pair("10.0.0.2",8000),TrustedOrigin.localTarget("http://10.0.0.2:8000/",7666))
        assertEquals(Pair("172.20.0.2",7666),TrustedOrigin.localTarget("172.20.0.2:7666",9000))
        for(value in listOf("https://192.168.8.100","http://user@192.168.8.100","8.8.8.8","http://192.168.8.100/other","http://192.168.8.100:99999","192.168.8.999"))assertNull(value,TrustedOrigin.localTarget(value,7666))
    }
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
