// src/screens/Index.js
import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.replace('/forms');
      } else {
        router.replace('/login');
      }
    }
  }, [loading, isAuthenticated, router]);

  return null;
}