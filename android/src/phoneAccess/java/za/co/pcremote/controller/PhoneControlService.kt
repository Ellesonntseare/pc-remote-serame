package za.co.pcremote.controller

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.graphics.Path
import android.os.Bundle
import android.os.Build
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/** User-enabled input only. No event collection, UI text logging or startup control. */
class PhoneControlService : AccessibilityService() {
    companion object { var instance: PhoneControlService? = null; private set }
    private var pointer: PhonePointer? = null
    private var drag: PhoneDrag? = null
    override fun onServiceConnected() {
        super.onServiceConnected(); instance = this; pointer = PhonePointer(this); drag = PhoneDrag(this)
        if(Build.VERSION.SDK_INT>=33)serviceInfo=serviceInfo.apply{flags=flags or AccessibilityServiceInfo.FLAG_INPUT_METHOD_EDITOR}
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() { ScreenShareService.stopPhoneControl() }
    override fun onDestroy() { releaseInput(); if (instance === this) instance = null; ScreenShareService.stopPhoneControl(); super.onDestroy() }
    fun hidePointer() { pointer?.hide() }
    fun releaseInput() { hidePointer(); drag?.release() }
    private fun type(command:PhoneCommand):Boolean {
        val node=rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if(node==null||!node.isEditable||node.isPassword||node.packageName?.toString()==packageName)return false
        if(Build.VERSION.SDK_INT>=33){
            val connection=inputMethod?.currentInputConnection
            if(connection!=null){
                if(command.action=="insert")connection.commitText(command.text,1,null)
                else {val context=PhoneKeys.context(command);if(context!=null)connection.performContextMenuAction(context)else{connection.sendKeyEvent(PhoneKeys.event(command,KeyEvent.ACTION_DOWN));connection.sendKeyEvent(PhoneKeys.event(command,KeyEvent.ACTION_UP))}}
                return true
            }
        }
        if(za.co.pcremote.controller.keyboard.SerameKeyboardService.instance?.phoneInput(command)==true)return true
        if(command.action=="key"&&command.modifiers and 2!=0){
            val action=when(command.key){"c"->AccessibilityNodeInfo.ACTION_COPY;"x"->AccessibilityNodeInfo.ACTION_CUT;"v"->AccessibilityNodeInfo.ACTION_PASTE;"a"->AccessibilityNodeInfo.ACTION_SET_SELECTION;else->return false}
            return if(command.key=="a")node.performAction(action,Bundle().apply{putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT,0);putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT,node.text?.length?:0)})else node.performAction(action)
        }
        if(command.key=="Enter"&&Build.VERSION.SDK_INT>=30&&node.actionList.any{it.id==AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id})return node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
        val edit=PhoneTypingKeys.edit(node.text?.toString()?:"",node.textSelectionStart,node.textSelectionEnd,if(command.action=="insert")command.text else if(command.key=="Enter"&&node.isMultiLine)"\n" else null,command.key,command.modifiers and 1!=0)?:return false
        if(edit.text!=node.text?.toString()&&!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,Bundle().apply{putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,edit.text)}))return false
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION,Bundle().apply{putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT,edit.start);putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT,edit.end)})
    }
    fun perform(command: PhoneCommand, width: Int, height: Int, allowed: () -> Boolean, done: (Boolean, String) -> Unit) {
        if (!allowed() || !command.valid() || getSystemService(KeyguardManager::class.java).isDeviceLocked) { releaseInput(); done(false, "Phone control is unavailable or the phone is locked."); return }
        if (command.action == "hide-pointer") { hidePointer(); done(true, ""); return }
        if (command.action == "pointer") {
            done(width >= 2 && height >= 2 && pointer?.move(command.points.single(), width, height) == true, "")
            return
        }
        if(command.action.startsWith("touch-")){drag?.perform(command,width,height,done)?:done(false,"Phone touch is unavailable.");return}
        if(command.action in listOf("insert","key")){val result=type(command);done(result,if(result)"" else "Click a phone text field. On older Android versions, select Elleson Keyboard for full keyboard support.");return}
        if(drag?.active==true){done(false,"Release the phone drag first.");return}
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
