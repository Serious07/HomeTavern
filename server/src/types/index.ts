// User types
export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

// Character types
export interface Character {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  short_description: string | null;
  personality: string | null;
  first_message: string | null;
  system_prompt: string | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterInput {
  user_id: number;
  name: string;
  description?: string;
  short_description?: string;
  personality?: string;
  first_message?: string;
  system_prompt?: string;
  avatar?: string;
}

export interface UpdateCharacterInput {
  name?: string;
  description?: string;
  short_description?: string;
  personality?: string;
  first_message?: string;
  system_prompt?: string;
  avatar?: string;
}

// SillyTavern import types
export interface SillyTavernCharacter {
  name: string;
  description?: string;
  short_description?: string;
  personality?: string;
  first_mes?: string;  // SillyTavern uses "first_mes" not "first_message"
  mes_example?: string;
  scenario?: string;
  system_prompt?: string;
  creator_notes?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];  // Array of alternative greetings
  avatar?: string;
  tags?: string[];
  character_version?: string;
  creator?: string;
  spec?: string;  // e.g., "chara_card_v3"
  spec_version?: string;
  data?: {  // Nested data object for chara_card_v3 format
    name?: string;
    description?: string;
    short_description?: string;
    personality?: string;
    first_mes?: string;
    mes_example?: string;
    scenario?: string;
    system_prompt?: string;
    creator_notes?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    tags?: string[];
    creator?: string;
    character_version?: string;
    avatar?: string;
    extensions?: Record<string, unknown>;
  };
}

// Chat types
export interface Chat {
  id: number;
  title: string;
  user_id: number | null;
  created_at: string;
  updated_at: string;
  character_id: number;
  context_tokens_used?: number | null;
  context_last_synced?: string | null;
}

export interface CreateChatInput {
  title: string;
  user_id?: number;
}

// Message types
export interface Message {
  id: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  chat_id: number;
  created_at: string;
}

export interface CreateMessageInput {
  content: string;
  role: 'user' | 'assistant' | 'system';
  chat_id: number;
}

// Auth types
export interface AuthPayload {
  userId: number;
  username: string;
  role: UserRole;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'password_hash'>;
}

// Hero Variation types
export interface HeroVariation {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  avatar: string | null;
  is_active: number;  // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface CreateHeroVariationInput {
  user_id: number;
  name: string;
  description?: string;
  avatar?: string;
  is_active?: boolean;
}

export interface UpdateHeroVariationInput {
  name?: string;
  description?: string;
  avatar?: string;
  is_active?: boolean;
}

// Settings types
export interface Setting {
  id: number;
  user_id: number;
  key: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSettingInput {
  user_id: number;
  key: string;
  value: string | null;
}

export interface UpdateSettingInput {
  value: string | null;
}
