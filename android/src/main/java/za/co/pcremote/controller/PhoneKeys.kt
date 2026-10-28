package za.co.pcremote.controller

import android.view.KeyEvent

internal object PhoneKeys {
    fun code(key:String)=when(key){
        "Enter"->KeyEvent.KEYCODE_ENTER;"Backspace"->KeyEvent.KEYCODE_DEL;"Delete"->KeyEvent.KEYCODE_FORWARD_DEL
        "Tab"->KeyEvent.KEYCODE_TAB;"ArrowLeft"->KeyEvent.KEYCODE_DPAD_LEFT;"ArrowRight"->KeyEvent.KEYCODE_DPAD_RIGHT
        "ArrowUp"->KeyEvent.KEYCODE_DPAD_UP;"ArrowDown"->KeyEvent.KEYCODE_DPAD_DOWN
        "Home"->KeyEvent.KEYCODE_MOVE_HOME;"End"->KeyEvent.KEYCODE_MOVE_END;"PageUp"->KeyEvent.KEYCODE_PAGE_UP;"PageDown"->KeyEvent.KEYCODE_PAGE_DOWN
        else->KeyEvent.KEYCODE_A+(key.firstOrNull()?.code?:'a'.code)-'a'.code
    }
    fun meta(modifiers:Int)=(if(modifiers and 1!=0)KeyEvent.META_SHIFT_ON else 0) or (if(modifiers and 2!=0)KeyEvent.META_CTRL_ON else 0) or (if(modifiers and 4!=0)KeyEvent.META_ALT_ON else 0)
    fun context(command:PhoneCommand):Int?=if(command.modifiers and 2==0)null else when(command.key){
        "a"->android.R.id.selectAll;"c"->android.R.id.copy;"x"->android.R.id.cut;"v"->android.R.id.paste;else->null
    }
    fun event(command:PhoneCommand,action:Int):KeyEvent {
        val time=android.os.SystemClock.uptimeMillis()
        return KeyEvent(time,time,action,code(command.key),0,meta(command.modifiers))
    }
}
