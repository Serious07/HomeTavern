/**
 * Removes thinking/reasoning tags from text
 * Handles multiple tag formats:
 *   - <thought>...</thought> / <\/thought>
 *   - <think>...</think>
 *   - <think>...</think> / <\/think>
 * Handles multiline content and greedy matching for nested/unclosed tags
 */
export function stripThoughtTags(text: string): string {
  // Remove <think>...</think> (using escaped brackets in regex)
  const thinkOpenRegex = new RegExp('<think>[\\s\\S]*?</think>', 'gi');
  text = text.replace(thinkOpenRegex, '');
  
  // Remove <thought>...</thought>
  const thoughtRegex = /<thought>[\s\S]*?<\/thought>/gi;
  text = text.replace(thoughtRegex, '');
  
  // Remove <think>...</think> (using escaped brackets in regex)
  const thinkCloseRegex = new RegExp('<think>[\\s\\S]*?<\\/think>', 'gi');
  text = text.replace(thinkCloseRegex, '');
  
  return text.trim();
}
