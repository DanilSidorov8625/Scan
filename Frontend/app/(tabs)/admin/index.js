import React, { useEffect, useState, useCallback } from 'react';
import { Text, View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, SafeAreaView, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdmin } from '../../../contexts/AdminContext';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

export default function AdminIndex() {
  const { isAuth, loading, logout } = useAuth();

  // pull in fetchEmails + loadingEmails so we can refetch on focus
  const {
    emails,
    activeEmail,
    isOnline,
    setActiveEmail,
    removeEmail,
    requestPasswordReset,
    fetchEmails,
    loadingEmails,

    // NEW: tokens
    tokensUsed,
    tokensLeft,
    loadingTokens,
    fetchTokenStats,
    requestMoreTokens,
  } = useAdmin();

  const [online, setOnline] = useState(null);

  useEffect(() => {
    if (!loading && !isAuth) router.replace('/(tabs)/admin/login');
  }, [isAuth, loading]);

  useEffect(() => {
    fetchEmails();
    refreshOnline();
    fetchTokenStats(); // NEW: load tokens here too
  }, [fetchEmails, fetchTokenStats]);

  const onRefresh = useCallback(async () => {
    await Promise.all([fetchEmails(), refreshOnline(), fetchTokenStats()]);
  }, [fetchEmails, fetchTokenStats]);

  const refreshOnline = useCallback(async () => {
    try {
      const ok = await isOnline();
      setOnline(!!ok);
    } catch {
      setOnline(false);
    }
  }, [isOnline]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  if (!isAuth) return null;

  const handleLogout = () => {
    Alert.alert('Logout','Are you sure you want to logout?',
      [{ text:'Cancel', style:'cancel' }, { text:'Logout', style:'destructive', onPress: logout }]
    );
  };

  const handleSetActiveEmail = async (email) => {
    const result = await setActiveEmail(email);
    Alert.alert(result.success ? 'Success' : 'Error', result.success ? `${email} is now active` : result.error);
  };

  const handleRemoveEmail = (email) => {
    Alert.alert('Remove Email', `Remove ${email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await removeEmail(email);
          Alert.alert(result.success ? 'Success' : 'Error', result.success ? 'Email removed' : result.error);
        },
      },
    ]);
  };

  const handleRequestPasswordReset = () => {
    Alert.prompt('Request Password Reset','Enter username', async (input) => {
      if (!input) return;
      const result = await requestPasswordReset(input.trim());
      Alert.alert(result.success ? 'Reset Requested' : 'Error', result.success ? (result.message || 'If the account exists, an email was sent.') : result.error);
    });
  };

  // --- NEW: progress bar component (inline) ---
  const totalTokens = Math.max(0, Number(tokensUsed) + Number(tokensLeft));
  const pct = totalTokens ? Math.min(1, Math.max(0, Number(tokensUsed) / totalTokens)) : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={!!loadingEmails || !!loadingTokens} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>Manage system settings and data</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Text style={styles.statusText}>
            Online: {online === null ? 'Checking…' : online ? 'Yes' : 'No'}
          </Text>
          <Text style={styles.statusText}>Active Email: {activeEmail || '—'}</Text>
        </View>

        {/* NEW: Tokens block */}
        <View style={styles.tokenCard}>
          <View style={styles.tokenHeader}>
            <Text style={styles.sectionTitle}>Tokens</Text>
            {loadingTokens ? <ActivityIndicator size="small" /> : null}
          </View>

          <View style={styles.progressOuter}>
            <View style={[styles.progressInner, { width: `${pct * 100}%` }]} />
          </View>

          <View style={styles.tokenRow}>
            <Text style={styles.tokenLabel}>Used: <Text style={styles.tokenVal}>{tokensUsed}</Text></Text>
            <Text style={styles.tokenLabel}>Left: <Text style={styles.tokenVal}>{tokensLeft}</Text></Text>
            <Text style={styles.tokenLabel}>Total: <Text style={styles.tokenVal}>{totalTokens}</Text></Text>
          </View>

          <TouchableOpacity
            style={styles.moreBtn}
            onPress={async () => {
              const res = await requestMoreTokens();
              if (res.success) {
                Alert.alert('Request Sent', res.message);
              } else {
                Alert.alert('Error', res.error);
              }
            }}
          >
            <Text style={styles.moreBtnText}>Get more tokens</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Email Management</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/admin/add-email')}>
              <Text style={styles.addButtonText}>+ Add Email</Text>
            </TouchableOpacity>
          </View>

          {emails.map((emailObj) => (
            <View key={emailObj.id} style={styles.emailItem}>
              <View style={styles.emailInfo}>
                <Text style={styles.emailAddress}>{emailObj.email}</Text>
                {emailObj.email === activeEmail && <Text style={styles.activeLabel}>ACTIVE</Text>}
              </View>

              <View style={styles.emailActions}>
                {emailObj.email !== activeEmail && (
                  <>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleSetActiveEmail(emailObj.email)}>
                      <Text style={styles.actionButtonText}>Set Active</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.removeButton]} onPress={() => handleRemoveEmail(emailObj.email)}>
                      <Text style={styles.actionButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleRequestPasswordReset}>
          <Text style={styles.buttonText}>Request Password Reset</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
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
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emailItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  emailInfo: {
    marginBottom: 8,
  },
  emailAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  emailStatus: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007AFF',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  emailActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    marginTop: 'auto',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ---- NEW styles for tokens / progress bar ----
  tokenCard: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  tokenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressOuter: {
    height: 14,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressInner: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#007AFF',
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  tokenLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  tokenVal: {
    color: '#0f172a',
    fontWeight: '700',
  },
  moreBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  moreBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});