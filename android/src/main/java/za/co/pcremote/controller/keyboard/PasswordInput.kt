package za.co.pcremote.controller.keyboard

import android.text.InputType

internal object PasswordInput {
    fun isPassword(type: Int): Boolean {
        val kind = type and InputType.TYPE_MASK_CLASS
        val variation = type and InputType.TYPE_MASK_VARIATION
        return (kind == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD) ||
            (kind == InputType.TYPE_CLASS_TEXT && variation in listOf(
                InputType.TYPE_TEXT_VARIATION_PASSWORD,
                InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
                InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
            ))
    }
}
