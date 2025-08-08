import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const ExportContext = createContext(null);

export const useExports = () => {
  const ctx = useContext(ExportContext);
  if (!ctx) throw new Error('useExports must be used within an ExportProvider');
  return ctx;
};

export const ExportProvider = ({ children }) => {
  const { API_BASE, token, logout } = useAuth(); // <-- pull logout from auth

  const getAuthHeader = useMemo(
    () => () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  /** Helper to wrap fetch with 401 handling */
  const authFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...getAuthHeader(),
      },
    });

    if (res.status === 401) {
      logout(); // auto logout on unauthorized
      throw new Error('Unauthorized - logged out');
    }

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    return res;
  };

  const listExports = async () => {
    const res = await authFetch(`${API_BASE}/api/exports`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportId, formId, headers, rows }),
    });
    return res.json();
  };

  const resendExportEmail = async (exportId) => {
    const res = await authFetch(`${API_BASE}/api/exports/resend/${exportId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
