package za.co.pcremote.controller

/** Enforce edition boundaries at the native bridge, including on older PC hosts. */
object AndroidFeaturePolicy {
    private val phoneAccessCommands = setOf(
        "start", "mark", "control-stop", "keyboard-settings",
        "phone-audio-start", "phone-audio-control", "local-media-start"
    )
    fun allows(command: String, phoneAccess: Boolean): Boolean =
        command !in setOf("app-update", "app-update-install") &&
            (phoneAccess || command !in phoneAccessCommands)
}
