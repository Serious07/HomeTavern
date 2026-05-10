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

  -- Character Greetings table - stores multiple greeting messages per character
  CREATE TABLE IF NOT EXISTS character_greetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  );

  -- Index for fast queries on character_greetings
  CREATE INDEX IF NOT EXISTS idx_character_greetings_character_id ON character_greetings(character_id);

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

// Миграция: Добавление колонки current_greeting_index в таблицу characters
try {
  const charsTableInfo = db.prepare("PRAGMA table_info(characters)").all() as any[];
  const charColumnNames = charsTableInfo.map((col: any) => col.name);
  
  if (!charColumnNames.includes('current_greeting_index')) {
    db.exec(`
      ALTER TABLE characters ADD COLUMN current_greeting_index INTEGER DEFAULT NULL;
    `);
    console.log('[Database] Added column: current_greeting_index');
  } else {
    console.log('[Database] Column current_greeting_index already exists');
  }
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate column')) {
    console.log('[Database] Column current_greeting_index already exists');
  } else {
    console.error('[Database] current_greeting_index migration error:', error);
  }
}

// Миграция: Создание таблицы character_greetings для существующих баз
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_greetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);
  
  // Создаём индекс если его нет
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_character_greetings_character_id ON character_greetings(character_id);
    `);
  } catch (indexError) {
    console.log('[Database] Index already exists or creation skipped');
  }
  
  console.log('[Database] character_greetings table migration completed successfully');
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate')) {
    console.log('[Database] character_greetings table already exists');
  } else {
    console.error('[Database] character_greetings migration error:', error);
  }
}

// Миграция: Перенос existing first_message как первого приветствия для существующих персонажей
try {
  // Проверяем, нужно ли выполнять миграцию (таблица greetings пуста и есть персонажи с first_message)
  const greetingsCount = db.prepare("SELECT COUNT(*) as count FROM character_greetings").get() as { count: number };
  const charactersWithFirstMessage = db.prepare(
    "SELECT id, first_message FROM characters WHERE first_message IS NOT NULL AND first_message != ''"
  ).all();
  
  if ((greetingsCount as any).count === 0 && charactersWithFirstMessage.length > 0) {
    const insertStmt = db.prepare(
      `INSERT INTO character_greetings (character_id, message, sort_order)
       VALUES (?, ?, 0)`
    );
    
    const insertMany = db.transaction((chars: Array<{id: number; first_message: string}>) => {
      for (const char of chars) {
        try {
          insertStmt.run(char.id, char.first_message);
        } catch (e) {
          // Skip characters that already have greetings
        }
      }
    });
    
    insertMany(charactersWithFirstMessage);
    console.log(`[Database] Migration: Created initial greetings for ${charactersWithFirstMessage.length} characters`);
  } else {
    console.log('[Database] Greeting migration skipped (either table not empty or no characters with first_message)');
  }
} catch (error) {
  const errorMessage = (error as Error).message;
  if (errorMessage.includes('duplicate')) {
    console.log('[Database] Greeting data migration already done');
  } else {
    console.error('[Database] Greeting data migration error:', error);
  }
}

export default db;
