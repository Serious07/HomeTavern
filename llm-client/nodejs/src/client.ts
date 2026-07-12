import {
    ClientOptions,
    ChatCompletionCreateParams,
    ChatCompletionChunk,
    ChatCompletion,
    APIError,
    NetworkError,
    TimeoutError,
    Message,
    MessageWithId,
    ChatConfig,
} from './types';
import { request as undiciRequest, Agent } from 'undici';
import { URL } from 'url';

/**
 * Глобальный HTTP агент для reuse соединений.
 */
const httpAgent = new Agent({
    keepAliveTimeout: 300000,    // 5 минут keep-alive для idle соединений
    keepAliveMaxTimeout: 600000, // 10 минут макс для idle соединений
});

/**
 * HTTP клиент для работы с OpenAI API совместимыми серверами
 */
export class LLMClient {
    private readonly baseURL: string;
    private readonly apiKey?: string;
    private readonly timeout: number;

    constructor(options: ClientOptions) {
        this.baseURL = options.baseURL.replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.timeout = options.timeout ?? 3600000; // 60 минут (было 15)
    }

    /**
     * Отправка запроса к API через undici.request
     * 
     * Критически важно: используем undici.request напрямую вместо fetch,
     * чтобы иметь полный контроль над headersTimeout.
     * 
     * Причина: llama.cpp выполняет prefill всего контекста (94608+ токенов)
     * ПЕРЕД отправкой HTTP заголовков. При 12.6 tok/s это занимает ~12 минут
     * на prefill, что远超 стандартный headersTimeout (30 сек).
     */
    private async request(
        endpoint: string,
        method: string,
        body?: unknown,
        options: { signal?: AbortSignal } = {}
    ): Promise<Response> {
        // Ensure no double slashes and proper URL construction
        const base = this.baseURL.replace(/\/+$/, '');
        const ep = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        const urlString = base + ep;
        
        // Log the full URL for debugging
        console.log(`[LLMClient] Request: ${method} ${urlString}`);
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            // Используем undici.request напрямую для полного контроля таймаутов
            const urlObj = new URL(urlString);
            const response = await undiciRequest(urlString, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: options.signal ?? controller.signal,
                dispatcher: httpAgent,
                // Критически важные таймауты:
                headersTimeout: 1800000,   // 30 минут на получение заголовков (prefill!)
                bodyTimeout: 3600000,      // 60 минут на чтение тела ответа
                // Информируем сервер что поддерживаем gzip (llama.cpp не стримит, но на всякий случай)
                highWaterMark: 64 * 1024,  // Увеличенный буфер для больших ответов
            });

            clearTimeout(timeoutId);

            // Преобразуем undici response в стандартный Response
            // undici body — это Node.js Readable stream, оборачиваем в Web ReadableStream
            const headersInit: [string, string][] = [];
            for (const [k, v] of Object.entries(response.headers)) {
                if (v !== undefined) {
                    headersInit.push([k, Array.isArray(v) ? v.join(', ') : v]);
                }
            }
            const standardResponse = new Response(
                response.body as unknown as ReadableStream<Uint8Array>,
                {
                    status: response.statusCode,
                    statusText: (response as any).statusMessage ?? '',
                    headers: headersInit,
                }
            );

            if (!standardResponse.ok) {
                const text = await standardResponse.text();
                throw new APIError(standardResponse.status, standardResponse.headers, text);
            }

            return standardResponse;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new TimeoutError(`Request timeout after ${this.timeout}ms`);
                }
                if (error instanceof APIError) {
                    throw error;
                }
                // Логирование деталей ошибки для диагностики разрывов соединения
                console.error(`[LLMClient] Network error details:`, {
                    name: error.name,
                    message: error.message,
                    code: (error as any).code,
                    cause: (error as any).cause,
                });
            }
            
            throw new NetworkError('Network error', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Создание чат-комплитиона
     */
    async chatCompletionsCreate(
        params: ChatCompletionCreateParams,
        options: { signal?: AbortSignal } = {}
    ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
        const endpoint = '/chat/completions';
        
        if (params.stream) {
            return this.createStreamResponse(endpoint, params, options);
        }
        
        const response = await this.request(endpoint, 'POST', params, options);
        return response.json() as Promise<ChatCompletion>;
    }

    /**
     * Создание потокового ответа
     */
    private async createStreamResponse(
        endpoint: string,
        params: ChatCompletionCreateParams,
        options: { signal?: AbortSignal }
    ): Promise<AsyncIterable<ChatCompletionChunk>> {
        const response = await this.request(endpoint, 'POST', params, options);
        
        if (!response.body) {
            throw new Error('Response body is null');
        }

        return this.processStream(response.body);
    }

    /**
 * Обработка SSE потока
 */
    private async *processStream(
        body: ReadableStream<Uint8Array>
    ): AsyncIterable<ChatCompletionChunk> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    
                    if (trimmed === '[DONE]') {
                        return;
                    }

                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6);
                        
                        if (jsonStr.trim()) {
                            try {
                                const chunk = JSON.parse(jsonStr) as ChatCompletionChunk;
                                // Проверяем наличие usage в чанке (приходит в последнем чанке)
                                if (chunk.usage) {
                                    console.log('[LLMClient] Usage from stream:', chunk.usage);
                                }
                                yield chunk;
                            } catch (error) {
                                // Игнорируем ошибки парсинга (например, [DONE])
                                continue;
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Создание списка сообщений с учётом системного промпта и истории
     * Системный промпт всегда добавляется в начало списка
     */
    private buildMessages(config: ChatConfig): Message[] {
        const messages: Message[] = [];

        // Добавляем системный промпт в самом начале (обязательно!)
        if (config.systemPrompt) {
            messages.push({
                role: 'system',
                content: config.systemPrompt,
            });
        }

        // Добавляем историю чата
        if (config.history && config.history.length > 0) {
            messages.push(...config.history);
        }

        // Добавляем контекстный промпт перед сообщением пользователя
        if (config.contextPrompt) {
            messages.push({
                role: 'user',
                content: config.contextPrompt,
            });
        }

        // Добавляем текущее сообщение пользователя
        if (config.userMessage) {
            messages.push({
                role: 'user',
                content: config.userMessage,
            });
        }

        return messages;
    }

    /**
     * Отправка сообщения с историей чата
     * Удобный метод для работы с историей диалога
     */
    async chat(
        config: ChatConfig,
        options: { signal?: AbortSignal } = {}
    ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
        const messages = this.buildMessages(config);

        return this.chatCompletionsCreate(
            {
                model: config.model || 'qwen3.5-35b',
                messages,
                stream: config.stream ?? true,
                temperature: config.temperature,
                top_p: config.top_p,
                max_tokens: config.max_tokens,
                stop: config.stop,
                frequency_penalty: config.frequency_penalty,
                presence_penalty: config.presence_penalty,
                reasoning: config.reasoning,
            },
            options
        );
    }

    /**
     * Добавление сообщения в историю чата
     */
    static addMessageToHistory(
        history: Message[],
        role: 'user' | 'assistant',
        content: string
    ): Message[] {
        return [...history, { role, content }];
    }

    /**
     * Добавление сообщения в историю чата с генерацией ID
     */
    static addMessageToHistoryWithId(
        history: MessageWithId[],
        role: 'user' | 'assistant',
        content: string,
        cardId?: string,
        hidden?: boolean
    ): MessageWithId[] {
        return [...history, { role, content, id: generateId(), cardId, hidden }];
    }

    /**
     * Очистка истории чата
     */
    static clearHistory(): Message[] {
        return [];
    }

    /**
     * Ограничение истории чата последними N сообщениями
     */
    static limitHistory(history: Message[], maxMessages: number): Message[] {
        // Системный промпт (если есть) всегда сохраняется первым
        const systemMessage = history.find(m => m.role === 'system');
        const otherMessages = history.filter(m => m.role !== 'system');
        
        if (otherMessages.length <= maxMessages) {
            return history;
        }

        const limitedOtherMessages = otherMessages.slice(-maxMessages);
        return systemMessage ? [systemMessage, ...limitedOtherMessages] : limitedOtherMessages;
    }

    /**
     * Редактирование сообщения по ID
     */
    static editMessage(
        history: Message[],
        messageId: string,
        updates: Partial<Message>
    ): Message[] {
        return history.map(msg => 
            msg.id === messageId ? { ...msg, ...updates } : msg
        );
    }

    /**
     * Удаление сообщения по ID
     */
    static deleteMessage(history: Message[], messageId: string): Message[] {
        return history.filter(msg => msg.id !== messageId);
    }

    /**
     * Получение всех уникальных cardId из истории
     */
    static getCardIds(history: Message[]): string[] {
        const cardIds = new Set<string>();
        for (const msg of history) {
            if (msg.cardId) {
                cardIds.add(msg.cardId);
            }
        }
        return Array.from(cardIds);
    }

    /**
     * Получение всех сообщений для определённой карты
     */
    static getMessagesByCardId(history: Message[], cardId: string): Message[] {
        return history.filter(msg => msg.cardId === cardId && !msg.hidden);
    }

    /**
     * Получение всех видимых сообщений (без скрытых)
     */
    static getVisibleMessages(history: Message[]): Message[] {
        return history.filter(msg => !msg.hidden);
    }

    /**
     * Пометить сообщение как скрытое
     */
    static hideMessage(history: Message[], messageId: string): Message[] {
        return this.editMessage(history, messageId, { hidden: true });
    }

    /**
     * Показать скрытое сообщение
     */
    static showMessage(history: Message[], messageId: string): Message[] {
        return this.editMessage(history, messageId, { hidden: false });
    }

    /**
     * Пометить сообщение как видимое (аналог showMessage)
     */
    static setVisible(history: Message[], messageId: string, visible: boolean): Message[] {
        return this.editMessage(history, messageId, { hidden: !visible });
    }

    /**
     * Получение ID последнего сообщения в истории
     */
    static getLastMessageId(history: Message[]): string | undefined {
        if (history.length === 0) {
            return undefined;
        }
        const lastMessage = history[history.length - 1];
        return lastMessage.id;
    }

    /**
     * Получение ID всех сообщений в истории
     */
    static getAllMessageIds(history: Message[]): string[] {
        return history
            .map(msg => msg.id)
            .filter(id => id !== undefined) as string[];
    }

    /**
     * Получение сообщения по ID
     */
    static getMessageById(history: Message[], messageId: string): Message | undefined {
        return history.find(msg => msg.id === messageId);
    }
}

/**
 * Генерация уникального ID для сообщений
 */
export function generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Глобальное определение для process в тестовых скриптах
 */
declare const process: {
    exit: (code?: number) => never;
};