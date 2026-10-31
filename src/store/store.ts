// src/store/store.ts
import { observable } from "@legendapp/state";
import { configureObservablePersistence, persistObservable } from "@legendapp/state/persist";
import { ObservablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
// 1. Global configuration
configureObservablePersistence({
    pluginLocal: ObservablePersistAsyncStorage,
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
