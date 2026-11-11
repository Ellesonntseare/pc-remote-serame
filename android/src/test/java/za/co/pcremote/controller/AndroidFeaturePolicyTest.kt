package za.co.pcremote.controller

import org.junit.Assert.*
import org.junit.Test

class AndroidFeaturePolicyTest {
    @Test fun standardRejectsPhoneAccessEvenWhenRequestedByAnOlderHost() {
        for (command in listOf("start", "mark", "control-stop", "keyboard-settings", "phone-audio-start", "phone-audio-control", "local-media-start")) {
            assertFalse(command, AndroidFeaturePolicy.allows(command, false))
            assertTrue(command, AndroidFeaturePolicy.allows(command, true))
        }
    }
    @Test fun neitherEditionCanRequestPackageInstallation() {
        for (edition in listOf(false, true)) for (command in listOf("app-update", "app-update-install"))
            assertFalse(AndroidFeaturePolicy.allows(command, edition))
    }
    @Test fun standardRetainsSecondScreenNormalKeyboardFilesAndStopActions() {
        for (command in listOf("second-screen-preferences", "second-screen-route", "second-screen-orientation", "keyboard", "keyboard-hide", "phone-file-offer", "phone-receive-folder", "transfer-pick", "transfer-control", "folder-sync-add", "stop", "phone-audio-stop", "local-media-stop"))
            assertTrue(command, AndroidFeaturePolicy.allows(command, false))
    }
}
