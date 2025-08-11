// app/splash.jsx (or wherever your SplashScreen is)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';

export default function SplashScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('Checking for updates…');
  // splash screen needs to be in seperate file
  useEffect(() => {
    let didCancel = false;

    // hard timeout so we never hang here forever
    const failSafe = setTimeout(() => {
      if (!didCancel) router.replace('/(tabs)/forms');
    }, 8000);

    const run = async () => {
      try {
        // In dev / using Expo Go, OTA isn’t relevant
        if (__DEV__) {
          router.replace('/(tabs)/forms');
          return;
        }

        setStatus('Checking for updates…');
        const result = await Updates.checkForUpdateAsync();

        if (result.isAvailable) {
          setStatus('Downloading update…');
          await Updates.fetchUpdateAsync();

          // This reloads into the new update
          await Updates.reloadAsync();
          return; // we won’t reach here after reload
        }

        // No update — continue
        router.replace('/(tabs)/forms');
      } catch (e) {
        // Any error → don’t block startup
        console.log('OTA update check failed:', e);
        router.replace('/(tabs)/forms');
      }
    };

    run();

    return () => {
      didCancel = true;
      clearTimeout(failSafe);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan</Text>
      <Text style={styles.subtitle}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 48, fontWeight: 'bold', color: '#007AFF', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666' },
});
