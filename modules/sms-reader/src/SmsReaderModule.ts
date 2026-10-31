import { NativeModule, requireNativeModule } from "expo";
// import { SmsMessageInterface } from "./SmsReader.types";
import { HistoricalSmsMessage } from "@/models/types";

declare class SmsReaderModule extends NativeModule<{}> {
  readHistoricalSms(
    limit?: number | null,
    sinceTimestamp?: number | null,
  ): Promise<HistoricalSmsMessage[]>;
}

export default requireNativeModule<SmsReaderModule>("SmsReader");
