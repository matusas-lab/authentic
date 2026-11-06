package expo.modules.smsreader

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("getInboxSms") { options: Map<String, Any?>? ->
      val context = appContext.reactContext ?: throw Exception("React context is unavailable")
      val contentResolver: ContentResolver = context.contentResolver

      // 1. Resolve content URI (defaults to Inbox)
      val box = (options?.get("box") as? String)?.lowercase()
      val contentUri: Uri = when (box) {
        "sent" -> Telephony.Sms.Sent.CONTENT_URI
        "draft" -> Telephony.Sms.Draft.CONTENT_URI
        "all" -> Uri.parse("content://sms")
        else -> Telephony.Sms.Inbox.CONTENT_URI
      }

      // 2. Resolve Projection (Columns to fetch)
      val rawColumns = (options?.get("columns") as? List<*>)
        ?: (options?.get("projection") as? List<*>)
      val projection: Array<String> = if (!rawColumns.isNullOrEmpty()) {
        rawColumns.mapNotNull { it?.toString() }.toTypedArray()
      } else {
        arrayOf(
          Telephony.Sms._ID,
          Telephony.Sms.ADDRESS,
          Telephony.Sms.BODY,
          Telephony.Sms.DATE,
          Telephony.Sms.SUBSCRIPTION_ID
        )
      }

      // 3. Resolve Selection (WHERE clause) & SelectionArgs
      val selection: String? = (options?.get("selection") as? String)
        ?: ((options?.get("filter") as? Map<*, *>)?.get("selection") as? String)

      val rawSelectionArgs = (options?.get("selectionArgs") as? List<*>)
        ?: (options?.get("selection_args") as? List<*>)
        ?: ((options?.get("filter") as? Map<*, *>)?.get("selectionArgs") as? List<*>)
        ?: ((options?.get("filter") as? Map<*, *>)?.get("selection_args") as? List<*>)

      val selectionArgs: Array<String>? = rawSelectionArgs?.mapNotNull { it?.toString() }?.toTypedArray()

      // 4. Resolve Sort Order and Limit (prevents 2MB CursorWindow crashes on 1GB/2GB low-end cashier devices)
      val sortOrderArg = (options?.get("sortOrder") as? String)
        ?: (options?.get("sort_order") as? String)
      val limit = (options?.get("limit") as? Number)?.toInt()

      val sortOrder: String = when {
        sortOrderArg != null && limit != null && limit > 0 && !sortOrderArg.contains("LIMIT", ignoreCase = true) ->
          "$sortOrderArg LIMIT $limit"
        sortOrderArg != null ->
          sortOrderArg
        limit != null && limit > 0 ->
          "${Telephony.Sms.DATE} DESC LIMIT $limit"
        selection == null ->
          // Safe ceiling if query is completely unbounded to avoid OOM on 10,000+ SMS inboxes
          "${Telephony.Sms.DATE} DESC LIMIT 500"
        else ->
          "${Telephony.Sms.DATE} DESC"
      }

      // 5. Query ContentResolver with fallback for older Android versions & OEM customizations (Tecno, Infinix, Itel, MediaTek)
      var cursor: Cursor? = null
      val messages = mutableListOf<Map<String, Any?>>()

      try {
        cursor = contentResolver.query(
          contentUri,
          projection,
          selection,
          selectionArgs,
          sortOrder
        )
      } catch (e: SecurityException) {
        throw Exception("READ_SMS permission not granted to query SMS inbox: ${e.message}", e)
      } catch (e: Exception) {
        // Fallback: If custom projection (like sub_id) failed on an older OEM schema,
        // retry with universal core columns (available since Android 1.0)
        try {
          val safeCoreProjection = arrayOf(
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE
          )
          cursor = contentResolver.query(
            Uri.parse("content://sms"),
            safeCoreProjection,
            if (selection != null) "($selection) AND (type = 1 OR type = 0)" else "(type = 1 OR type = 0)",
            selectionArgs,
            sortOrder
          )
        } catch (inner: Exception) {
          throw Exception("Failed to query SMS on this device: ${inner.message}", inner)
        }
      }

      cursor?.use {
        while (it.moveToNext()) {
          val messageMap = HashMap<String, Any?>()

          // Read all columns present in the returned cursor
          for (columnName in it.columnNames) {
            val colIdx = it.getColumnIndex(columnName)
            if (colIdx < 0 || it.isNull(colIdx)) {
              messageMap[columnName] = null
              continue
            }

            when (columnName.lowercase()) {
              "_id", "thread_id", "date", "date_sent", "sub_id", "subscription_id", "sim_id", "sim_num" -> {
                messageMap[columnName] = it.getLong(colIdx)
              }
              "read", "seen" -> {
                messageMap[columnName] = it.getInt(colIdx) == 1
              }
              "type", "status", "error_code" -> {
                messageMap[columnName] = it.getInt(colIdx)
              }
              else -> {
                messageMap[columnName] = it.getString(colIdx)
              }
            }
          }

          // Resolve aliases
          val idVal = messageMap["_id"] ?: messageMap["id"]
          val addressVal = messageMap["address"] ?: messageMap["originating_address"]
          val bodyVal = messageMap["body"] ?: messageMap["message_body"]
          
          // Dual-SIM support across standard Android and MediaTek / Spreadtrum OEM variants (Tecno/Infinix/Itel)
          val subIdVal = messageMap["sub_id"]
            ?: messageMap["subscription_id"]
            ?: messageMap["sim_id"]
            ?: messageMap["sim_num"]

          // Normalize Timestamp (Handles devices storing Unix seconds instead of milliseconds)
          var rawDate = (messageMap["date"] ?: messageMap["timestamp"])
          var timestampMs = when (rawDate) {
            is Number -> rawDate.toLong()
            is String -> rawDate.toLongOrNull() ?: 0L
            else -> 0L
          }
          if (timestampMs in 1..9999999999L) {
            timestampMs *= 1000L
          }

          if (idVal != null) {
            messageMap["id"] = idVal.toString()
          }
          if (addressVal != null) {
            messageMap["address"] = addressVal
            messageMap["originatingAddress"] = addressVal
          }
          if (bodyVal != null) {
            messageMap["body"] = bodyVal
          }
          if (timestampMs > 0) {
            messageMap["date"] = timestampMs
            messageMap["timestamp"] = timestampMs
          }
          if (subIdVal != null) {
            val subIdNum = (subIdVal as? Number)?.toInt() ?: subIdVal.toString().toIntOrNull()
            messageMap["subscriptionId"] = subIdNum
            messageMap["sub_id"] = subIdNum
          }
          if (messageMap.containsKey("thread_id")) {
            messageMap["threadId"] = messageMap["thread_id"]?.toString()
          }
          if (messageMap.containsKey("date_sent")) {
            messageMap["dateSent"] = messageMap["date_sent"]
            messageMap["sentAt"] = messageMap["date_sent"]
          }
          if (messageMap.containsKey("service_center")) {
            messageMap["serviceCenterAddress"] = messageMap["service_center"]
          }

          // Skip rows without a body (e.g. carrier binary SMS or MMS stubs)
          val bodyStr = bodyVal?.toString()
          if (!bodyStr.isNullOrBlank()) {
            messages.add(messageMap)
          }
        }
      }

      messages
    }
  }
}
