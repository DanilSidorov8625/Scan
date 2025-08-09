// contexts/AdminContext.js
import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { alertOnce } from '../utils/alertOnce';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';

const AdminContext = createContext(null);
export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within an AdminProvider');
  return ctx;
};

export const AdminProvider = ({ children }) => {
  const { API_BASE, token, logout } = useAuth();
  const [emails, setEmails] = useState([]);
  const [activeEmail, setActiveEmail] = useState(null);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // --- NEW: token stats state ---
  const [tokensUsed, setTokensUsed] = useState(0);
  const [tokensLeft, setTokensLeft] = useState(0);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const authHeaders = useCallback(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const isOnline = async () => {
    try {
      const state = await NetInfo.fetch();
      return !!(state.isConnected && (state.isInternetReachable !== false));
    } catch {
      return true;
    }
  };

  // ---- THE WRAPPER ----
  const apiFetch = useCallback(
    async (path, opts = {}) => {
      const online = await isOnline();
      if (!online) {
        alertOnce('offline', 'Offline', 'No internet connection.');
        throw new Error('offline');
      }

      const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
          ...authHeaders(),
        },
      });

      if (res.status === 401) {
        alertOnce('401', 'Session expired', 'Please log in again.', () => logout());
        throw new Error('unauthorized');
      }
      if (res.status === 403) {
        alertOnce('403', 'Cannot reach server', 'The server rejected the request (403). Check API URL / network / VPN.', () => logout());
        throw new Error('forbidden');
      }

      const ct = res.headers.get('content-type') || '';
      let data = null;
      if (res.status !== 204) {
        data = ct.includes('application/json')
          ? await res.json().catch(() => ({}))
          : await res.text();
      }

      if (!res.ok) {
        const msg = (data && data.error) || `HTTP ${res.status}`;
        alertOnce(`http_${res.status}`, 'Error', msg);
        throw new Error(msg);
      }

      return data;
    },
    [API_BASE, authHeaders, logout]
  );

  // ------- USE IT -------
  const fetchEmails = useCallback(async () => {
    if (!token) return { success: false, error: 'Not authenticated' };
    setLoadingEmails(true);
    try {
      const data = await apiFetch('/api/emails', { method: 'GET' });
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
  }, [token, apiFetch]);

  const addEmail = useCallback(async (email) => {
    if (!token) return { success: false, error: 'Not authenticated' };
    try {
      const data = await apiFetch('/api/emails', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      await fetchEmails();
      return { success: true, id: data.id };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [token, apiFetch, fetchEmails]);

  const setActiveEmailApi = useCallback(async (emailOrId) => {
    if (!token) return { success: false, error: 'Not authenticated' };
    let id = emailOrId;
    if (typeof emailOrId === 'string') {
      const match = emails.find(e => e.email === emailOrId);
      if (!match) return { success: false, error: 'Email not found' };
      id = match.id;
    }
    try {
      await apiFetch(`/api/emails/${id}`, { method: 'PUT' });
      await fetchEmails();
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [token, emails, apiFetch, fetchEmails]);

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
      await apiFetch(`/api/emails/${id}`, { method: 'DELETE' });
      await fetchEmails();
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [token, emails, apiFetch, fetchEmails]);

  const requestPasswordReset = useCallback(async (identifier) => {
    try {
      const body = identifier.includes('@') ? { email: identifier } : { username: identifier };
      const data = await apiFetch('/api/reset-password/request', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { success: true, message: data?.message || 'If the account exists, an email was sent.' };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }, [apiFetch]);

  // --- NEW: token endpoints ---
  const fetchTokenStats = useCallback(async () => {
    if (!token) return { success: false, error: 'Not authenticated' };
    setLoadingTokens(true);
    try {
      const data = await apiFetch('/api/getUserTokens', { method: 'GET' });
      // expecting { tokensLeft, tokensUsed }
      setTokensLeft(Number(data?.tokensLeft ?? 0));
      setTokensUsed(Number(data?.tokensUsed ?? 0));
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    } finally {
      setLoadingTokens(false);
    }
  }, [token, apiFetch]);

  const requestMoreTokens = useCallback(
    async (opts = {}) => {
      // opts can include { tokens, email, min, max }
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const data = await apiFetch('/api/getMoreTokens', {
          method: 'POST',
          body: JSON.stringify(opts),
        });

        // // Expecting { url, emailed, adjustable, unitAmountCents }
        // const url = data?.url;
        // if (!url) {
        //   return { success: false, error: 'No checkout URL returned' };
        // }

        // // Try to open the Stripe Checkout URL
        // const canOpen = await Linking.canOpenURL(url);
        // if (canOpen) {
        //   await Linking.openURL(url);
        //   return { success: true, url };
        // }

        // // Fallback: copy to clipboard so user can paste into a browser
        // await Clipboard.setStringAsync(url);
        // return {
        //   success: true,
        //   url,
        //   message: 'Could not open browser. Link copied to clipboard.',
        // };
        return { success: true, message: "The Stripe Checkout link has been emailed to your active email. Please check your inbox & Refresh the app upon successful payment." }
      } catch (e) {
        return { success: false, error: e?.message || 'Network error' };
      }
    },
    [token, apiFetch]
  );

  useEffect(() => {
    if (token) {
      fetchEmails();
      fetchTokenStats(); // load token stats on login
    } else {
      setEmails([]);
      setActiveEmail(null);
      setTokensLeft(0);
      setTokensUsed(0);
    }
  }, [token, fetchEmails, fetchTokenStats]);

  const value = useMemo(() => ({
    emails,
    activeEmail,
    loadingEmails,
    fetchEmails,
    addEmail,
    setActiveEmail: setActiveEmailApi,
    removeEmail,
    requestPasswordReset,
    isOnline,

    // NEW: tokens
    tokensUsed,
    tokensLeft,
    loadingTokens,
    fetchTokenStats,
    requestMoreTokens,
  }), [
    emails, activeEmail, loadingEmails, fetchEmails, addEmail, setActiveEmailApi, removeEmail, requestPasswordReset,
    tokensUsed, tokensLeft, loadingTokens, fetchTokenStats, requestMoreTokens
  ]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};