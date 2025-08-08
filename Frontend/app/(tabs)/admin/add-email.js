import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useAdmin } from '../../../contexts/AdminContext';
import { router } from 'expo-router';

export default function AddEmail() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { addEmail } = useAdmin();

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    const authHeader = 'Bearer admin-token';
    const result = await addEmail(email.trim().toLowerCase(), authHeader);
    setLoading(false);

    if (result.success) {
      Alert.alert('Success', 'Email added successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('Error', result.error || 'Failed to add email');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Email</Text>
          <Text style={styles.subtitle}>Add a new email address to the system</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.addButton, loading && styles.buttonDisabled]}
              onPress={handleAddEmail}
              disabled={loading}
            >
              <Text style={styles.addButtonText}>
                {loading ? 'Adding...' : 'Add Email'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 4,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 30,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addButton: {
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});