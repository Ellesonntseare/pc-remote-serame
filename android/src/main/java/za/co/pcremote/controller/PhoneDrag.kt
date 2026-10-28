package za.co.pcremote.controller

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Handler
import android.os.Looper

/** Continue one Android touch across packets, including stationary long presses. */
internal class PhoneDrag(private val service: AccessibilityService) {
    private val main=Handler(Looper.getMainLooper())
    private var stroke: GestureDescription.StrokeDescription?=null
    private var x=0f;private var y=0f;private var busy=false;private var lifting=false
    private val watchdog=Runnable{release()}
    val active get()=stroke!=null||busy
    fun release(){
        main.removeCallbacks(watchdog)
        if(busy){lifting=true;return}
        val old=stroke?:return;stroke=null;lifting=false
        val path=Path().apply{moveTo(x,y)}
        runCatching{service.dispatchGesture(GestureDescription.Builder().addStroke(old.continueStroke(path,0,16,false)).build(),null,main)}
    }
    fun perform(command: PhoneCommand,width:Int,height:Int,done:(Boolean,String)->Unit){
        if(command.action=="touch-cancel"){release();done(true,"");return}
        if(busy){done(false,"Wait for the current touch.");return}
        if(command.action=="touch-start"&&stroke!=null){done(false,"A phone drag is already active.");return}
        if(command.action!="touch-start"&&stroke==null){done(false,"The phone touch ended. Press again to continue.");return}
        val point=command.points.single().pixels(width,height)
        val path=Path().apply{if(stroke==null)moveTo(point.first,point.second)else{moveTo(x,y);lineTo(point.first,point.second)}}
        val continuing=command.action!="touch-end"
        val next=if(stroke==null)GestureDescription.StrokeDescription(path,0,16,continuing)else stroke!!.continueStroke(path,0,16,continuing)
        x=point.first;y=point.second;busy=true;stroke=if(continuing)next else null
        main.removeCallbacks(watchdog);if(continuing)main.postDelayed(watchdog,2000)
        val accepted=service.dispatchGesture(GestureDescription.Builder().addStroke(next).build(),object:AccessibilityService.GestureResultCallback(){
            override fun onCompleted(description:GestureDescription?){busy=false;if(lifting)release();done(true,"")}
            override fun onCancelled(description:GestureDescription?){busy=false;stroke=null;lifting=false;main.removeCallbacks(watchdog);done(false,"Phone touch interrupted.")}
        },main)
        if(!accepted){busy=false;stroke=null;lifting=false;main.removeCallbacks(watchdog);done(false,"Android could not start this touch.")}
    }
}
