package za.co.pcremote.controller

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

object AppUpdateVerifier {
    @Suppress("DEPRECATION")
    fun verify(context:Context,file:File){
        val base=File(context.cacheDir,"updates").canonicalFile
        require(file.canonicalFile.parentFile==base&&file.isFile&&file.length() in 1..AppUpdatePolicy.MAX_BYTES){"The update file is not available."}
        val flags=if(Build.VERSION.SDK_INT>=28)PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val next=context.packageManager.getPackageArchiveInfo(file.absolutePath,flags)?:error("Android could not read this update.")
        val current=context.packageManager.getPackageInfo(context.packageName,flags)
        require(next.packageName==context.packageName){"This update is for a different app."}
        fun code(info:PackageInfo)=if(Build.VERSION.SDK_INT>=28)info.longVersionCode else info.versionCode.toLong()
        require(code(next)>code(current)){"The installed app is already this version or newer."}
        fun signers(info:PackageInfo):Set<String> {val signatures=if(Build.VERSION.SDK_INT>=28)info.signingInfo?.apkContentsSigners else info.signatures;return signatures.orEmpty().map{signature->MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString(""){"%02x".format(it)}}.toSet()}
        val trusted=signers(current)
        require(trusted.isNotEmpty()&&signers(next)==trusted){"The update is not signed with your app's existing key."}
    }
}
