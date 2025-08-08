// contexts/AdminContext.js (JS, not TS)
import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext'; // must be mounted ABOVE AdminProvider

const AdminContext = createContext(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within an AdminProvider');
  return ctx;
};

export const AdminProvider = ({ children }) => {
  const { API_BASE, token } = useAuth(); // ← use the raw token
  const [emails, setEmails] = useState([]);       // [{id,email,is_active}]
  const [activeEmail, setActiveEmail] = useState(null);
  const [loadingEmails, setLoadingEmails] = useState(false);

  const authHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const isOnline = async () => {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
  };

  const fetchEmails = useCallback(async () => {
    if (!token) return { success: false, error: 'Not authenticated' };
    setLoadingEmails(true);
    try {
      const res = await fetch(`${API_BASE}/api/emails`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.error || 'Failed to fetch emails' };
      }
      const list = Array.isArray(data) ? data : [];
      setEmails(list);
      const active = list.find(e => e.is_active);
      setActiveEmail(active ? active.email : null);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    } finally {
      setLoadingEmails(false);
    }
  }, [API_BASE, token, authHeaders]); // ← depends on token, not getAuthHeader-from-context

  const addEmail = useCallback(async (email) => {
    if (!token) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch(`${API_BASE}/api/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.error || 'Failed to add email' };
      }
      await fetchEmails();
      return { success: true, id: data.id };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [API_BASE, token, authHeaders, fetchEmails]);

  const setActiveEmailApi = useCallback(async (emailOrId) => {
    if (!token) return { success: false, error: 'Not authenticated' };
    let id = emailOrId;
    if (typeof emailOrId === 'string') {
      const match = emails.find(e => e.email === emailOrId);
      if (!match) return { success: false, error: 'Email not found' };
      id = match.id;
    }
    try {
      const res = await fetch(`${API_BASE}/api/emails/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.error || 'Failed to set active email' };
      }
      await fetchEmails();
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [API_BASE, token, authHeaders, emails, fetchEmails]);

  const removeEmail = useCallback(async (emailOrId) => {
    if (!token) return { success: false, error: 'Not authenticated' };
    let id = emailOrId;
    if (typeof emailOrId === 'string') {
      const match = emails.find(e => e.email === emailOrId);
      if (!match) return { success: false, error: 'Email not found' };
      if (match.is_active) return { success: false, error: 'Cannot remove active email' };
      id = match.id;
    } else {
      const match = emails.find(e => e.id === id);
      if (match?.is_active) return { success: false, error: 'Cannot remove active email' };
    }
    try {
      const res = await fetch(`${API_BASE}/api/emails/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data?.error || 'Failed to remove email' };
      }
      await fetchEmails();
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [API_BASE, token, authHeaders, emails, fetchEmails]);

  const requestPasswordReset = useCallback(async (identifier) => {
    // identifier can be username OR email
    try {
      const body = {};
      if (identifier.includes('@')) body.email = identifier;
      else body.username = identifier;

      const res = await fetch(`${API_BASE}/api/reset-password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      // API deliberately returns 200 even if user/email doesn't exist
      if (!res.ok) {
        return { success: false, error: data?.error || 'Failed to request reset' };
      }
      return { success: true, message: data?.message || 'If the account exists, an email was sent.' };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [API_BASE]);

  // Load emails when you log in / token changes
  useEffect(() => {
    if (token) fetchEmails();
    else {
      // clear state on logout
      setEmails([]);
      setActiveEmail(null);
    }
  }, [token, fetchEmails]);

  const value = useMemo(() => ({
    emails,
    activeEmail,
    loadingEmails,
    fetchEmails,
    addEmail,
    setActiveEmail: setActiveEmailApi,
    removeEmail,
    requestPasswordReset,
    isOnline, // stub; wire NetInfo if you want
  }), [emails, activeEmail, loadingEmails, fetchEmails, addEmail, setActiveEmailApi, removeEmail, requestPasswordReset]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};
