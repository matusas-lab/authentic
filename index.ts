// index.ts - Custom Expo Router Entry Point
import "expo-router/entry";
import { AppRegistry } from "react-native";
import { trackIncomingSms } from "./src/store/smsStore";

// Handles SMS when the app is FULLY CLOSED (deep sleep / killed by OS)
AppRegistry.registerHeadlessTask(
  "ExpoSmsListenerBackground",
  () => async (data: any) => {
    console.log("[HeadlessJS] SMS received while app closed:", data);
    // Runs in headless JS without any React UI, navigator, or hooks mounted
    // await onBackgroundMessage({
    //   address: data.originatingAddress,
    //   body: data.body,
    //   date: data.timestamp ?? Date.now(),
    //   subscriptionId: data.subscriptionId ?? null,
    // });
    trackIncomingSms(data);
  },
);
