package za.co.pcremote.controller

import android.content.Context
import android.media.MediaCodecList
import android.view.WindowManager

object SecondScreenDevice {
    private var cached:Boolean?=null
    @Suppress("DEPRECATION")
    fun supports60(context:Context):Boolean {cached?.let{return it};val value=runCatching{val display=(context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay;if(display.mode.refreshRate<59)return@runCatching false;MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any{info->!info.isEncoder&&!info.name.startsWith("OMX.google.")&&!info.name.startsWith("c2.android.")&&info.supportedTypes.any{it.equals("video/avc",true)}&&runCatching{info.getCapabilitiesForType("video/avc").videoCapabilities.areSizeAndRateSupported(1280,720,60.0)}.getOrDefault(false)}}.getOrDefault(false);cached=value;return value}
}
