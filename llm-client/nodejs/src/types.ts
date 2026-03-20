/**
 * Типы данных для LLM Client Library
 */

/**
 * Роль сообщения в чате
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function';

/**
 * Сообщение в чате
 */
export interface Message {
    role: MessageRole;
    content: string;
    name?: string;
    id?: string;              // Уникальный идентификатор сообщения
    hidden?: boolean;         // Скрыто ли сообщение (не передаётся ИИ)
    cardId?: string;          // ID карты для группировки сообщений
}

/**
 * Сообщение с обязательным ID (для управления историей)
 */
export interface MessageWithId extends Message {
    id: string;
}

/**
 * Параметры конфигурации чата
 */
export interface ChatConfig {
    /** Модель для использования */
    model?: string;
    /** Системный промпт - устанавливается в самом начале списка сообщений */
    systemPrompt?: string;
    /** Контекстный промпт - дополнительные инструкции для текущего запроса */
    contextPrompt?: string;
    /** История сообщений чата */
    history?: Message[];
    /** Текущее сообщение от пользователя */
    userMessage?: string;
    /** Потоковый режим */
    stream?: boolean;
    /** Температура генерации */
    temperature?: number;
    /** Top-p sampling */
    top_p?: number;
    /** Максимальное количество токенов */
    max_tokens?: number | null;
    /** Стоп-последовательности */
    stop?: string | string[];
    /** Штраф за частоту */
    frequency_penalty?: number;
    /** Штраф за присутствие */
    presence_penalty?: number;
}

/**
 * Параметры запроса к чат-комплитиону
 */
export interface ChatCompletionCreateParams {
    model: string;
    messages: Message[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number | null;
    stop?: string | string[];
    frequency_penalty?: number;
    presence_penalty?: number;
    logit_bias?: Record<string, number>;
    user?: string;
}

/**
 * Ошибки API
 */
export class APIError extends Error {
    public readonly status: number;
    public readonly headers: Headers;
    public readonly body: string;

    constructor(status: number, headers: Headers, body: string, message?: string) {
        super(message || `API Error: ${status} ${body}`);
        this.name = 'APIError';
        this.status = status;
        this.headers = headers;
        this.body = body;
    }
}

/**
 * Ошибки сети
 */
export class NetworkError extends Error {
    public readonly cause?: Error;

    constructor(message: string, cause?: Error) {
        super(message);
        this.name = 'NetworkError';
        this.cause = cause;
    }
}

/**
 * Ошибки таймаута
 */
export class TimeoutError extends Error {
    constructor(message = 'Request timeout') {
        super(message);
        this.name = 'TimeoutError';
    }
}

/**
 * Дельта чанка - часть ответа, которая приходит в потоке
 */
export interface Delta {
    role?: MessageRole;
    content?: string;
    reasoning_content?: string;
}

/**
 * Выбор в чат-комплитионе
 */
export interface Choice {
    index: number;
    delta: Delta;
    finish_reason?: 'stop' | 'length' | 'content_filter' | null;
}

/**
 * Чанк ответа (потоковый режим)
 */
export interface ChatCompletionChunk {
    id: string;
    created: number;
    model: string;
    system_fingerprint?: string;
    object: 'chat.completion.chunk';
    choices: Choice[];
    usage?: Usage;  // Добавлено для получения usage в последнем чанке
    timings?: {
        cache_n: number;
        prompt_n: number;
        prompt_ms: number;
        prompt_per_token_ms: number;
        prompt_per_second: number;
        predicted_n: number;
        predicted_ms: number;
        predicted_per_token_ms: number;
        predicted_per_second: number;
    };
}

/**
 * Сообщение в финальном ответе
 */
export interface ChatMessage {
    role: MessageRole;
    content: string;
}

/**
 * Использование токенов
 */
export interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

/**
 * Финальный ответ чат-комплитиона (не потоковый режим)
 */
export interface ChatCompletion {
    id: string;
    created: number;
    model: string;
    system_fingerprint?: string;
    object: 'chat.completion';
    choices: {
        index: number;
        message: ChatMessage;
        finish_reason: 'stop' | 'length' | 'content_filter';
    }[];
    usage: Usage;
    timings?: {
        cache_n: number;
        prompt_n: number;
        prompt_ms: number;
        prompt_per_token_ms: number;
        prompt_per_second: number;
        predicted_n: number;
        predicted_ms: number;
        predicted_per_token_ms: number;
        predicted_per_second: number;
    };
}

/**
 * Параметры конфигурации клиента
 */
export interface ClientOptions {
    baseURL: string;
    apiKey?: string;
    timeout?: number;
}

/**
 * Опции для создания запроса
 */
export interface RequestOptions {
    signal?: AbortSignal;
}