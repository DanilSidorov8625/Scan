// app/forms/dynamic.js
import { useFocusEffect } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import formsConfig from '../../../config/forms.json';
import { scans } from '../../../db/schema';
import { generateId } from '../../../utils/generateID';
import { playSound } from '../../../utils/playSound';
import { makeZodSchema } from '../../../utils/zodSchemaBuilder';
import { useAuth } from '../../../contexts/AuthContext';

export default function DynamicFormScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { formId } = useLocalSearchParams();
  const form = formsConfig.forms.find(f => f.id === formId);
  const schema = form ? makeZodSchema(form) : null;

  const db = useSQLiteContext();
  if (!db) {
    console.error('SQLite context not available');
    return null;
  }
  const drizzleDb = drizzle(db);

  const [focused, setFocused] = useState(null);
  const [values, setValues] = useState({});
  const [message, setMessage] = useState(null); // { text, type: 'error'|'success' }
  const refs = useRef({});

  // auto‐focus first field
  useFocusEffect(useCallback(() => {
    if (!form?.fields?.length) return;
    const first = form.fields[0].id;
    setTimeout(() => {
      refs.current[first]?.focus();
      setFocused(first);
    }, 50);
  }, [form?.fields]));

  // play sound + auto‐clear message after 5s
  useEffect(() => {
    if (!message) return;
    playSound(message.type === 'error');
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const handleChange = (fieldId, text) => {
    setMessage(null); // clear any old message immediately
    setValues(v => ({ ...v, [fieldId]: text }));

    if (text.trim()) {
      const idx = form.fields.findIndex(f => f.id === fieldId);
      const nextField = form.fields[idx + 1];
      if (nextField) {
        refs.current[nextField.id]?.focus();
        setFocused(nextField.id);
      } else {
        handleSubmit({ ...values, [fieldId]: text });
      }
    }
  };

  const resetForm = () => {
    setValues({});
    const first = form.fields[0].id;
    setFocused(first);
    setTimeout(() => refs.current[first]?.focus(), 50);
  };


  const postScanToAPI = async record => {
    try {
      const response = await fetch('http://127.0.0.1:5000/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(record),
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.ok) {
        drizzleDb
          .update(scans)
          .set({ synced: 1 })
          .where(eq(scans.id, record.id))
          .run();
      }
    } catch (err) {
      console.error('Background scan sync failed:', err);
    }
  };

  const handleSubmit = async newVals => {
    const result = schema.safeParse(newVals);
    if (!result.success) {
      setMessage({
        text: result.error.issues.map(i => i.message).join('\n'),
        type: 'error'
      });
      resetForm();
      return;
    }

    const firstFieldId = form.fields[0].id;
    const firstValue = result.data[firstFieldId];

    const record = {
      id: generateId(),
      userId: '20348204830293480',
      formId: form.id,
      scannedAt: new Date(),
      data: JSON.stringify(result.data),
      key: firstValue,
    };

    try {

      const existingRecord = drizzleDb
        .select()
        .from(scans)
        .where(eq(scans.key, firstValue))
        .all();

      if (existingRecord.length > 0) {
        if (form.handleDuplicateKey === 'error') {

          setMessage({
            text: `Scan ${firstValue} already exists`,
            type: 'error'
          });
          resetForm();
          return;
        }
        if (form.handleDuplicateKey === 'update') {
          drizzleDb
            .update(scans)
            .set({
              scannedAt: record.scannedAt,
              data: record.data,
            })
            .where(eq(scans.key, firstValue))
            .run();

          setMessage({ text: `${firstValue} has been updated!`, type: 'success' });
          resetForm();
          return;
        }
      }
      else {
        drizzleDb.insert(scans).values(record).run();
        postScanToAPI(record);
      }
      setMessage({ text: `${firstValue} Saved!`, type: 'success' });
      resetForm();
    } catch (error) {
      console.error('Database insert error:', error);
      resetForm();
      setMessage({ text: 'Failed to save data', type: 'error' });
      return;
    }
  };

  if (!form) {
    return (
      <SafeAreaView style={styles.full}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <View style={styles.header}>
            <Text style={styles.title}>Form Not Found</Text>
            <Text style={styles.subtitle}>Please go back.</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Text style={styles.notFound}>Nothing to display</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.full}>
      <ScrollView contentContainerStyle={styles.container}>

        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{form.title}</Text>
            <Text style={styles.subtitle}>{form.subtitle}</Text>
          </View>
        </View>

        {form.fields.map(f => (
          <View key={f.id} style={styles.field}>
            <Text style={styles.label}>{f.label}</Text>
            <TextInput
              ref={r => (refs.current[f.id] = r)}
              placeholder={f.placeholder}
              placeholderTextColor="#999"
              value={values[f.id] || ''}
              onChangeText={txt => handleChange(f.id, txt)}
              onFocus={() => setFocused(f.id)}
              onBlur={() => setFocused(null)}
              style={[styles.input, focused === f.id && styles.focus]}
            />
          </View>
        ))}

        {message && (
          <View
            style={[
              styles.messageBox,
              message.type === 'error' ? styles.errorBox : styles.successBox
            ]}
          >
            <Text style={styles.messageText}>{message.text}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFound: {
    fontSize: 18,
    color: '#999',
  },
  container: {
    padding: 20,
  },

  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
  },
  focus: {
    borderColor: '#007AFF',
    backgroundColor: '#E8F4FF',
  },
  messageBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
  },
  successBox: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
  },
  messageText: {
    color: '#374151',
    fontSize: 14,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    // alignItems: 'center',
    marginBottom: 30,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 50,
  },
  backText: {
    fontSize: 50,            // bump this up as much as you like
    lineHeight: 50,          // match lineHeight to fontSize
    includeFontPadding: false,      // Android: remove default extra padding
    textAlignVertical: 'center',    // Android: center the glyph
    color: '#007AFF',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 2,
  },
});