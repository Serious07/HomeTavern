import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { STORAGE_KEYS } from '../constants/storage';

interface User {
  id: number;
  username: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth from localStorage on mount
    console.log('[AuthContext] useEffect mounted - initializing auth');
    console.log('[AuthContext] Reading token from localStorage with key:', STORAGE_KEYS.TOKEN);
    console.log('[AuthContext] Reading user from localStorage with key:', STORAGE_KEYS.USER);
    
    const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    
    console.log('[AuthContext] Token from localStorage:', storedToken ? 'FOUND' : 'NOT FOUND');
    console.log('[AuthContext] User from localStorage:', storedUser ? 'FOUND' : 'NOT FOUND');

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setToken(storedToken);
        console.log('[AuthContext] Auth restored from localStorage - user:', parsedUser);
      } catch (e) {
        console.error('[AuthContext] Invalid JSON in localStorage, clearing');
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    } else {
      console.log('[AuthContext] No valid auth data in localStorage');
    }
    
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: User) => {
    console.log('[AuthContext] Login - saving token and user');
    console.log('[AuthContext] Token value:', newToken ? 'present' : 'empty');
    console.log('[AuthContext] Token actual value:', newToken);
    console.log('[AuthContext] User value:', newUser);
    console.log('[AuthContext] Saving to localStorage with keys:', STORAGE_KEYS.TOKEN, 'and', STORAGE_KEYS.USER);
    
    // Check localStorage availability
    try {
      if (typeof localStorage === 'undefined') {
        console.error('[AuthContext] localStorage is not available!');
        return;
      }
      
      console.log('[AuthContext] localStorage is available');
      console.log('[AuthContext] Before setItem - token:', localStorage.getItem(STORAGE_KEYS.TOKEN));
      
      localStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
      
      console.log('[AuthContext] After setItem - token:', localStorage.getItem(STORAGE_KEYS.TOKEN));
      console.log('[AuthContext] After setItem - user:', localStorage.getItem(STORAGE_KEYS.USER));
      
      // Verify save
      const verifyToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const verifyUser = localStorage.getItem(STORAGE_KEYS.USER);
      
      console.log('[AuthContext] Verification - token saved:', verifyToken ? 'OK' : 'FAILED');
      console.log('[AuthContext] Verification - user saved:', verifyUser ? 'OK' : 'FAILED');
      
      if (verifyToken !== newToken) {
        console.error('[AuthContext] ERROR: Token verification failed! Expected:', newToken, 'Got:', verifyToken);
      }
      
      setToken(newToken);
      setUser(newUser);
      console.log('[AuthContext] State updated - token:', newToken ? 'set' : 'null', 'user:', newUser);
    } catch (e) {
      console.error('[AuthContext] Error saving to localStorage:', e);
      throw e;
    }
  };

  const logout = () => {
    console.log('[AuthContext] Logout - clearing storage');
    console.log('[AuthContext] Removing keys:', STORAGE_KEYS.TOKEN, 'and', STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};