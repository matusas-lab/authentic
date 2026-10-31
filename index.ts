// index.ts - Custom Expo Router Entry Point
import { AppRegistry } from 'react-native';
import 'expo-router/entry';
import { trackIncomingSms } from './src/store/smsStore';

// Handles SMS when the app is FULLY CLOSED (deep sleep / killed by OS)
AppRegistry.registerHeadlessTask(
  'ExpoSmsListenerBackground',
  () => async (data: any) => {
    console.log('📱 [HeadlessJS] SMS received while app closed:', data);
    trackIncomingSms(data);
  }
);
