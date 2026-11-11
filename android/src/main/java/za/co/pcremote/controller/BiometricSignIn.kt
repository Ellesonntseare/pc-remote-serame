package za.co.pcremote.controller

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Local app lock for the host's existing remembered session. No passwords or biometric templates are stored here. */
internal class BiometricSignIn(private val activity:FragmentActivity,private val web:WebView,private val parent:ViewGroup,
    private val currentOrigin:()->String?,private val navigate:(String,String)->Unit) {
    private val preferences=activity.getSharedPreferences("biometric_sign_in_v1",0)
    private val gate=BiometricGate()
    private var overlay:FrameLayout?=null
    private var label:TextView?=null
    private var prompt:BiometricPrompt?=null
    private var busy=false
    private var foreground=true
    private var pending:(()->Unit)?=null
    private var lockedOrigin:String?=null
    private var previousVisibility=View.GONE
    val locked:Boolean get()=overlay?.visibility==View.VISIBLE
    private fun key(origin:String)="elleson.bio."+MessageDigest.getInstance("SHA-256").digest(origin.toByteArray()).joinToString(""){"%02x".format(it)}
    private fun available()=BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)==BiometricManager.BIOMETRIC_SUCCESS
    fun enabled(origin:String)=preferences.contains(key(origin))
    fun state(origin:String)=JSONObject().put("available",available()).put("enabled",enabled(origin)).put("locked",locked)
        .put("message",if(available())"Use the fingerprint or secure face recognition enrolled on this phone." else "Set up a strong fingerprint or supported face unlock in Android settings. Password sign-in is still available.")
    private fun emit(origin:String,message:String?=null){val value=state(origin);if(message!=null)value.put("message",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:biometric-state',{detail:$value}))",null);refreshQuickButton()}
    fun refreshQuickButton(){val button=activity.findViewById<Button>(R.id.biometricQuickConnect)?:return;val origin=activity.getSharedPreferences("pc_remote_android",0).getString("lastOrigin",null);button.visibility=if(origin!=null&&enabled(origin))View.VISIBLE else View.GONE;button.setOnClickListener{if(origin!=null)navigate(origin,"")}}
    fun intercept(origin:String,suffix:String):Boolean {if(!enabled(origin)||gate.unlocked(origin))return false;show(origin){navigate(origin,suffix)};return true}
    private fun store():KeyStore=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    private fun cipher(origin:String,enroll:Boolean):Cipher {
        val alias=key(origin)
        if(enroll){store().deleteEntry(alias);val spec=KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true)
            .setUserAuthenticationValidityDurationSeconds(-1)
            if(Build.VERSION.SDK_INT>=30)spec.setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG)
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(spec.build());generateKey()}}
        val secret=store().getKey(alias,null) as? SecretKey?:throw IllegalStateException("Set up biometric sign-in again after using your password.")
        return Cipher.getInstance("AES/GCM/NoPadding").apply{
            if(enroll)init(Cipher.ENCRYPT_MODE,secret)
            else{val saved=JSONObject(preferences.getString(alias,null)?:throw IllegalStateException("Sign in with your password."));init(Cipher.DECRYPT_MODE,secret,GCMParameterSpec(128,Base64.decode(saved.getString("iv"),Base64.NO_WRAP)))}
            updateAAD(origin.toByteArray(Charsets.UTF_8))
        }
    }
    fun enable(origin:String){
        if(busy||locked)return
        if(!available()){emit(origin,state(origin).getString("message"));return}
        busy=true;val attempt=gate.begin(origin);val cookie=CookieManager.getInstance().getCookie(origin).orEmpty()
        Thread{
            val approved=runCatching{
                val connection=URL("$origin/api/ping").openConnection() as HttpURLConnection
                try{connection.connectTimeout=8000;connection.readTimeout=8000;connection.setRequestProperty("Cookie",cookie);connection.setRequestProperty("X-PCR","1");connection.instanceFollowRedirects=false
                    require(connection.responseCode==200);val text=connection.inputStream.use{input->val bytes=ByteArray(32768);var used=0;while(used<bytes.size){val count=input.read(bytes,used,bytes.size-used);if(count<0)break;used+=count};String(bytes,0,used,Charsets.UTF_8)};val reply=JSONObject(text)
                    reply.optBoolean("paired")&&reply.optString("role")=="owner"&&(reply.optBoolean("requirePassword")||reply.optBoolean("requirePin"))
                }finally{connection.disconnect()}
            }.getOrDefault(false)
            activity.runOnUiThread{busy=false;if(!foreground||currentOrigin()!=origin||!gate.accept(attempt))return@runOnUiThread
                if(!approved){emit(origin,"Sign in as the PC owner with a password or PIN before enabling biometrics.");return@runOnUiThread}
                android.app.AlertDialog.Builder(activity).setTitle("Enable fingerprint / face sign-in?")
                    .setMessage("Unlock this phone's saved Elleson Connect sign-in with Android biometrics. Use Remember me to keep a sign-in across PC restarts. Your fingerprint or face data stays with Android.")
                    .setNegativeButton("Cancel",null).setPositiveButton("Enable"){_,_->authenticate(origin,true)}.show()
            }
        }.start()
    }
    private fun authenticate(origin:String,enroll:Boolean=false){
        if(busy||!foreground)return
        if(!available()){label?.text="Biometrics are unavailable. Use your PC password or PIN below.";emit(origin);return}
        val operation=runCatching{cipher(origin,enroll)}.getOrElse{label?.text="Biometric settings changed. Use your password, then enable biometrics again in Settings.";emit(origin,"Biometric settings changed. Sign in with your password and set up biometrics again.");return}
        val attempt=gate.begin(origin);busy=true;label?.text="Confirm with Android’s fingerprint or face prompt."
        prompt=BiometricPrompt(activity,ContextCompat.getMainExecutor(activity),object:BiometricPrompt.AuthenticationCallback(){
            override fun onAuthenticationSucceeded(result:BiometricPrompt.AuthenticationResult){
                busy=false;if(!foreground||!gate.accept(attempt))return
                val success=runCatching{
                    val authenticated=result.cryptoObject?.cipher?:throw IllegalStateException("Android did not unlock the biometric key.")
                    if(enroll){val proof=ByteArray(32).also{SecureRandom().nextBytes(it)};val bytes=authenticated.doFinal(proof);proof.fill(0)
                        val record=JSONObject().put("iv",Base64.encodeToString(authenticated.iv,Base64.NO_WRAP)).put("proof",Base64.encodeToString(bytes,Base64.NO_WRAP));check(preferences.edit().putString(key(origin),record.toString()).commit())
                    }else{val record=JSONObject(preferences.getString(key(origin),null)!!);val proof=authenticated.doFinal(Base64.decode(record.getString("proof"),Base64.NO_WRAP));check(proof.size==32);proof.fill(0)}
                }.isSuccess
                if(!success){gate.lock();label?.text="Biometric sign-in could not unlock. Use your PC password or PIN.";emit(origin,"Biometric sign-in could not unlock. Use your password and set it up again.");return}
                if(enroll){emit(origin,"Fingerprint / face sign-in enabled. The app locks when you leave it.");return}
                val action=pending;pending=null;hide();action?.invoke();emit(origin)
            }
            override fun onAuthenticationError(code:Int,message:CharSequence){busy=false;label?.text=if(code==BiometricPrompt.ERROR_LOCKOUT||code==BiometricPrompt.ERROR_LOCKOUT_PERMANENT)"Android temporarily locked biometrics. Use your PC password or PIN." else "Authentication cancelled. Tap the fingerprint to try again, or use your password.";emit(origin,"Biometric authentication did not complete. Password sign-in is available.")}
            override fun onAuthenticationFailed(){label?.text="Not recognized. Try the sensor again."}
        })
        try{prompt!!.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(if(enroll)"Enable Elleson Connect biometrics" else "Unlock Elleson Connect").setSubtitle("Confirm with your enrolled fingerprint or supported face unlock")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("Cancel").build(),BiometricPrompt.CryptoObject(operation))}
        catch(_:Exception){busy=false;gate.lock();label?.text="Android could not start biometrics. Use your PC password or PIN.";emit(origin,"Android could not start biometric authentication.")}
    }
    private fun show(origin:String,action:(()->Unit)?=null){
        if(locked&&lockedOrigin==origin){if(action!=null)pending=action;return}
        hide();lockedOrigin=origin;pending=action;previousVisibility=web.visibility;web.visibility=View.INVISIBLE
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val root=FrameLayout(activity).apply{setBackgroundColor(Color.rgb(7,9,14));isClickable=true;isFocusable=true;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_YES};overlay=root
        val density=activity.resources.displayMetrics.density;fun dp(n:Int)=(n*density).toInt()
        val card=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(26),dp(30),dp(26),dp(28));background=GradientDrawable().apply{setColor(Color.rgb(18,22,33));cornerRadius=dp(24).toFloat();setStroke(dp(1),Color.rgb(42,48,61))}}
        fun text(value:String,size:Float,color:String)=TextView(activity).apply{text=value;textSize=size;setTextColor(Color.parseColor(color));gravity=Gravity.CENTER;setPadding(0,dp(8),0,dp(8))}
        card.addView(text("Biometric Login",24f,"#F1F5F9").apply{setTypeface(null,Typeface.BOLD)})
        card.addView(text("Unlock your saved sign-in with Android.",13f,"#8494AC"))
        val fingerprint=ImageButton(activity).apply{setImageResource(R.drawable.biometric_fingerprint);setPadding(dp(22),dp(22),dp(22),dp(22));contentDescription="Unlock with fingerprint or face";background=GradientDrawable().apply{setColor(Color.rgb(40,28,28));cornerRadius=dp(60).toFloat();setStroke(dp(1),Color.rgb(255,107,53))};setOnClickListener{authenticate(origin)}}
        card.addView(fingerprint,LinearLayout.LayoutParams(dp(112),dp(112)).apply{gravity=Gravity.CENTER;topMargin=dp(24);bottomMargin=dp(20)})
        label=text("Tap the fingerprint to authenticate.",12f,"#EB9A70");card.addView(label)
        card.addView(Button(activity).apply{text="Use PC password / PIN";isAllCaps=false;setTextColor(Color.rgb(170,187,208));setBackgroundColor(Color.TRANSPARENT);setOnClickListener{manualSignIn(origin)}},LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(52)))
        root.addView(card,FrameLayout.LayoutParams(minOf(dp(400),activity.resources.displayMetrics.widthPixels-dp(32)),ViewGroup.LayoutParams.WRAP_CONTENT,Gravity.CENTER));parent.addView(root,ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));root.requestFocus()
    }
    private fun hide(){if(overlay==null)return;overlay?.let{parent.removeView(it)};overlay=null;label=null;lockedOrigin=null;web.visibility=previousVisibility;activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)}
    private fun manualSignIn(origin:String){
        gate.lock();prompt?.cancelAuthentication();busy=false;val attempt=gate.begin(origin)
        // The fallback must clear this remembered session before showing the ordinary password form.
        CookieManager.getInstance().setCookie(origin,"pc_remote_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"+(if(origin.startsWith("https:"))"; Secure" else "")){
            if(!foreground||!gate.accept(attempt))return@setCookie
            CookieManager.getInstance().flush();pending=null;hide();navigate(origin,"")
        }
    }
    fun disable(origin:String){if(locked)return;preferences.edit().remove(key(origin)).apply();runCatching{store().deleteEntry(key(origin))};emit(origin,"Fingerprint / face sign-in disabled on this phone.")}
    fun background(skip:Boolean){foreground=false;if(skip)return;gate.lock();prompt?.cancelAuthentication();busy=false;currentOrigin()?.takeIf{enabled(it)}?.let{show(it)}}
    fun resume(){foreground=true;currentOrigin()?.takeIf{enabled(it)&&!gate.unlocked(it)}?.let{show(it)};refreshQuickButton()}
    fun close(){foreground=false;gate.lock();prompt?.cancelAuthentication();busy=false}
}
