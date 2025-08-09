import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function ExportLayout() {
  // const { token } = useAuth();
  // const router = useRouter();

  // useFocusEffect(
  //   useCallback(() => {
  //     if (!token) {
  //       router.replace('/admin/login');
  //     }
  //   }, [token])
  // );

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
