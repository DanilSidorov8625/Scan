// app/(tabs)/admin/_layout.js
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function AdminProtectedLayout() {
  const { isAuth, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!isAuth) {
    // Not logged in → send to auth flow
    return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
    </Stack>
  );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="add-email" options={{ headerShown: false }} />
    </Stack>
  );
}
