// app/_layout.js
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Slot } from 'expo-router';
import { SQLiteProvider, openDatabaseSync } from 'expo-sqlite';
import { Suspense } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import migrations from '../drizzle/migrations';
import { AuthProvider } from '../contexts/AuthContext';
import { AdminProvider } from '../contexts/AdminContext';

export const DATABASE_NAME = 'scans.db';
const expoDb = openDatabaseSync(DATABASE_NAME);
// Temporary reset for testing
// expoDb.execSync('DROP TABLE IF EXISTS scans');
// expoDb.execSync('DROP TABLE IF EXISTS __drizzle_migrations');
const db = drizzle(expoDb);

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    console.error('Migration error details:', JSON.stringify(error, null, 2));
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.errorBox}>
          Migration error: {error?.message || 'Unknown error'}
        </Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.progressBox}>
          Migration in progress...
        </Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <AdminProvider>
        <Suspense
          fallback={
            <View style={styles.fullCenter}>
              <ActivityIndicator size="large" />
            </View>
          }
        >
          <SQLiteProvider
            databaseName={DATABASE_NAME}
            openDatabase={openDatabaseSync}
            options={{ enableChangeListener: true }}
            useSuspense
          >
            <Slot />
          </SQLiteProvider>
        </Suspense>
      </AdminProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: '#ef4444',
    color: '#fff',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  progressBox: {
    backgroundColor: '#f59e0b',
    color: '#fff',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
});