import { useState, useCallback } from 'react';
import { authApi } from '../services/api';
import { User } from '../types';
import { STORAGE_KEYS } from '../constants/storage';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  const login = useCallback(async (username: string, password: string) => {
    console.log('[useAuth] Login attempt for:', username);
    try {
      const response = await authApi.login(username, password);
      const { token, user } = response.data;
      
      console.log('[useAuth] Token received:', token ? 'OK' : 'EMPTY');
      console.log('[useAuth] User data:', user);
      
      // Save to localStorage
      console.log('[useAuth] Saving to localStorage with keys:', STORAGE_KEYS.TOKEN, 'and', STORAGE_KEYS.USER);
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      
      // Verify save
      const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
      console.log('[useAuth] Token saved to localStorage:', savedToken ? 'OK' : 'FAILED');
      console.log('[useAuth] User saved to localStorage:', savedUser ? 'OK' : 'FAILED');
      
      setAuthState({
        user,
        token,
        isAuthenticated: true,
      });
      
      console.log('[useAuth] Auth state updated');
      return { success: true as const, data: { token, user } };
    } catch (error: any) {
      console.log('[useAuth] Login error:', error.response?.data?.message || error);
      return { 
        success: false as const, 
        error: error.response?.data?.message || 'Ошибка при входе' 
      };
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    try {
      const response = await authApi.register(username, password);
      return { success: true as const, data: response.data };
    } catch (error: any) {
      return { 
        success: false as const, 
        error: error.response?.data?.message || 'Ошибка при регистрации' 
      };
    }
  }, []);

  const logout = useCallback(() => {
    console.log('[useAuth] Logout - clearing keys:', STORAGE_KEYS.TOKEN, 'and', STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  }, []);

  const initializeAuth = useCallback(() => {
    console.log('[useAuth] initializeAuth called');
    console.log('[useAuth] Reading from localStorage with keys:', STORAGE_KEYS.TOKEN, 'and', STORAGE_KEYS.USER);
    
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    
    console.log('[useAuth] Token from localStorage (key:', STORAGE_KEYS.TOKEN, '):', token ? 'FOUND' : 'NOT FOUND');
    console.log('[useAuth] User from localStorage (key:', STORAGE_KEYS.USER, '):', userStr ? 'FOUND' : 'NOT FOUND');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        console.log('[useAuth] User parsed:', user);
        setAuthState({
          user,
          token,
          isAuthenticated: true,
        });
        console.log('[useAuth] Auth state initialized from storage');
      } catch (e) {
        console.log('[useAuth] Invalid JSON in user storage, clearing');
        // Invalid JSON, clear storage
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    } else {
      console.log('[useAuth] No token or user found - not authenticated');
    }
  }, []);

  return {
    authState,
    login,
    register,
    logout,
    initializeAuth,
  };
};
