import axios from 'axios';
import { Character, Chat, Message, Hero } from '../types';
import { STORAGE_KEYS } from '../constants/storage';

// Context API types
export interface ContextStats {
  tokensUsed: number;
  contextLimit: number;
  percentage: number;
  lastSynced: string | null;
  cached: boolean;
  slotId: number | null;
}

// Create axios instance with default config
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  console.log('[API Interceptor] Request:', config.method?.toUpperCase(), config.url);
  console.log('[API Interceptor] Token from localStorage (key:', STORAGE_KEYS.TOKEN, '):', token ? 'FOUND' : 'NOT FOUND');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('[API Interceptor] Authorization header set:', config.headers.Authorization.substring(0, 20) + '...');
  } else {
    console.log('[API Interceptor] No token - skipping Authorization header');
  }
  
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => {
    console.log('[API Response Interceptor] Success:', response.config.method?.toUpperCase(), response.config.url, 'Status:', response.status);
    return response;
  },
  (error) => {
    console.log('[API Response Interceptor] Error:', error.config?.method?.toUpperCase(), error.config?.url, 'Status:', error.response?.status);
    
    if (error.response?.status === 401) {
      console.log('[API Response Interceptor] 401 detected - clearing token and redirecting');
      // Token expired or invalid
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: any }>('/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post('/auth/register', { username, password }),
  logout: () => api.post('/auth/logout'),
};

// Characters API
export const charactersApi = {
  getAll: () => api.get<Character[]>('/characters'),
  getById: (id: number) => api.get<Character>(`/characters/${id}`),
  create: (data: Omit<Character, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Character>('/characters', data),
  update: (id: number, data: Partial<Character>) =>
    api.put<Character>(`/characters/${id}`, data),
  delete: (id: number) => api.delete(`/characters/${id}`),
};

// Chats API
export const chatsApi = {
  getAll: () => api.get<Chat[]>('/chats'),
  getById: (id: number) => api.get<Chat>(`/chats/${id}`),
  create: (data: { character_id: number; title?: string }) =>
    api.post<Chat>('/chats', data),
  update: (id: number, data: Partial<Chat>) =>
    api.put<Chat>(`/chats/${id}`, data),
  delete: (id: number) => api.delete(`/chats/${id}`),
  getMessages: (chatId: number) => api.get<Message[]>(`/chats/${chatId}/messages`),
  sendMessage: (chatId: number, data: { content: string; role: string }) =>
    api.post<Message>(`/chats/${chatId}/messages`, data),
  deleteMessage: (chatId: number, messageId: number) =>
    api.delete(`/chats/${chatId}/messages/${messageId}`),
  updateMessage: (chatId: number, messageId: number, data: Partial<Message>) =>
    api.put<Message>(`/chats/${chatId}/messages/${messageId}`, data),
  translateMessage: (chatId: number, messageId: number) =>
    api.post<Message>(`/chats/${chatId}/messages/${messageId}/translate`),
  translateMessageBidirectional: (chatId: number, messageId: number, data: { content?: string; translated_content?: string }) =>
    api.put<Message>(`/chats/${chatId}/messages/${messageId}/translate-bidirectional`, data),
};

// Hero API
export const heroApi = {
  get: () => api.get<Hero>('/hero'),
  update: (data: Partial<Hero>) => api.put<Hero>('/hero', data),
};

// Context API (token usage tracking)
export const contextApi = {
  getStats: (chatId: number, force = false) =>
    api.get<ContextStats>(`/context/stats/${chatId}`, {
      params: { force },
    }),
  sync: (chatId: number) =>
    api.post<ContextStats>(`/context/sync/${chatId}`),
  getSlots: () => api.get<{ slots: any[] }>('/context/slots'),
  getProps: () => api.get<{ n_ctx: number }>('/context/props'),
};

// Compression API
export const compressionApi = {
  getBlocks: (chatId: number) => api.get<any[]>(`/compression/blocks/${chatId}`),
  compress: (chatId: number) => api.post<any>(`/compression/compress/${chatId}`),
  compressSelected: (chatId: number, data: { startMessageId: number; endMessageId: number }) =>
    api.post<any>(`/compression/compress-selected/${chatId}`, data),
  updateBlock: (blockId: number, data: { title?: string; summary?: string; is_compressed?: boolean }) =>
    api.put<any>(`/compression/block/${blockId}`, data),
  deleteBlock: (blockId: number) => api.delete(`/compression/block/${blockId}`),
  undoCompression: (chatId: number) => api.post<any>(`/compression/undo/${chatId}`),
  resetCompression: (chatId: number) => api.delete(`/compression/reset/${chatId}`),
  checkNeedsCompression: (chatId: number) => api.get<any>(`/compression/needs/${chatId}`),
  translateBlock: (blockId: number) => api.put<any>(`/compression/block/${blockId}/translate`),
};

export default api;
