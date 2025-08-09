import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

const ExportContext = createContext(null);

export const useExports = () => {
  const ctx = useContext(ExportContext);
  if (!ctx) throw new Error('useExports must be used within an ExportProvider');
  return ctx;
};

export const ExportProvider = ({ children }) => {
  const { API_BASE, token, logout } = useAuth();
  const router = useRouter();

  const getAuthHeader = useMemo(
    () => () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  /** Helper to wrap fetch with 401/402 handling without double-reading the body */
    /** Helper to wrap fetch with 401/402/404 handling (single alert) */
  const authFetch = async (url, options = {}) => {
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...getAuthHeader(),
        },
      });
    } catch (e) {
      Alert.alert('Network Error', e?.message || 'Could not reach server');
      const err = new Error(e?.message || 'Network error');
      err.alreadyAlerted = true;
      throw err;
    }

    // 401 → logout and stop
    if (res.status === 401) {
      logout();
      const err = new Error('Unauthorized - logged out');
      err.alreadyAlerted = true;
      throw err;
    }

    // 402 → out of tokens (alert once, then throw)
    if (res.status === 402) {
      let msg = 'Payment required / no tokens left.';
      try {
        const data = await res.clone().json().catch(() => ({}));
        if (data?.error || data?.message) msg = data.error || data.message;
      } catch {}
      Alert.alert('Out of tokens', msg);
      const err = new Error(msg);
      err.status = 402;
      err.alreadyAlerted = true;
      throw err;
    }

    // 404 → not found (alert once, then throw)
    if (res.status === 404) {
      let msg = 'Resource not found.';
      try {
        const data = await res.clone().json().catch(() => ({}));
        if (data?.error || data?.message) msg = data.error || data.message;
      } catch {}
      Alert.alert('Error', msg);
      const err = new Error(msg);
      err.status = 404;
      err.alreadyAlerted = true;
      throw err;
    }

    // Other non-OKs → single generic alert
    if (!res.ok) {
      let msg = `Request failed: ${res.status}`;
      try {
        const data = await res.clone().json().catch(() => null);
        if (data && (data.error || data.message)) msg = data.error || data.message;
      } catch {}
      Alert.alert('Error', msg);
      const err = new Error(msg);
      err.status = res.status;
      err.alreadyAlerted = true;
      throw err;
    }

    return res;
  };

  const listExports = async () => {
    const res = await authFetch(`${API_BASE}/api/exports`, {
      method: 'GET',
    });
    return res.json();
  };

  const downloadExport = async (exportId, filename) => {
    const res = await authFetch(`${API_BASE}/api/exports/file/${exportId}/${filename}`, {
      method: 'GET',
    });
    return res.blob();
  };

  const sendExport = async ({ exportId, formId, headers, rows }) => {
    const res = await authFetch(`${API_BASE}/api/export`, {
      method: 'POST',
      body: JSON.stringify({ exportId, formId, headers, rows }),
    });
    return res.json();
  };

  const resendExportEmail = async (exportId) => {
    const res = await authFetch(`${API_BASE}/api/exports/resend/${exportId}`, {
      method: 'POST',
    });
    return res.json();
  };

  return (
    <ExportContext.Provider
      value={{
        listExports,
        downloadExport,
        sendExport,
        resendExportEmail,
      }}
    >
      {children}
    </ExportContext.Provider>
  );
};