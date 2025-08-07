// src/screens/LoginScreen.js
import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [userKey, setUserKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const key = userKey.trim();
    if (key.length === 0) {
      setError('Please enter a user key');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(key);
      router.replace('/forms');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.full}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter User Key</Text>

        <TextInput
          style={styles.input}
          placeholder="User Key"
          autoCapitalize="none"
          value={userKey}
          onChangeText={setUserKey}
          editable={!loading}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  full:     { flex: 1, backgroundColor: '#fff' },
  container:{ flex: 1, justifyContent: 'center', padding: 20 },
  title:    { fontSize: 24, marginBottom: 16, textAlign: 'center', fontWeight: '600' },
  input:    { borderWidth:1, borderColor:'#ccc', borderRadius:6, padding:12, fontSize:16, marginBottom: 16 },
  button:   { backgroundColor: '#007AFF', borderRadius: 6, padding: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error:    { color: 'red', textAlign: 'center', marginTop: 12 },
});