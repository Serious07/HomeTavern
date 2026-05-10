/**
 * Initialize llm_connections table and seed from .env
 */
import db from '../config/database';

export function initLlmConnectionsTable(): void {
  // Safely create the table IF IT DOESN'T EXIST
  // This will NEVER drop or modify existing data
  db.prepare(`
    CREATE TABLE IF NOT EXISTS llm_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      model TEXT NOT NULL,
      max_tokens INTEGER NOT NULL DEFAULT 64000,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      UNIQUE(user_id, name)
    )
  `).run();

  console.log('[LLM Connections] Table llm_connections checked/initialized');
}

/**
 * Seed initial connections from .env for a specific user
 * Returns the created connection IDs
 */
export function seedConnectionsFromEnv(userId: number): number[] {
  const createdIds: number[] = [];

  // Check if the llm_connections table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='llm_connections'"
  ).get() as { name: string } | undefined;

  if (!tableExists) {
    console.log('[LLM Connections] Table llm_connections does not exist yet, skipping seed');
    return [];
  }

  // Check if there are already any connections for this user
  const existingCount = db.prepare(
    'SELECT COUNT(*) as count FROM llm_connections WHERE user_id = ?'
  ).get(userId) as { count: number };

  if (existingCount.count > 0) {
    console.log('[LLM Connections] User already has connections, skipping seed');
    return [];
  }

  // Parse .env values - collect all uncommented connections
  const envContent = process.env.LLM_ENV_DATA || '';
  
  if (!envContent) {
    // If no structured data, create a single connection from main LLM vars
    const mainConn = {
      name: 'From .env (Main)',
      base_url: process.env.LLM_BASE_URL || '',
      api_key: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || '',
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '') || 64000,
    };

    if (mainConn.base_url && mainConn.api_key && mainConn.model) {
      // Insert directly using raw SQL to avoid any repository issues
      const stmt = db.prepare(
        'INSERT INTO llm_connections (user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
      );
      const encryptedKey = Buffer.from(mainConn.api_key).toString('base64');
      stmt.run(
        userId,
        mainConn.name,
        mainConn.base_url,
        encryptedKey,
        mainConn.model,
        mainConn.max_tokens
      );
      createdIds.push(1);
      console.log('[LLM Connections] Seeded main connection from .env');
    }

    // Also parse commented lines from .env for additional connections
    const commentedConns = parseCommentedEnvConnections();
    for (const conn of commentedConns) {
      // Check if already exists
      const existing = db.prepare(
        'SELECT id FROM llm_connections WHERE user_id = ? AND name = ?'
      ).get(userId, conn.name) as { id: number } | undefined;

      if (!existing) {
        const stmt = db.prepare(
          'INSERT INTO llm_connections (user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
        );
        const encryptedKey = Buffer.from(conn.api_key).toString('base64');
        stmt.run(
          userId,
          conn.name,
          conn.base_url,
          encryptedKey,
          conn.model,
          conn.max_tokens
        );
        createdIds.push(1);
        console.log('[LLM Connections] Seeded connection from .env:', conn.name);
      }
    }

    return createdIds;
  }

  return createdIds;
}

/**
 * Parse commented connections from .env file content
 */
function parseCommentedEnvConnections(): Array<{
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number;
}> {
  const connections: Array<{
    name: string;
    base_url: string;
    api_key: string;
    model: string;
    max_tokens: number;
  }> = [];

  // Read the actual .env file to get commented lines
  const fs = require('fs');
  const path = require('path');
  const envFilePath = path.join(__dirname, '..', '.env');

  let envFileContent: string;
  try {
    envFileContent = fs.readFileSync(envFilePath, 'utf-8');
  } catch {
    return [];
  }

  // Find section headers and their commented lines
  const lines = envFileContent.split('\n');
  let currentSection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for section header (e.g., "# LOCAL", "# GLOBAL", "#GOOGLE")
    const sectionMatch = trimmed.match(/^#([A-ZА-ЯЁa-zа-яЁ]+)(\s*.*)?$/);
    if (sectionMatch && trimmed.startsWith('#') && !trimmed.startsWith('#LLM_')) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Check for commented LLM configuration lines within a section
    if (trimmed.startsWith('#LLM_BASE_URL=')) {
      const baseUrl = trimmed.substring('#LLM_BASE_URL='.length);
      const apiKeyLine = lines.find(l => l.trim().startsWith('#LLM_API_KEY=') && lines.indexOf(l) > lines.indexOf(line));
      const modelLine = lines.find(l => l.trim().startsWith('#LLM_MODEL=') && lines.indexOf(l) > lines.indexOf(line));
      const maxTokensLine = lines.find(l => l.trim().startsWith('#LLM_MAX_TOKENS=') && lines.indexOf(l) > lines.indexOf(line));

      if (baseUrl && apiKeyLine && modelLine) {
        const apiKey = apiKeyLine.substring('#LLM_API_KEY='.length);
        const model = modelLine.substring('#LLM_MODEL='.length);
        const maxTokens = maxTokensLine 
          ? parseInt(maxTokensLine.substring('#LLM_MAX_TOKENS='.length)) || 64000
          : 64000;

        connections.push({
          name: currentSection || 'From .env',
          base_url: baseUrl,
          api_key: apiKey,
          model: model,
          max_tokens: maxTokens,
        });
      }
    }
  }

  return connections;
}