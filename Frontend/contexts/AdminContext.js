import React, { createContext, useContext, useState } from 'react';

const AdminContext = createContext();

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};

export const AdminProvider = ({ children }) => {
  const [emails, setEmails] = useState([
    { id: 1, email: 'admin@company.com', status: 'active', added: '2024-01-15T10:30:00Z' },
    { id: 2, email: 'support@company.com', status: 'inactive', added: '2024-01-10T14:20:00Z' },
    { id: 3, email: 'alerts@company.com', status: 'active', added: '2024-01-08T09:15:00Z' },
  ]);
  const [activeEmail, setActiveEmailState] = useState('admin@company.com');

  const isOnline = () => {
    return navigator.onLine !== undefined ? navigator.onLine : true;
  };

  const addEmail = async (email, authHeader) => {
    try {
      console.log('Adding email:', email, 'with auth:', authHeader);
      
      if (emails.some(e => e.email === email)) {
        return { success: false, error: 'Email already exists' };
      }
      
      const newEmail = {
        id: Date.now(),
        email,
        status: 'active',
        added: new Date().toISOString(),
      };
      setEmails(prev => [...prev, newEmail]);
      return { success: true, email: newEmail };
    } catch (error) {
      console.error('Add email error:', error);
      return { success: false, error: 'Failed to add email' };
    }
  };

  const setActiveEmail = async (email, authHeader) => {
    try {
      console.log('Setting active email:', email, 'with auth:', authHeader);
      
      const emailExists = emails.some(e => e.email === email);
      if (!emailExists) {
        return { success: false, error: 'Email not found' };
      }
      
      setActiveEmailState(email);
      return { success: true, activeEmail: email };
    } catch (error) {
      console.error('Set active email error:', error);
      return { success: false, error: 'Failed to set active email' };
    }
  };

  const getEmails = async (authHeader) => {
    try {
      console.log('Getting emails with auth:', authHeader);
      return { success: true, emails, activeEmail };
    } catch (error) {
      console.error('Get emails error:', error);
      return { success: false, error: 'Failed to get emails' };
    }
  };

  const removeEmail = async (email, authHeader) => {
    try {
      console.log('Removing email:', email, 'with auth:', authHeader);
      
      if (email === activeEmail) {
        return { success: false, error: 'Cannot remove active email' };
      }
      
      setEmails(prev => prev.filter(e => e.email !== email));
      return { success: true };
    } catch (error) {
      console.error('Remove email error:', error);
      return { success: false, error: 'Failed to remove email' };
    }
  };

  const value = {
    emails,
    activeEmail,
    isOnline,
    addEmail,
    setActiveEmail,
    getEmails,
    removeEmail,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};