/**
 * Types for Smart History Compression feature
 */

export interface ChatBlock {
  id: number;
  chat_id: number;
  title: string;
  summary: string;
  summary_translation?: string | null;  // Перевод summary на другой язык
  title_translation?: string | null;    // Перевод заголовка
  original_message_ids: string;  // JSON string: "[1, 2, 3]"
  start_message_id: number | null;
  end_message_id: number | null;
  is_compressed: number;  // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Frontend-friendly version with parsed message IDs
export interface ChatBlockWithParsedIds extends Omit<ChatBlock, 'original_message_ids'> {
  original_message_ids: number[];
}

export interface CompressionStats {
  originalMessageCount: number;
  compressedBlockCount: number;
  tokenSavings: number;
  percentage: number;
}

export interface MessageSelection {
  startMessageId: number;
  endMessageId: number;
  messageCount: number;
}

export interface CompressionResult {
  success: boolean;
  blocks: ChatBlock[];
  originalCount: number;
  compressedCount: number;
  tokenSavings: number;
}

export interface CompressionSelectedResult {
  success: boolean;
  block: ChatBlock;
}

export interface NeedsCompressionResponse {
  needsCompression: boolean;
  percentage: number;
}

export interface UndoResponse {
  success: boolean;
}

export interface ResetResponse {
  success: boolean;
}

export interface EditBlockParams {
  title?: string;
  summary?: string;
  is_compressed?: boolean;
}

export interface EditBlockResponse {
  title: string;
  summary: string;
}

/**
 * Progress info for compression operation (SSE)
 */
export interface CompressionProgress {
  currentBlock: number;
  totalBlocks: number;
  status: string;
  title?: string;
}

/**
 * SSE event data for compression progress
 */
export interface CompressionProgressEvent {
  type: 'progress';
  currentBlock: number;
  totalBlocks: number;
  status: string;
  title?: string;
}

/**
 * SSE event data for compression completion
 */
export interface CompressionCompleteEvent {
  type: 'complete';
  success: boolean;
  blocks: ChatBlock[];
  originalCount: number;
  compressedCount: number;
  tokenSavings: number;
}

/**
 * SSE event data for compression error
 */
export interface CompressionErrorEvent {
  type: 'error';
  error: string;
}

/**
 * Union type for all compression SSE events
 */
export type CompressionSSEEvent = CompressionProgressEvent | CompressionCompleteEvent | CompressionErrorEvent;
