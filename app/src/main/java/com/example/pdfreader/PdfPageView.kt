package com.example.pdfreader

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PointF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class PdfPageView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0,
) : View(context, attrs, defStyle) {

    data class TextAnnotation(val text: String, val x: Float, val y: Float)

    private var bitmap: Bitmap? = null
    private val annotations = mutableListOf<TextAnnotation>()
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.RED
        textSize = 36f
        isFakeBoldText = true
    }

    var annotationText: String? = null
    var onTap: ((PointF) -> Unit)? = null

    fun setBitmap(bmp: Bitmap?) {
        bitmap = bmp
        invalidate()
    }

    fun clearAnnotations() {
        annotations.clear()
        invalidate()
    }

    fun addAnnotation(annotation: TextAnnotation) {
        annotations.add(annotation)
        invalidate()
    }

    fun annotationsForCurrentPage(): List<TextAnnotation> = annotations.toList()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bmp = bitmap ?: return
        val scale = minOf(
            width.toFloat() / bmp.width,
            height.toFloat() / bmp.height,
        )
        val drawW = bmp.width * scale
        val drawH = bmp.height * scale
        val left = (width - drawW) / 2f
        val top = (height - drawH) / 2f
        val dst = android.graphics.RectF(left, top, left + drawW, top + drawH)
        canvas.drawBitmap(bmp, null, dst, null)
        for (a in annotations) {
            canvas.drawText(a.text, left + a.x * scale, top + a.y * scale, textPaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_UP) {
            val bmp = bitmap ?: return false
            val scale = minOf(
                width.toFloat() / bmp.width,
                height.toFloat() / bmp.height,
            )
            val drawW = bmp.width * scale
            val drawH = bmp.height * scale
            val left = (width - drawW) / 2f
            val top = (height - drawH) / 2f
            val px = (event.x - left) / scale
            val py = (event.y - top) / scale
            if (px in 0f..bmp.width.toFloat() && py in 0f..bmp.height.toFloat()) {
                onTap?.invoke(PointF(px, py))
            }
            performClick()
            return true
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
