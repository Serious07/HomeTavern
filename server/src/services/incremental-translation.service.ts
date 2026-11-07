/**
 * Инкрементальный перевод при редактировании сообщения.
 *
 * Переводятся только изменённые/добавленные строки; переиспользованные
 * строки берутся из существующего перевода. Удалённые строки просто
 * выбрасываются вместе со своим переводом.
 *
 * Совместимость со старыми данными: если связка абзацев (translation_segments)
 * отсутствует или не воспроизводит текущие тексты, сначала пробуем вывести
 * её по совпадению структуры строк, иначе - полный перевод текста целиком
 * (как было раньше), после чего связка попытается построиться автоматически.
 */

import { Message } from '../repositories/message.repository';
import { translateForUser, translateForUserStream, getTranslationService } from './translation.service';
import {
  EditedField,
  SegmentPair,
  IncrementalPlan,
  parseSegments,
  pairsMatchMessage,
  tryBuildPairsFromTexts,
  serializeSegments,
  planIncrementalEdit,
  isStructuralLine,
} from '../utils/text-segments';

// Если переиспользуется меньше половины непустых строк, инкрементальный путь
// дороже и хуже по контексту, чем один запрос на весь текст
const MIN_REUSE_RATIO = 0.4;

export interface TranslationStreamChunk {
  token?: string;
  reasoningToken?: string;
  // Прогресс по изменённым абзацам: сколько всего и какой сейчас переводится
  segmentTotal?: number;
  segmentCurrent?: number;
}

export interface IncrementalOutcome {
  mode: 'incremental' | 'full';
  content: string;
  translated_content: string;
  translation_segments: string | null;
}

export function getAlignedPairs(message: Message): SegmentPair[] | null {
  const stored = parseSegments(message.translation_segments);
  if (stored && pairsMatchMessage(stored, message.content, message.translated_content)) {
    return stored;
  }
  if (message.translated_content) {
    return tryBuildPairsFromTexts(message.content, message.translated_content);
  }
  return null;
}

function planFor(userId: number, message: Message, editedField: EditedField, newText: string): IncrementalPlan | null {
  // Настройка «Переводить абзацами» выключена - переводим текст целиком (quality over economy)
  const { settings } = getTranslationService(userId);
  if (!settings.paragraphTranslation) return null;

  const pairs = getAlignedPairs(message);
  if (!pairs) return null;
  return planIncrementalEdit(pairs, editedField, newText, MIN_REUSE_RATIO);
}

function assembleOtherSide(pairs: SegmentPair[], editedField: EditedField): string {
  return pairs.map((p) => (editedField === 'content' ? p.b : p.a)).join('\n');
}

function buildOutcome(
  editedField: EditedField,
  newText: string,
  otherText: string,
  pairs: SegmentPair[] | null,
  mode: 'incremental' | 'full',
): IncrementalOutcome {
  const segments = pairs ? serializeSegments(pairs) : null;
  return editedField === 'content'
    ? { mode, content: newText, translated_content: otherText, translation_segments: segments }
    : { mode, content: otherText, translated_content: newText, translation_segments: segments };
}

/**
 * Не-стриминговый путь (google/libre/yandex и fallback-вызовы):
 * пересобирает другую сторону, переводя только изменённые строки.
 */
export async function translateEditIncremental(
  userId: number,
  message: Message,
  editedField: EditedField,
  newText: string,
  sourceLang: string,
  targetLang: string,
): Promise<IncrementalOutcome> {
  const plan = planFor(userId, message, editedField, newText);

  if (!plan) {
    const fullText = await translateForUser(userId, newText, sourceLang, targetLang);
    const pairs =
      editedField === 'content'
        ? tryBuildPairsFromTexts(newText, fullText)
        : tryBuildPairsFromTexts(fullText, newText);
    return buildOutcome(editedField, newText, fullText, pairs, 'full');
  }

  const pairs = plan.pairs;
  const editedSide = (p: SegmentPair) => (editedField === 'content' ? p.a : p.b);
  await Promise.all(
    plan.translateIdx.map(async (idx) => {
      const line = editedSide(pairs[idx]);
      if (isStructuralLine(line)) return;
      const translated = await translateForUser(userId, line, sourceLang, targetLang);
      if (editedField === 'content') {
        pairs[idx].b = translated;
      } else {
        pairs[idx].a = translated;
      }
    }),
  );

  return buildOutcome(editedField, newText, assembleOtherSide(pairs, editedField), pairs, 'incremental');
}

/**
 * Стриминговый путь (LLM-провайдер): переиспользованные строки выдаются
 * мгновенно, изменённые - токенами в порядке текста.
 */
export async function* translateEditIncrementalStream(
  userId: number,
  message: Message,
  editedField: EditedField,
  newText: string,
  sourceLang: string,
  targetLang: string,
): AsyncGenerator<TranslationStreamChunk, IncrementalOutcome, undefined> {
  const plan = planFor(userId, message, editedField, newText);
  const otherFromPairs = (p: SegmentPair) => (editedField === 'content' ? p.b : p.a);

  if (!plan) {
    let fullText = '';
    let reportedFullText: string | undefined;
    for await (const chunk of translateForUserStream(userId, newText, sourceLang, targetLang)) {
      const c = chunk as any;
      if (c.isReasoning) {
        yield { reasoningToken: c.token };
      } else if (c.token) {
        fullText += c.token;
        yield { token: c.token };
      }
      if (c.done && typeof c.fullText === 'string') {
        reportedFullText = c.fullText;
      }
    }
    if (reportedFullText !== undefined && reportedFullText !== '') {
      fullText = reportedFullText;
    }
    const pairs =
      editedField === 'content'
        ? tryBuildPairsFromTexts(newText, fullText)
        : tryBuildPairsFromTexts(fullText, newText);
    const outcome = buildOutcome(editedField, newText, fullText, pairs, 'full');
    return outcome;
  }

  const pairs = plan.pairs;
  const translateSet = new Set(plan.translateIdx);
  const editedSide = (p: SegmentPair) => (editedField === 'content' ? p.a : p.b);
  let assembled = '';
  let changedDone = 0;

  yield { segmentTotal: plan.translateIdx.length };

  for (let idx = 0; idx < pairs.length; idx++) {
    if (idx > 0) {
      assembled += '\n';
      yield { token: '\n' };
    }
    if (!translateSet.has(idx)) {
      const reused = otherFromPairs(pairs[idx]);
      assembled += reused;
      yield { token: reused };
      continue;
    }
    changedDone++;
    yield { segmentCurrent: changedDone };
    let lineText = '';
    let reportedLineText: string | undefined;
    for await (const chunk of translateForUserStream(userId, editedSide(pairs[idx]), sourceLang, targetLang)) {
      const c = chunk as any;
      if (c.isReasoning) {
        yield { reasoningToken: c.token };
      } else if (c.token) {
        lineText += c.token;
        yield { token: c.token };
      }
      if (c.done && typeof c.fullText === 'string') {
        reportedLineText = c.fullText;
      }
    }
    if (reportedLineText !== undefined && reportedLineText !== '') {
      lineText = reportedLineText;
    }
    if (editedField === 'content') {
      pairs[idx].b = lineText;
    } else {
      pairs[idx].a = lineText;
    }
    assembled += lineText;
  }

  const outcome = buildOutcome(editedField, newText, assembled, pairs, 'incremental');
  return outcome;
}
