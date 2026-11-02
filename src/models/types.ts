import type { SmsMessage } from "expo-sms-listener";

export interface InboxSmsMessages extends SmsMessage {
  id: string;
  sentAt: number;
  read: boolean;
  type: number;
}

export type HistoricalSmsMessage = InboxSmsMessages;

export interface NormalizedSms {
  source: "realtime" | "historical";
  id?: string;
  sender: string;
  body: string;
  receivedAt: number;
  sentAt?: number;
}

export function normalizeRealtime(sms: SmsMessage): NormalizedSms {
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
    id: sms.id,
    sender: sms.originatingAddress,
    body: sms.body,
    receivedAt: sms.timestamp,
    sentAt: sms.sentAt,
  }));
}
