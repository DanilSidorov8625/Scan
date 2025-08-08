// contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


export const API_BASE = process.env.EXPO_PUBLIC_API_BASE?.trim();

// Storage keys
const TOKEN_KEY = 'jwt';
const USERNAME_KEY = 'username';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: hydrate from storage
  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USERNAME_KEY),
        ]);
        if (t) setToken(t);
        if (u) setUsername(u);
      } catch (e) {
        console.error('Auth hydrate failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAuth = !!token;

  // ---- Helpers ----
  const getAuthHeader = useMemo(
    () => () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const saveSession = async (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername || null);
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
    if (newUsername) await AsyncStorage.setItem(USERNAME_KEY, newUsername);
  };

  const clearSession = async () => {
    setToken(null);
    setUsername(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USERNAME_KEY]);
  };

  // ---- API calls ----
  const register = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!res.ok) {
        return { success: false, error: data?.error || text || 'Registration failed' };
      }
      // Optional: auto-login after register
      return await login(username, password);
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  };

  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!res.ok) {
        return { success: false, error: data?.error || text || 'Invalid credentials' };
      }

      const jwt = data?.access_token;
      if (!jwt) return { success: false, error: 'No token received' };

      await saveSession(jwt, username);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await clearSession();
      return { success: true };
    } catch (e) {
      console.error('Logout error:', e);
      return { success: false, error: 'Failed to logout' };
    }
  };

  const value = {
    isAuth,
    loading,
    username,
    token,
    API_BASE,
    getAuthHeader,   // handy for fetch calls
    register,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
