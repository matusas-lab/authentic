// src/store/store.ts
import { observable } from "@legendapp/state";
import {
  configureObservablePersistence,
  persistObservable,
} from "@legendapp/state/persist";
import { ObservablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import { ObservablePersistLocalStorage } from "@legendapp/state/persist-plugins/local-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { ObservablePersistMMKVv4 } from "./mmkvPlugin";

function resolvePlugin() {
  if (Platform.OS === "web") {
    return ObservablePersistLocalStorage;
  }
  try {
    const test = createMMKV({ id: "__test__" });
    test.remove("__test__");
    return ObservablePersistMMKVv4;
  } catch {
    console.warn(
      "[legend-state] Native MMKV is not linked in this runtime (e.g. Expo Go). Falling back to AsyncStorage.",
    );
    return ObservablePersistAsyncStorage;
  }
}

// 1. Global configuration
configureObservablePersistence({
  pluginLocal: resolvePlugin(),
  localOptions: {
    asyncStorage: {
      AsyncStorage,
    },
  },
});

export interface Transaction {
  id: number;
  amount: number;
  merchant: string;
  createdAt?: string;
}

// 2. Define state (Exported for index.tsx)
export const transactions$ = observable<{ data: Transaction[] }>({ data: [] });

// 3. Bind persistence (Exported for index.tsx)
export const persistStatus = persistObservable(transactions$, {
  local: "authentic_transactions_key",
});
