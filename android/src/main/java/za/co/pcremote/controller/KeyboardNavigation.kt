package za.co.pcremote.controller

/** Only reserve navigation space that the IME framework has not already fitted. */
internal object KeyboardNavigation {
    data class Space(val left: Int = 0, val right: Int = 0, val bottom: Int = 0)

    fun immersive(fullscreen: Boolean, requested: Boolean, visible: Boolean) =
        fullscreen && !requested && !visible

    fun overlap(x: Int, y: Int, width: Int, height: Int,
                windowWidth: Int, windowHeight: Int, bars: Space): Space {
        if (width <= 0 || height <= 0 || windowWidth <= 0 || windowHeight <= 0) return Space()
        return Space(
            (bars.left - x).coerceIn(0, bars.left.coerceAtLeast(0)),
            (x + width - (windowWidth - bars.right)).coerceIn(0, bars.right.coerceAtLeast(0)),
            (y + height - (windowHeight - bars.bottom)).coerceIn(0, bars.bottom.coerceAtLeast(0))
        )
    }
}
