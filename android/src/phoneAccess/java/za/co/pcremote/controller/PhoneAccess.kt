package za.co.pcremote.controller

import android.content.Context

object PhoneAccess {
    val controlEnabled: Boolean get() = PhoneControlService.instance != null
    fun transferContext(context: Context): Context = PhoneControlService.instance ?: context
}
