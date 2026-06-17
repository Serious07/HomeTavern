/**
 * Преобразует LaTeX-выражения в Unicode-символы.
 *
 * Поддерживаемые символы:
 * - $\rightarrow$ → →  (U+2192)
 * - $\leftarrow$ → ←  (U+2190)
 * - $\Rightarrow$ → ⇒  (U+21D2)
 * - $\Leftarrow$ → ⇐  (U+21D0)
 * - $\leftrightarrow$ → ↔  (U+2194)
 * - $\Leftrightarrow$ → ⇔  (U+21D4)
 * - $\uparrow$ → ↑  (U+2191)
 * - $\downarrow$ → ↓  (U+2193)
 * - $\forall$ → ∀  (U+2200)
 * - $\exists$ → ∃  (U+2203)
 * - $\in$ → ∈  (U+2208)
 * - $\notin$ → ∉  (U+2209)
 * - $\subset$ → ⊂  (U+2282)
 * - $\supset$ → ⊃  (U+2283)
 * - $\cup$ → ∪  (U+222A)
 * - $\cap$ → ∩  (U+2229)
 * - $\emptyset$ → ∅  (U+2205)
 * - $\infty$ → ∞  (U+221E)
 * - $\pm$ → ±  (U+00B1)
 * - $\times$ → ×  (U+00D7)
 * - $\div$ → ÷  (U+00F7)
 * - $\approx$ → ≈  (U+2248)
 * - $\neq$ → ≠  (U+2260)
 * - $\leq$ → ≤  (U+2264)
 * - $\geq$ → ≥  (U+2265)
 * - $\sum$ → Σ  (U+03A3)
 * - $\prod$ → Π  (U+03A0)
 * - $\int$ → ∫  (U+222B)
 * - $\partial$ → ∂  (U+2202)
 * - $\nabla$ → ∇  (U+2207)
 */

// Lazy-инициализация regex-паттернов для производительности
let compiledRegexes: Array<{ regex: RegExp; replacement: string }> | null = null;

function getCompiledRegexes(): Array<{ regex: RegExp; replacement: string }> {
  if (compiledRegexes) return compiledRegexes;

  const latexMap: Record<string, string> = {
    '\\rightarrow': '→',
    '\\leftarrow': '←',
    '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐',
    '\\leftrightarrow': '↔',
    '\\Leftrightarrow': '⇔',
    '\\uparrow': '↑',
    '\\downarrow': '↓',
    '\\forall': '∀',
    '\\exists': '∃',
    '\\in': '∈',
    '\\notin': '∉',
    '\\subset': '⊂',
    '\\supset': '⊃',
    '\\cup': '∪',
    '\\cap': '∩',
    '\\emptyset': '∅',
    '\\infty': '∞',
    '\\pm': '±',
    '\\times': '×',
    '\\div': '÷',
    '\\approx': '≈',
    '\\neq': '≠',
    '\\leq': '≤',
    '\\geq': '≥',
    '\\sum': 'Σ',
    '\\prod': 'Π',
    '\\int': '∫',
    '\\partial': '∂',
    '\\nabla': '∇',
  };

  // Сортируем от длинных ключей к коротким для корректной замены
  const sortedKeys = Object.keys(latexMap).sort((a, b) => b.length - a.length);

  compiledRegexes = sortedKeys.map((key) => {
    const escapedKey = key.replace(/\\/g, '\\\\');
    return {
      regex: new RegExp(`\\$${escapedKey}\\$`, 'g'),
      replacement: latexMap[key],
    };
  });

  return compiledRegexes;
}

export function processLatexSymbols(text: string): string {
  let result = text;
  for (const { regex, replacement } of getCompiledRegexes()) {
    result = result.replace(regex, replacement);
  }
  return result;
}