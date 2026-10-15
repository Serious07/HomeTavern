#!/usr/bin/env node
/**
 * Диагностический харнес против дословных повторов.
 *
 * Берёт ТОЧНОЕ тело запроса из лога HomeTavern (server/logs/<date>_chat<id>.log,
 * который пишет llm.service.writeRequestLog) и прогоняет его по очереди с разными
 * комбинациями параметров, отвечая на один вопрос: начался ли новый ответ как
 * байтовая копия последнего assistant-хода в промпте.
 *
 * Это воспроизведение бага, а не тест: он нужен, чтобы отличить жадный декодинг
 * (нет temperature) от вырожденного режима thinking (enable_thinking:false) и
 * проверить, что починка работает на уже «отравленной» истории.
 *
 * Запуск:
 *   node scripts/repetition-repro.mjs \
 *     --log logs/2026-10-15T06-38-47_chat734.log \
 *     --base-url http://localhost:8080/v1 \
 *     --model qwen3.8-flash-next-iq3_s \
 *     --max-tokens 400
 *
 * Без --log берётся самый свежий *_chat*.log из server/logs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, '..', 'logs');

// Те же пороги, что и в LLMService.looksLikeRepetitionOf: иначе харнес врал бы
// о том, что видит сервер
const CHECK_WINDOW = 400;
const MIN_CHARS = 200;
const MIN_PREV_CHARS = 80;

function parseArgs(argv) {
  const args = {
    maxTokens: 2000,
    timeoutMs: 240000,
    // Сколько символов ответа дожидаемся: 400+ нужно для проверки повтора
    contentLimit: 700,
    // Столько символов размышлений ждём максимум, чтобы не гонять бесконечный thinking
    reasoningLimit: 4000,
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case '--log': args.log = value; i++; break;
      case '--base-url': args.baseUrl = value; i++; break;
      case '--model': args.model = value; i++; break;
      case '--api-key': args.apiKey = value; i++; break;
      case '--max-tokens': args.maxTokens = parseInt(value, 10); i++; break;
      case '--content-limit': args.contentLimit = parseInt(value, 10); i++; break;
      case '--reasoning-limit': args.reasoningLimit = parseInt(value, 10); i++; break;
      case '--only': args.only = value; i++; break;
      default:
        console.error(`Неизвестный аргумент: ${key}`);
        process.exit(1);
    }
  }
  return args;
}

function findLatestLog(explicit) {
  if (explicit) {
    const resolved = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Лог не найден: ${resolved}`);
    }
    return resolved;
  }
  const candidates = fs.readdirSync(logsDir)
    .filter((name) => /_chat\d+(_retry\d+)?\.log$/.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(logsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`В ${logsDir} нет логов запросов вида *_chat<id>.log`);
  }
  return path.join(logsDir, candidates[0].name);
}

/**
 * Логи пишутся как «# Body ...:\n{...}\n» - тело JSON лежит между первой строкой
 * «{» и строкой «}» на нулевом отступе (JSON.stringify с отступом 2).
 */
function extractRequestBody(logPath) {
  const text = fs.readFileSync(logPath, 'utf-8');
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === '{');
  if (start === -1) throw new Error(`В логе ${logPath} не найдено тело запроса`);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '}') { end = i; break; }
  }
  if (end === -1) throw new Error(`В логе ${logPath} тело запроса не закрыто`);
  return JSON.parse(lines.slice(start, end + 1).join('\n'));
}

function normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function lastAssistantContent(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i].content || '';
  }
  return '';
}

function isCopyOf(answer, previous) {
  const prev = normalize(previous);
  const got = normalize(answer);
  if (prev.length < MIN_PREV_CHARS || got.length < MIN_CHARS) return false;
  const window = Math.min(prev.length, CHECK_WINDOW, got.length);
  if (window < MIN_CHARS) return false;
  return got.startsWith(prev.slice(0, window));
}

const VARIANTS = [
  {
    name: 'как в логе (без сэмплирования)',
    apply: (body) => body,
  },
  {
    name: 'thinking off (enable_thinking:false)',
    apply: (body) => {
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
      return body;
    },
  },
  {
    name: 'только сэмплирование (t=0.8, top_p=0.95)',
    apply: (body) => {
      body.temperature = 0.8;
      body.top_p = 0.95;
      return body;
    },
  },
  {
    name: 'reasoning_effort=medium без сэмплирования',
    apply: (body) => {
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), reasoning_effort: 'medium' };
      body.reasoning_effort = 'medium';
      return body;
    },
  },
  {
    name: 'reasoning_effort=low + сэмплирование (как ретрай)',
    apply: (body) => {
      body.temperature = 1.0;
      body.top_p = 0.98;
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), reasoning_effort: 'low' };
      body.reasoning_effort = 'low';
      return body;
    },
  },
  {
    name: 'reasoning_effort=xhigh + сэмплирование',
    apply: (body) => {
      body.temperature = 0.8;
      body.top_p = 0.95;
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), reasoning_effort: 'xhigh' };
      body.reasoning_effort = 'xhigh';
      return body;
    },
  },
];

/**
 * Стримим, а не ждём полный ответ: у thinking-моделей окно max_tokens целиком
 * уходит на размышления, и при stream:false content приходит пустым - копия
 * предыдущего хода в таком прогоне просто не появилась бы.
 * Читаем поток до CONTENT_LIMIT символов ответа (этого хватает, чтобы поймать
 * повтор) и обрываем, чтобы не ждать лишнего.
 */
async function runVariant(baseUrl, apiKey, body, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!response.ok) {
      const text = await response.text();
      return { error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
    }
    if (!response.body) return { error: 'пустое тело ответа' };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoning = '';
    let finish = '?';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '[DONE]' || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        let chunk;
        try {
          chunk = JSON.parse(trimmed.slice(6));
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta || {};
        content += delta.content || '';
        reasoning += delta.reasoning_content || delta.reasoning || '';
        if (choice?.finish_reason) finish = choice.finish_reason;
      }

      if (content.length >= opts.contentLimit || finish !== '?') break;
      if (reasoning.length >= opts.reasoningLimit) {
        // Размышления слишком длинные - дальше ждать смысла нет
        finish = finish === '?' ? 'harness_reasoning_limit' : finish;
        break;
      }
    }

    try {
      await reader.cancel();
    } catch {
      // поток уже закрыт
    }

    return { content, reasoning, finish };
  } catch (error) {
    return { error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const logPath = findLatestLog(args.log);
  const baseBody = extractRequestBody(logPath);

  const baseUrl = args.baseUrl || process.env.LLM_BASE_URL || 'http://localhost:8080/v1';
  const apiKey = args.apiKey || process.env.LLM_API_KEY || '';
  const model = args.model || baseBody.model;

  const previous = lastAssistantContent(baseBody.messages || []);
  const variants = args.only
    ? VARIANTS.filter((v) => v.name.toLowerCase().includes(args.only.toLowerCase()))
    : VARIANTS;

  console.log(`Лог:        ${logPath}`);
  console.log(`Эндпоинт:   ${baseUrl}`);
  console.log(`Модель:     ${model}`);
  console.log(`Сообщений:  ${(baseBody.messages || []).length}`);
  console.log(`Предыдущий assistant-ход: ${previous.length} симв.`);
  console.log('');

  if (!previous) {
    console.error('В промпте нет assistant-сообщений - сравнивать не с чем.');
    process.exit(1);
  }

  let copies = 0;
  for (const variant of variants) {
    const body = structuredClone(baseBody);
    body.model = model;
    body.max_tokens = args.maxTokens;
    delete body.stream_options;
    variant.apply(body);

    const started = Date.now();
    const result = await runVariant(baseUrl, apiKey, body, args);
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    if (result.error) {
      console.log(`- ${variant.name}: ОШИБКА ${result.error} (${secs}s)`);
      continue;
    }

    const copy = isCopyOf(result.content, previous);
    if (copy) copies++;
    console.log(
      `- ${variant.name}: COPY=${copy ? 'True' : 'False'} ` +
      `len=${normalize(result.content).length} reasoning=${(result.reasoning || '').length} ` +
      `finish=${result.finish} (${secs}s)`
    );
    console.log(`    начало ответа: ${normalize(result.content).slice(0, 120)}`);
  }

  console.log('');
  console.log(`Итог: копий ${copies} из ${variants.length}`);
  process.exit(copies === 0 ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
