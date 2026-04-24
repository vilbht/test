package com.example.pdfreader

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.example.pdfreader.databinding.ActivityMainBinding
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private var renderer: PdfRenderer? = null
    private var fileDescriptor: ParcelFileDescriptor? = null
    private var currentPageIndex: Int = 0
    private var workingFile: File? = null
    private val annotationsByPage = mutableMapOf<Int, MutableList<PdfPageView.TextAnnotation>>()
    private var annotateMode = false

    private val openDoc = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { loadPdfFromUri(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        binding.btnOpen.setOnClickListener {
            openDoc.launch(arrayOf("application/pdf"))
        }
        binding.btnPrev.setOnClickListener {
            if (currentPageIndex > 0) showPage(currentPageIndex - 1)
        }
        binding.btnNext.setOnClickListener {
            renderer?.let { r ->
                if (currentPageIndex < r.pageCount - 1) showPage(currentPageIndex + 1)
            }
        }
        binding.btnAnnotate.setOnClickListener { toggleAnnotateMode() }
        binding.btnSave.setOnClickListener { saveAnnotatedPdf() }
        binding.btnShare.setOnClickListener { shareCurrentPdf() }

        binding.pageView.onTap = { point ->
            if (annotateMode) {
                val text = binding.editAnnotation.text.toString().trim()
                if (text.isNotEmpty()) {
                    val ann = PdfPageView.TextAnnotation(text, point.x, point.y)
                    binding.pageView.addAnnotation(ann)
                    annotationsByPage.getOrPut(currentPageIndex) { mutableListOf() }.add(ann)
                }
            }
        }

        if (intent?.action == Intent.ACTION_VIEW) {
            intent.data?.let { loadPdfFromUri(it) }
        }
    }

    private fun toggleAnnotateMode() {
        annotateMode = !annotateMode
        binding.editAnnotation.visibility = if (annotateMode) View.VISIBLE else View.GONE
        Toast.makeText(
            this,
            if (annotateMode) getString(R.string.annotation_hint) else "Annotate off",
            Toast.LENGTH_SHORT,
        ).show()
    }

    private fun loadPdfFromUri(uri: Uri) {
        try {
            closeRenderer()
            val cacheFile = File(cacheDir, "current.pdf")
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output -> input.copyTo(output) }
            } ?: run {
                Toast.makeText(this, "Could not open PDF", Toast.LENGTH_SHORT).show()
                return
            }
            workingFile = cacheFile
            annotationsByPage.clear()
            val pfd = ParcelFileDescriptor.open(cacheFile, ParcelFileDescriptor.MODE_READ_ONLY)
            fileDescriptor = pfd
            renderer = PdfRenderer(pfd)
            showPage(0)
        } catch (e: Exception) {
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun showPage(index: Int) {
        val r = renderer ?: return
        currentPageIndex = index
        r.openPage(index).use { page ->
            val bitmap = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            binding.pageView.setBitmap(bitmap)
        }
        binding.pageView.clearAnnotations()
        annotationsByPage[index]?.forEach { binding.pageView.addAnnotation(it) }
        binding.txtPage.text = "${index + 1} / ${r.pageCount}"
    }

    private fun saveAnnotatedPdf(): File? {
        val r = renderer ?: run {
            Toast.makeText(this, "Open a PDF first", Toast.LENGTH_SHORT).show()
            return null
        }
        return try {
            val out = File(cacheDir, "annotated.pdf")
            val doc = PdfDocument()
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.RED
                textSize = 18f
                isFakeBoldText = true
            }
            for (i in 0 until r.pageCount) {
                r.openPage(i).use { page ->
                    val info = PdfDocument.PageInfo.Builder(page.width, page.height, i + 1).create()
                    val docPage = doc.startPage(info)
                    val bmp = Bitmap.createBitmap(page.width, page.height, Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    docPage.canvas.drawBitmap(bmp, 0f, 0f, null)
                    annotationsByPage[i]?.forEach { a ->
                        docPage.canvas.drawText(a.text, a.x / 2f, a.y / 2f, paint)
                    }
                    doc.finishPage(docPage)
                    bmp.recycle()
                }
            }
            FileOutputStream(out).use { doc.writeTo(it) }
            doc.close()
            workingFile = out
            Toast.makeText(this, "Saved to cache: ${out.name}", Toast.LENGTH_SHORT).show()
            out
        } catch (e: Exception) {
            Toast.makeText(this, "Save failed: ${e.message}", Toast.LENGTH_LONG).show()
            null
        }
    }

    private fun shareCurrentPdf() {
        val file = if (annotationsByPage.isNotEmpty()) saveAnnotatedPdf() else workingFile
        if (file == null || !file.exists()) {
            Toast.makeText(this, "Nothing to share", Toast.LENGTH_SHORT).show()
            return
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, getString(R.string.share)))
    }

    private fun closeRenderer() {
        try { renderer?.close() } catch (_: Exception) {}
        try { fileDescriptor?.close() } catch (_: Exception) {}
        renderer = null
        fileDescriptor = null
    }

    override fun onDestroy() {
        closeRenderer()
        super.onDestroy()
    }
}
