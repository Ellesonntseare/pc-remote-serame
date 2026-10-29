package za.co.pcremote.controller

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

class AppUpdateActivity:Activity(){
    override fun onCreate(state:Bundle?){super.onCreate(state);offer()}
    private fun offer(){
        try{
            val file=File(intent.getStringExtra("file")?:error("The update file is missing."))
            AppUpdateVerifier.verify(this,file)
            if(!packageManager.canRequestPackageInstalls()){
                startActivityForResult(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")),31)
                return
            }
            val uri=FileProvider.getUriForFile(this,"$packageName.clipfiles",file)
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        }catch(error:Exception){Toast.makeText(this,error.message?:"The update could not open.",Toast.LENGTH_LONG).show()}
        finish()
    }
    @Deprecated("Android activity result bridge")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode==31){if(packageManager.canRequestPackageInstalls())offer()else{Toast.makeText(this,"Allow app updates from Elleson Connect when you want to install this update.",Toast.LENGTH_LONG).show();finish()}}}
}
