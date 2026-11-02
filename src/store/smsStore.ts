// src/store/smsStore.ts
import { InboxSmsMessages } from "@/models/types";
import { observable } from "@legendapp/state";
import { persistObservable } from "@legendapp/state/persist";
import "./store"; // Ensures global configureObservablePersistence is loaded

export interface SmsMessage {
  id: string;
  originatingAddress: string;
  body: string;
  timestamp: number;
  // syncStatus: 'pending' | 'synced' | 'failed';
}
// 1. Define the store shape containing the dictionary
export interface SmsStore {
  messages: Record<string, SmsMessage>;
}
// 2. Pass SmsStore (not SmsMessage) to observable<T>
export const smsStore$ = observable<SmsStore>({
  messages: {},
});

// Persist smsStore$ to storage so background Headless tasks save permanently
export const persistSmsStatus = persistObservable(smsStore$, {
  local: "authentic_sms_store",
});

export function generateSmsId(address: string, timestamp: number): string {
  const sanitizedAddress = address.replace(/[^\w]/g, "");
  return `${timestamp}_${sanitizedAddress}`;
}

export function trackIncomingSms(data: {
  originatingAddress: string;
  body: string;
  timestamp?: number;
}) {
  const timestamp = data.timestamp || Date.now();
  const id = generateSmsId(data.originatingAddress, timestamp);

  // O(1) existence check
  if (smsStore$.messages[id].peek()) {
    return;
  }

  // Direct keyed set
  smsStore$.messages[id].set({
    id,
    originatingAddress: data.originatingAddress,
    body: data.body,
    timestamp,
    // syncStatus: 'pending',
  });

  console.log("Incoming SMS tracked:", smsStore$.messages.peek());
}

export function trackHistoricalSms(inboxSms: InboxSmsMessages[]) {
  inboxSms.forEach((message) => {
    // const id = generateSmsId(message.originatingAddress, message.timestamp);
    console.log("inbox sms id: ", message.id);
    const smsId = message.id;
    // O(1) existence check
    if (smsStore$.messages[smsId].peek()) {
      return;
    }

    // Direct keyed set
    smsStore$.messages[smsId].set({
      id: smsId,
      originatingAddress: message.originatingAddress,
      body: message.body,
      timestamp: message.timestamp,
      // syncStatus: 'pending',
    });
  });

  console.log("Historical SMS tracked:", smsStore$.messages.peek());
}
