export interface CharacterGreeting {
  id: number;
  character_id: number;
  message: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id?: number;
  name: string;
  description: string;
  short_description?: string;
  personality?: string;
  first_message: string;
  avatar?: string;
  current_greeting_index?: number | null;
  greetings?: CharacterGreeting[];
  greeting_count?: number;
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
  // Поля для статистики генерации (только для assistant сообщений)
  generated_at?: string | null;
  tokens_per_sec?: number | null;
  total_tokens?: number | null;
  reasoning_tokens?: number | null;  // Количество reasoning токенов
  generation_duration?: number | null;  // Время генерации в секундах (с сервера)
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
  display_name: string | null;
  description: string | null;
  avatar: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SystemPrompt {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// LLM Connection types
export interface LlmConnection {
  id: number;
  user_id: number;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  model: string;
  max_tokens: number;
  /** Enable reasoning/thinking mode (1=enabled, 0=disabled) */
  reasoning: number;
  /** Enable strict role alternation (1=enabled, 0=disabled) - merges consecutive same-role messages */
  strict_role_alternation: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  api_key_masked?: string | null;
  has_api_key?: boolean;
  api_key_decrypted?: string;
}

export interface LlmConnectionCreate {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number;
  reasoning?: number;
  strict_role_alternation?: number;
}

export interface LlmConnectionUpdate {
  name?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
  max_tokens?: number;
  reasoning?: number;
  strict_role_alternation?: number;
}

export interface LlmTestResult {
  success: boolean;
  message: string;
  response_time_ms: number;
  model_response?: string;
  server_status?: number;
  server_error?: string;
  error?: string;
}
