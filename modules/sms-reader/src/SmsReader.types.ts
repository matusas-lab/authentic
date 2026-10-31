import { SmsMessage } from "expo-sms-listener";
// Define your exported module types here.
export interface SmsMessageInterface {
  SmsMessage: SmsMessage;
  id: string;
  sentAt: number;
  read: boolean;
  type: number;
}

export type SmsReaderModuleType = {
  readHistoricalSms(): Promise<SmsMessageInterface[]>;
};
