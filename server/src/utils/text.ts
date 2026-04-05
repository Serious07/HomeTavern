/**
 * Removes <thought> tags and their content from text
 * Handles multiline content and various tag formats
 */
export function stripThoughtTags(text: string): string {
  return text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
}
