import type { SmsMessage as ListenerSmsMessage } from "expo-sms-listener";
import type { SmsMessage as ReaderSmsMessage } from "../../modules/sms-reader/src/SmsReader.types";

export type InboxSmsMessages = ReaderSmsMessage;
export type HistoricalSmsMessage = ReaderSmsMessage;

export interface NormalizedSms {
  source: "realtime" | "historical";
  id?: string;
  sender: string;
  body: string;
  receivedAt: number;
  sentAt?: number;
}

export function normalizeRealtime(sms: ListenerSmsMessage): NormalizedSms {
  return {
    source: "realtime",
    sender: sms.originatingAddress,
    body: sms.body,
    receivedAt: sms.timestamp,
  };
}

export function normalizeHistorical(sms: InboxSmsMessages[]): NormalizedSms[] {
  return sms.map((sms) => ({
    source: "historical",
    id: sms.id != null ? String(sms.id) : undefined,
    sender: sms.originatingAddress || sms.address || "Unknown",
    body: sms.body || "",
    receivedAt: sms.timestamp || sms.date || Date.now(),
    sentAt: sms.sentAt ?? sms.dateSent ?? undefined,
  }));
}

