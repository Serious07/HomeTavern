export interface Character {
  id?: number;
  name: string;
  description: string;
  personality?: string;
  first_message: string;
  system_prompt?: string;
  avatar?: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  created_at?: string;
}

export interface Chat {
  id: number;
  character_id: number;
  user_id: number;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  chat_id: number;
  user_id: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  reasoning_content?: string;
  translated_content?: string | null;
  created_at: string;
}

export interface Hero {
  id?: number;
  user_id?: number;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface HeroVariation {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  avatar: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}
