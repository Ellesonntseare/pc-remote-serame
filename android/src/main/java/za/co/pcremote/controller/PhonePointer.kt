package za.co.pcremote.controller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/** A touch-through cursor owned by the user-enabled accessibility service. */
internal class PhonePointer(context: Context) {
    private val windows = context.getSystemService(WindowManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val size = (32 * context.resources.displayMetrics.density).toInt().coerceAtLeast(32)
    private val view = object : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) {
            val scale = width / 32f
            canvas.save(); canvas.scale(scale, scale)
            val arrow = Path().apply {
                moveTo(2f, 2f); lineTo(2f, 25f); lineTo(8.5f, 19f)
                lineTo(13f, 29f); lineTo(17f, 27f); lineTo(12.5f, 17.5f)
                lineTo(22f, 17.5f); close()
            }
            paint.style = Paint.Style.FILL; paint.color = Color.rgb(14, 29, 43); canvas.drawPath(arrow, paint)
            paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.6f; paint.strokeJoin = Paint.Join.ROUND
            paint.color = Color.WHITE; canvas.drawPath(arrow, paint); canvas.restore()
        }
    }.apply { importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
    private val layout = WindowManager.LayoutParams(size, size, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT).apply {
        gravity = Gravity.TOP or Gravity.LEFT
        if (Build.VERSION.SDK_INT >= 30) setFitInsetsTypes(0)
        if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    private var attached = false
    private val expire = Runnable { hide() }
    fun move(point: PhonePoint, width: Int, height: Int): Boolean {
        val pixels = point.pixels(width, height)
        layout.x = pixels.first.toInt() - size / 16; layout.y = pixels.second.toInt() - size / 16
        return try {
            if (attached) windows.updateViewLayout(view, layout) else { windows.addView(view, layout); attached = true }
            main.removeCallbacks(expire); main.postDelayed(expire, 3500); true
        } catch (_: RuntimeException) { hide(); false }
    }
    fun hide() {
        main.removeCallbacks(expire)
        if (attached) { runCatching { windows.removeViewImmediate(view) }; attached = false }
    }
}
