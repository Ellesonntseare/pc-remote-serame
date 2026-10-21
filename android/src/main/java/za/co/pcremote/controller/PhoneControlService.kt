package za.co.pcremote.controller

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.graphics.Path
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/** User-enabled input only. No event collection, UI text logging or startup control. */
class PhoneControlService : AccessibilityService() {
    companion object { var instance: PhoneControlService? = null; private set }
    override fun onServiceConnected() { super.onServiceConnected(); instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() { ScreenShareService.stopPhoneControl() }
    override fun onDestroy() { if (instance === this) instance = null; ScreenShareService.stopPhoneControl(); super.onDestroy() }
    fun perform(command: PhoneCommand, width: Int, height: Int, allowed: () -> Boolean, done: (Boolean, String) -> Unit) {
        if (!allowed() || !command.valid() || getSystemService(KeyguardManager::class.java).isDeviceLocked) { done(false, "Phone control is unavailable or the phone is locked."); return }
        if (command.action in listOf("back", "home", "recents")) {
            val action = when (command.action) { "back" -> GLOBAL_ACTION_BACK; "home" -> GLOBAL_ACTION_HOME; else -> GLOBAL_ACTION_RECENTS }
            done(performGlobalAction(action), ""); return
        }
        if (command.action == "text") {
            val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (node == null || !node.isEditable || node.isPassword || node.packageName?.toString() == packageName) { done(false, "Select an editable field in another app. Password fields are excluded."); return }
            val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, command.text) }
            done(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args), ""); return
        }
        if (width < 2 || height < 2) { done(false, "Wait for the phone display."); return }
        val start = command.points.first().pixels(width, height)
        val path = Path().apply { moveTo(start.first, start.second); if (command.action == "swipe") { val end = command.points.last().pixels(width, height); lineTo(end.first, end.second) } }
        val duration = when (command.action) { "longpress" -> 650L; "swipe" -> command.duration.toLong(); else -> 60L }
        val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, duration)).build()
        val started = dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) { done(true, "") }
            override fun onCancelled(gestureDescription: GestureDescription?) { done(false, "Phone gesture was cancelled.") }
        }, null)
        if (!started) done(false, "Android could not perform that gesture.")
    }
}
