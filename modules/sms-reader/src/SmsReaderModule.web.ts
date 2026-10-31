import { registerWebModule, NativeModule } from 'expo';

class SmsReaderModule extends NativeModule<{}> {
  PI = Math.PI;

  hello() {
    return 'Hello world! 👋';
  }

  async setValueAsync(value: string): Promise<void> {}
}

export default registerWebModule(SmsReaderModule, 'SmsReaderModule');
