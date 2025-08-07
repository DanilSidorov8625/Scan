// app/screens/ExportList.js
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import formsConfig from '../../../config/forms.json';
import { scans } from '../../../db/schema';

export default function ExportList() {
  const db = useSQLiteContext();
  const drizzleDb = useMemo(() => drizzle(db), [db]);

  const [selectedFormId, setSelectedFormId] = useState(formsConfig.forms[0]?.id || '');
  const [rows, setRows] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFormId) return;

      const results = drizzleDb
        .select()
        .from(scans)
        .where(eq(scans.formId, selectedFormId))
        .all();

      setRows(results);
    }, [selectedFormId])
  );


  const form = formsConfig.forms.find(f => f.id === selectedFormId);

  if (!db) {
    return (
      <SafeAreaView style={[styles.full, styles.center]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.full}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Export Scans</Text>
          <Text style={styles.subtitle}>
            {rows.length} record{rows.length === 1 ? '' : 's'} found
          </Text>
        </View>

        {/* Form selector */}
        <TouchableOpacity style={styles.selectorButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.selectorText}>{form?.title || 'Select form'}</Text>
        </TouchableOpacity>

        {/* Export button */}
        {rows.length > 0 && (
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => console.log('Exporting rows:', rows)}
          >
            <Text style={styles.exportButtonText}>Export CSV</Text>
          </TouchableOpacity>
        )}

        {/* List out each scan */}
        {form && rows.map(row => (
          <ScanItem key={row.id} row={row} form={form} />
        ))}

        {/* Modal for picking form */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Form</Text>
              <Picker selectedValue={selectedFormId} onValueChange={v => setSelectedFormId(v)}>
                {formsConfig.forms.map(f => (
                  <Picker.Item key={f.id} label={f.title} value={f.id} />
                ))}
              </Picker>
              <TouchableOpacity style={styles.doneButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

// Dynamically renders one scan row:
function ScanItem({ row, form }) {
  const data = JSON.parse(row.data);
  
  const getSyncBorderColor = () => {
    return row.synced === 0 ? '#ef4444' : '#22c55e'; // red for unsynced, green for synced
  };
  
  const showSyncStatus = () => {
    const status = row.synced === 0 ? 'Not Synced' : 'Synced';
    const message = row.synced === 0 
      ? 'This scan has not been synchronized to the server yet.' 
      : 'This scan has been successfully synchronized to the server.';
    Alert.alert(status, message);
  };
  
  return (
    <TouchableOpacity style={[styles.scanItem, { borderColor: getSyncBorderColor(), borderWidth: 2 }]} onPress={showSyncStatus}>
      {form.fields.map(field => (
        <View key={field.id} style={styles.scanFieldRow}>
          <Text style={[styles.scanFieldLabel, { color: '#3b82f6' }]}>{field.label}:</Text>
          <Text style={styles.scanFieldValue}>{data[field.id]}</Text>
        </View>
      ))}
      <Text style={styles.scanTimestamp}>
        at {new Date(row.scannedAt).toLocaleTimeString()}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#fff' },
  center: { justifyContent: 'center', alignItems: 'center' },
  container: { padding: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 4 },
  selectorButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  selectorText: { fontSize: 16, color: '#333' },
  exportButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  exportButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ScanItem styles
  scanItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  scanFieldRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scanFieldLabel: { color: '#555', fontWeight: '500' },
  scanFieldValue: { color: '#000' },
  scanTimestamp: { fontSize: 12, color: '#999', marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  doneButton: { marginTop: 12, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});