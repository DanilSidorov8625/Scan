import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('adminToken');
      setIsAuth(!!token);
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      if (username === 'admin' && password === 'password') {
        const token = 'admin-token-' + Date.now();
        await AsyncStorage.setItem('adminToken', token);
        await AsyncStorage.setItem('adminUsername', username);
        setIsAuth(true);
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('adminToken');
      await AsyncStorage.removeItem('adminUsername');
      setIsAuth(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    isAuth,
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};