// src/app/index.tsx
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Memo, observer } from '@legendapp/state/react';
import { when } from '@legendapp/state';
import {
  requestSmsPermissionAsync,
  startSmsListenerServiceAsync,
  useSmsListener,
} from 'expo-sms-listener';
import { smsStore$, trackIncomingSms, persistSmsStatus } from '@/store/smsStore';

export default observer(function HomeScreen() {
  // 1. Listen to incoming SMS while app is in foreground / active
  useSmsListener((msg) => {
    console.log('📩 [Foreground] SMS received:', msg.originatingAddress, msg.body);
    trackIncomingSms(msg);
  });

  // 2. Hydrate local storage & start Android foreground service
  useEffect(() => {
    (async () => {
      // Wait for AsyncStorage to load saved SMS
      await when(persistSmsStatus.state.isLoadedLocal);
      console.log('✅ SMS Store hydrated successfully!');

      // Request runtime SMS permissions and start persistent foreground service
      const { granted } = await requestSmsPermissionAsync();
      if (granted) {
        await startSmsListenerServiceAsync();
        console.log('🚀 SMS Foreground Service started');
      }
    })();
  }, []);

  // Quick simulation helper to test state without needing another phone
  const addSimulatedSms = () => {
    const timestamp = Date.now();
    trackIncomingSms({
      originatingAddress: 'Telebirr',
      body: `You received 4500 ETB at ${new Date(timestamp).toLocaleTimeString()}`,
      timestamp,
    });
  };

  const clearMessages = () => {
    smsStore$.messages.set({});
    console.log('🗑️ Cleared SMS messages');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.card}>
        <ThemedText type="title">Incoming SMS Tracker</ThemedText>

        {/* Reactive Hydration Status */}
        <Memo>
          {() => {
            const isLoaded = persistSmsStatus.state.isLoadedLocal.get();
            return (
              <ThemedText style={{ color: isLoaded ? '#4CAF50' : '#FF9800' }}>
                Storage Hydrated: {isLoaded ? 'YES ✅' : 'NO ⏳'}
              </ThemedText>
            );
          }}
        </Memo>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={addSimulatedSms}>
            <ThemedText style={styles.btnText}>+ Simulate SMS</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnDanger} onPress={clearMessages}>
            <ThemedText style={styles.btnText}>Clear</ThemedText>
          </TouchableOpacity>
        </View>

        {/* List of Incoming SMS */}
        <ThemedText type="subtitle" style={{ marginTop: Spacing.three }}>
          Tracked SMS:
        </ThemedText>
        <ScrollView style={styles.list}>
          <Memo>
            {() => {
              const messagesMap = smsStore$.messages.get();
              const list = Object.values(messagesMap ?? {}).sort(
                (a, b) => b.timestamp - a.timestamp
              );

              if (list.length === 0) {
                return (
                  <ThemedText type="small" style={{ opacity: 0.6 }}>
                    No SMS tracked yet. Send an SMS to this device or tap Simulate.
                  </ThemedText>
                );
              }

              return (
                <>
                  {list.map((sms) => (
                    <ThemedView key={sms.id} style={styles.item}>
                      <View style={styles.itemHeader}>
                        <ThemedText style={{ fontWeight: 'bold' }}>
                          {sms.originatingAddress}
                        </ThemedText>
                        <ThemedText type="small" style={{ opacity: 0.6 }}>
                          {new Date(sms.timestamp).toLocaleTimeString()}
                        </ThemedText>
                      </View>
                      <ThemedText style={{ marginTop: 4 }}>{sms.body}</ThemedText>
                    </ThemedView>
                  ))}
                </>
              );
            }}
          </Memo>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  card: { flex: 1, gap: Spacing.three },
  buttonRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  btnPrimary: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8 },
  btnDanger: { backgroundColor: '#FF3B30', padding: 12, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  list: { flex: 1, marginTop: Spacing.two },
  item: {
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
