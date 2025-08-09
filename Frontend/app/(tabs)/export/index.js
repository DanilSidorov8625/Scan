import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ScrollView
} from 'react-native';
import { scans } from '../../../db/schema';
import { useExports } from '../../../contexts/ExportContext'; // from earlier
import { playSound } from '../../../utils/playSound';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';


export default function Index() {
  const db = useSQLiteContext();
  const drizzleDb = useMemo(() => drizzle(db), [db]);
  const { resendExportEmail, downloadExport } = useExports();

  const [exportList, setExportList] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalRows, setModalRows] = useState([]);
  const [modalExportId, setModalExportId] = useState('');

  const fetchExports = useCallback(() => {
    // Select distinct exportIds
    const rows = drizzleDb
      .select({ exportId: scans.exportId })
      .from(scans)
      .all()
      .filter(r => r.exportId); // filter non-exported rows

    const unique = [...new Set(rows.map(r => r.exportId))];
    setExportList(unique);
  }, [drizzleDb]);

  useFocusEffect(
    useCallback(() => {
      fetchExports();
    }, [fetchExports])
  );

  const openExportModal = (exportId) => {
    const rows = drizzleDb
      .select()
      .from(scans)
      .where(eq(scans.exportId, exportId))
      .all();
    setModalRows(rows);
    setModalExportId(exportId);
    setModalVisible(true);
  };

  const handleResend = async (exportId) => {
    try {
      await resendExportEmail(exportId);
      Alert.alert('Resent', `Export ${exportId} email re-sent successfully`);
      playSound(false);
    } catch (err) {
      Alert.alert('Error', err.message);
      playSound(true);
    }
  };

  const handleDownload = async (exportId) => {
    try {
      const blob = await downloadExport(exportId, `${exportId}_full.csv`);

      // Convert blob to base64
      const base64 = await blobToBase64(blob);

      // Pick a local path in the app's document directory
      const fileUri = `${FileSystem.documentDirectory}${exportId}_full.csv`;

      // Write file
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      // Share the file using expo-sharing
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Downloaded', `File saved to: ${fileUri}\n(Sharing not available on this device)`);
      }
      console.log('File saved at:', fileUri);
    } catch (err) {
      Alert.alert('Error', err.message);
      playSound(true);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  if (!db) {
    return (
      <SafeAreaView style={[styles.full, styles.center]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.full}>
      <FlatList
        contentContainerStyle={[
          styles.container,
          exportList.length === 0 && styles.emptyContainer
        ]}
        data={exportList}
        keyExtractor={(id) => id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Export Scans</Text>
            <Text style={styles.subtitle}>
              {exportList.length} export{exportList.length === 1 ? '' : 's'} found
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No exports found</Text>
            <Text style={styles.emptySubtext}>
              Once you export scans, they will appear here for download or resend.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => openExportModal(item)}>
              <Text style={styles.cardTitle}>Export {item}</Text>
            
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleResend(item)}>
                <Text style={styles.actionText}>Resend</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleDownload(item)}>
                <Text style={styles.actionText}>Download</Text>
              </TouchableOpacity>
            </View>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Modal to show items in export */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.full}>
          <ScrollView contentContainerStyle={styles.modalContainer}>
            <Text style={styles.modalTitle}>Export {modalExportId}</Text>
            {modalRows.map((row) => {
              let data;
              try {
                data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
              } catch {
                data = {};
              }
              return (
                <View key={row.id} style={styles.modalItem}>
                  {Object.entries(data).map(([k, v]) => (
                    <Text key={k} style={styles.modalField}>{k}: {String(v)}</Text>
                  ))}
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#fff' },
  center: { justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 4 },
  header: { marginBottom: 24 },


  // Empty state
  emptyContainer: { flexGrow: 1,  },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyText: { fontSize: 20, fontWeight: '600', color: '#475569' },
  emptySubtext: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 4 },

  // Card styles
  card: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#0f172a' },
  actions: { flexDirection: 'row', gap: 10 },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6
  },
  actionText: { color: '#fff', fontWeight: '500' },

  // Modal styles
  modalContainer: { padding: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#1e293b' },
  modalItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    marginBottom: 8
  },
  modalField: { fontSize: 14, marginBottom: 4, color: '#334155' },
  closeButton: {
    marginTop: 20,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  closeText: { color: '#fff', fontWeight: '600' }
});
