import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { router } from 'expo-router';

export default function AdminLogin() {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const canSubmit = useMemo(
    () => !loading && username.trim().length > 0 && password.length > 0,
    [loading, username, password]
  );

  const passwordRef = useRef(null);

  const handleLogin = async () => {
    if (!canSubmit) return;
    const u = username.trim();
    const p = password;

    if (!u || !p) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      Keyboard.dismiss();
      const result = await login(u, p);
      if (result?.success) {
        router.replace('/admin');
      } else {
        Alert.alert('Error', result?.error || 'Login failed');
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <View style={styles.passwordRow}>
        <TextInput
          ref={passwordRef}
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPass}
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity
          onPress={() => setShowPass(s => !s)}
          style={styles.toggle}
          accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.toggleText}>{showPass ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={!canSubmit}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Logging in…' : 'Login'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#333' },
  input: {
    borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 8,
    marginBottom: 15, fontSize: 16,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  toggle: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 10 },
  toggleText: { color: '#007AFF', fontWeight: '600' },
  button: {
    backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10,
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
