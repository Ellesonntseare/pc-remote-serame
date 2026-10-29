package za.co.pcremote.controller

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.webkit.MimeTypeMap
import android.widget.Toast

/** Only actions for a completed, app-recorded download can grant its content URI. */
class TransferActionActivity : Activity() {
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        try {
            val origin=intent.getStringExtra("origin").orEmpty();val id=intent.getStringExtra("id").orEmpty();val command=intent.getStringExtra("command")
            val item=TransferService.completedDownload(this,origin,id)?:throw IllegalStateException("This download is no longer available.")
            val uri=Uri.parse(item.getString("uri"));if(uri.scheme!="content")throw IllegalStateException("Invalid document")
            val mime=contentResolver.getType(uri)?:MimeTypeMap.getSingleton().getMimeTypeFromExtension(item.optString("name").substringAfterLast('.').lowercase())?:"application/octet-stream"
            val action=when(command){"open"->Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime);"share"->Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri);else->throw IllegalArgumentException("Unknown transfer action")}
            action.clipData=ClipData.newRawUri("Elleson Connect download",uri);action.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(action,if(command=="share")"Share downloaded file" else "Open downloaded file"))
        }catch(_:Exception){Toast.makeText(this,"Could not open this download. Find it in your phone's Files app.",Toast.LENGTH_LONG).show()}
        finish()
    }
}
