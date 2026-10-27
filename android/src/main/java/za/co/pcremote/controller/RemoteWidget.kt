package za.co.pcremote.controller
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class RemoteWidget:AppWidgetProvider(){
    override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray){for(id in ids){val views=RemoteViews(context.packageName,R.layout.remote_widget);for((button,action)in listOf(R.id.widgetScreen to "screen",R.id.widgetFiles to "files",R.id.widgetAudio to "audio",R.id.widgetKeyboard to "keyboard")){val intent=Intent(context,MainActivity::class.java).setAction("za.co.pcremote.OPEN.$action").putExtra("quick_action",action).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP);views.setOnClickPendingIntent(button,PendingIntent.getActivity(context,action.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))};manager.updateAppWidget(id,views)}}
}
