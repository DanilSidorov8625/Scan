import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="add-email" options={{ headerShown: false }} />
    </Stack>
  );
}