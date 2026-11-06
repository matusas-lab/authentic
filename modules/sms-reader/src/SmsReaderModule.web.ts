// modules/sms-reader/src/SmsReaderModule.web.ts
import { registerWebModule, NativeModule } from "expo";
import {
  DEFAULT_SMS_COLUMNS,
  GetInboxSmsOptions,
  OrderBy,
  SmsColumn,
  SmsFilter,
  SmsMessage,
  Sort,
} from "./SmsReader.types";

class SmsReaderWebModule extends NativeModule<{}> {
  async getInboxSms(
    _optionsOrLimit?: GetInboxSmsOptions | number | null,
    _sinceTimestamp?: number | null
  ): Promise<SmsMessage[]> {
    return [];
  }
}

export async function getInboxSms(
  _optionsOrLimit?: GetInboxSmsOptions | number | null,
  _sinceTimestamp?: number | null
): Promise<SmsMessage[]> {
  return [];
}

registerWebModule(SmsReaderWebModule, "SmsReader");

const SmsReaderModule = {
  getInboxSms,
  SmsColumn,
  DEFAULT_SMS_COLUMNS,
  SmsFilter,
  OrderBy,
  Sort,
};

export default SmsReaderModule;
export * from "./SmsReader.types";
