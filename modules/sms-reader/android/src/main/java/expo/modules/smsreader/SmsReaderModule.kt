package expo.modules.smsreader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Imports the Android Manifest class so we can reference the READ_SMS permission.
import android.Manifest

// Imports Android's ContentResolver API for querying content providers.
import android.content.ContentResolver

// Imports Android's Uri class for accessing the SMS inbox content provider.
import android.net.Uri


class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")
 // Supports an optional limit and an optional filter for start timestamp (in ms)
    AsyncFunction("readHistoricalSms") { limit: Int?, sinceTimestamp: Long? ->
        val context = appContext.reactContext ?: throw Exception("React context is unavailable")
        val contentResolver: ContentResolver = context.contentResolver
        // Use content://sms to capture all incoming messages
        val smsUri: Uri = Uri.parse("content://sms")
        val projection = arrayOf(
            "_id",
            "thread_id",  // <-- CRITICAL: Allows grouping like the native SMS app
            "address",
            "body",
            "date",
            "date_sent",
            "read",
            "type"
        )
        // Filter for incoming messages (type = 1) or all, and optional date filter
        val selectionClauses = mutableListOf<String>()
        val selectionArgs = mutableListOf<String>()
        // Default to incoming inbox messages
        selectionClauses.add("(type = 1 OR type = 0)")
        if (sinceTimestamp != null && sinceTimestamp > 0L) {
            selectionClauses.add("date >= ?")
            selectionArgs.add(sinceTimestamp.toString())
        }
        val selection = selectionClauses.joinToString(" AND ")
        val sortOrder = if (limit != null && limit > 0) {
            "date DESC LIMIT $limit"
        } else {
            "date DESC"
        }
        val messages = mutableListOf<Map<String, Any?>>()
        val cursor = contentResolver.query(
            smsUri,
            projection,
            selection,
            if (selectionArgs.isNotEmpty()) selectionArgs.toTypedArray() else null,
            sortOrder
        )
        cursor?.use {
            val idIndex = it.getColumnIndex("_id")
            val threadIdIndex = it.getColumnIndex("thread_id")
            val addressIndex = it.getColumnIndex("address")
            val bodyIndex = it.getColumnIndex("body")
            val dateIndex = it.getColumnIndex("date")
            val dateSentIndex = it.getColumnIndex("date_sent")
            val readIndex = it.getColumnIndex("read")
            val typeIndex = it.getColumnIndex("type")
            while (it.moveToNext()) {
                val id = if (idIndex >= 0) it.getLong(idIndex) else 0L
                val threadId = if (threadIdIndex >= 0) it.getLong(threadIdIndex) else 0L
                val sender = if (addressIndex >= 0) it.getString(addressIndex) else null
                val body = if (bodyIndex >= 0) it.getString(bodyIndex) else null
                val receivedAt = if (dateIndex >= 0) it.getLong(dateIndex) else 0L
                val sentAt = if (dateSentIndex >= 0) it.getLong(dateSentIndex) else 0L
                val read = if (readIndex >= 0) it.getInt(readIndex) != 0 else false
                val type = if (typeIndex >= 0) it.getInt(typeIndex) else 1
                // Skip rows where body is null (e.g. MMS notification stubs)
                if (body.isNullOrBlank()) continue
                messages.add(
                    mapOf(
                        "id" to id.toString(),
                        "threadId" to threadId.toString(),
                        "originatingAddress" to sender,
                        "body" to body,
                        "timestamp" to receivedAt,
                        "sentAt" to sentAt,
                        "read" to read,
                        "type" to type
                    )
                )
            }
        }
       messages
    }
  }
}
