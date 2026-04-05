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
        this.timeout = options.timeout ?? 900000; // 15 minutes
    }

    /**
     * Отправка запроса к API
     */
    private async request(
        endpoint: string,
        method: string,
        body?: unknown,
        options: { signal?: AbortSignal } = {}
    ): Promise<Response> {
        const url = `${this.baseURL}${endpoint}`;
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: options.signal ?? controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text();
                throw new APIError(response.status, response.headers, text);
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new TimeoutError('Request timeout');
                }
                if (error instanceof APIError) {
                    throw error;
                }
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