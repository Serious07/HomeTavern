/**
 * LLM Client Library
 * 
 * Простая библиотека для подключения к LLM через OpenAI API совместимый интерфейс.
 * Поддерживает потоковую передачу ответов с разделением на reasoning_content (мышление)
 * и content (основной ответ).
 */

export { LLMClient, generateId } from './client';
export * from './types';