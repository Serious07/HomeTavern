import Database from 'better-sqlite3';

const db: any = new Database('hometavern.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Characters table
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    personality TEXT,
    first_message TEXT,
    system_prompt TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Chats table
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  );

  -- Messages table
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    translated_content TEXT,
    reasoning_content TEXT,
    message_id TEXT,
    hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  -- Hero Variations table - stores different versions of the user's hero profile
  CREATE TABLE IF NOT EXISTS hero_variations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    avatar TEXT,
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, key)
  );

  -- System Prompts table - stores user's custom system prompts
  CREATE TABLE IF NOT EXISTS system_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    prompt_text TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Index for fast queries on user_id and is_active
  CREATE INDEX IF NOT EXISTS idx_system_prompts_user_active ON system_prompts(user_id, is_active);

  -- Chat Blocks table - stores compressed history blocks (chapters)
  CREATE TABLE IF NOT EXISTS chat_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    title TEXT NOT NULL,              -- Заголовок блока (главы)
    summary TEXT NOT NULL,            -- Краткий пересказ блока
    original_message_ids TEXT NOT NULL, -- JSON массив ID оригинальных сообщений
    start_message_id INTEGER,         -- ID первого сообщения в блоке
    end_message_id INTEGER,           -- ID последнего сообщения в блоке
    is_compressed INTEGER DEFAULT 1,  -- Флаг: использовать сжатие (1) или оригинал (0)
    sort_order INTEGER NOT NULL,      -- Порядок блоков в истории
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  -- Индекс для быстрого поиска по chat_id
  CREATE INDEX IF NOT EXISTS idx_chat_blocks_chat_id ON chat_blocks(chat_id);
`);

// Миграция: Добавление колонок для статистики сообщений
// Проверяем существование колонок перед добавлением
try {
  const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
  const columnNames = tableInfo.map((col: any) => col.name);
  
  if (!columnNames.includes('generated_at')) {
    db.exec("ALTER TABLE messages ADD COLUMN generated_at TEXT;");
    console.log('[Database] Added column: generated_at');
  }
  if (!columnNames.includes('tokens_per_sec')) {
    db.exec("ALTER TABLE messages ADD COLUMN tokens_per_sec REAL;");
    console.log('[Database] Added column: tokens_per_sec');
  }
  if (!columnNames.includes('total_tokens')) {
    db.exec("ALTER TABLE messages ADD COLUMN total_tokens INTEGER;");
    console.log('[Database] Added column: total_tokens');
  }
  if (!columnNames.includes('reasoning_tokens')) {
    db.exec("ALTER TABLE messages ADD COLUMN reasoning_tokens INTEGER;");
    console.log('[Database] Added column: reasoning_tokens');
  }
  
  // Добавление колонок для контекста в таблице chats
  const chatsTableInfo = db.prepare("PRAGMA table_info(chats)").all() as any[];
  const chatsColumnNames = chatsTableInfo.map((col: any) => col.name);
  
  if (!chatsColumnNames.includes('context_tokens_used')) {
    db.exec("ALTER TABLE chats ADD COLUMN context_tokens_used INTEGER;");
    console.log('[Database] Added column: context_tokens_used');
  }
  if (!chatsColumnNames.includes('context_last_synced')) {
    db.exec("ALTER TABLE chats ADD COLUMN context_last_synced TEXT;");
    console.log('[Database] Added column: context_last_synced');
  }
  
  console.log('[Database] Migrations completed successfully');
} catch (error) {
  console.error('[Database] Migration error:', error);
}

// Миграция: Добавление колонок для перевода краткого пересказа
try {
  db.exec(`
    ALTER TABLE chat_blocks ADD COLUMN summary_translation_hash TEXT;
  `);
  
  console.log('[Database] Translation hash migration completed successfully');
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate column')) {
    console.log('[Database] Translation hash column already exists');
  } else {
    console.error('[Database] Translation hash migration error:', error);
  }
}

// Миграция: Добавление колонок для перевода summary и title
try {
  db.exec(`
    ALTER TABLE chat_blocks ADD COLUMN summary_translation TEXT;
    ALTER TABLE chat_blocks ADD COLUMN title_translation TEXT;
  `);
  
  console.log('[Database] Translation columns migration completed successfully');
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate column')) {
    console.log('[Database] Translation columns already exist');
  } else {
    console.error('[Database] Translation columns migration error:', error);
  }
}

// Миграция: Добавление колонки short_description в таблицу characters
try {
  db.exec(`
    ALTER TABLE characters ADD COLUMN short_description TEXT;
  `);
  
  console.log('[Database] Added column: short_description');
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate column')) {
    console.log('[Database] Column short_description already exists');
  } else {
    console.error('[Database] short_description migration error:', error);
  }
}

export default db;
