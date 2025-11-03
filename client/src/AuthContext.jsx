import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch('/api/auth/me', { token });
        setUser(data.user);
        setOrg(data.org);
      } catch (err) {
        console.error('Failed to load profile', err);
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [token]);

  const signin = async ({ email, password }) => {
    setError(null);
    const data = await apiFetch('/api/auth/signin', {
      method: 'POST',
      body: { email, password }
    });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    setOrg(data.org);
    return data;
  };

  const signup = async ({ orgName, email, password }) => {
    setError(null);
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: { orgName, email, password }
    });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    setOrg(data.org);
    return data;
  };

  const signout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setOrg(null);
  };

  const value = {
    token,
    user,
    org,
    loading,
    error,
    setError,
    signin,
    signup,
    signout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
