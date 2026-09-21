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
  
  // Remove <|channel>...</channel|> (Kimi K2-style inline reasoning channel)
  // Unclosed closing tag is tolerated: everything after an unclosed opening tag is dropped
  // ($ без флага m совпадает только с концом строки; \z в JS-regex — просто буква z)
  const channelRegex = /<\|channel\>[\s\S]*?(?:<channel\|>|$)/gi;
  text = text.replace(channelRegex, '');

  return text.trim();
}
