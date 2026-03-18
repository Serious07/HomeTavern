/**
 * Тестовый скрипт для LLM Client Library
 */

import { 
    LLMClient, 
    Message, 
    generateId,
    MessageWithId 
} from './src/index.js';

// Глобальное определение для process
declare const process: {
    exit: (code?: number) => never;
};

async function runBasicTest() {
    console.log('=== Базовый тест LLM Client Library ===\n');

    const client = new LLMClient({
        baseURL: 'http://127.0.0.1:8080/v1',
        timeout: 120000,
    });

    console.log('Отправка запроса к LLM...\n');

    try {
        const response = await client.chatCompletionsCreate({
            model: 'qwen3.5-35b',
            messages: [
                {
                    role: 'user',
                    content: 'Привет! Расскажи кратко о себе. Используй русский язык.',
                },
            ],
            stream: true,
        });

        let fullReasoning = '';
        let fullContent = '';

        console.log('--- Получение ответа в потоковом режиме ---\n');

        // Проверяем, является ли ответ итератором
        if (typeof (response as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of response as any) {
                const choice = chunk.choices[0];
                
                if (choice.delta?.reasoning_content) {
                    fullReasoning += choice.delta.reasoning_content;
                    console.log(`[Мышление] ${choice.delta.reasoning_content}`);
                }
                
                if (choice.delta?.content) {
                    fullContent += choice.delta.content;
                    console.log(`[Ответ] ${choice.delta.content}`);
                }
            }
        }

        console.log('\n--- Итоговый результат ---\n');
        console.log('Полное мышление:');
        console.log(fullReasoning);
        console.log('\nПолный ответ:');
        console.log(fullContent);
        console.log('\n=== Базовый тест завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
            if ('cause' in error && error.cause) {
                console.error(`Причина: ${error.cause}`);
            }
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function runChatTest() {
    console.log('\n\n=== Тест чата с историей и системным промптом ===\n');

    const client = new LLMClient({
        baseURL: 'http://127.0.0.1:8080/v1',
        timeout: 120000,
    });

    try {
        // Инициализация истории чата
        let history: MessageWithId[] = [];

        // Первый запрос с системным промптом
        const response1 = await client.chat({
            model: 'qwen3.5-35b',
            systemPrompt: 'Ты полезный ассистент. Отвечай кратко и по делу.',
            userMessage: 'Привет! Как твои дела?',
            stream: true,
        });

        let fullContent1 = '';
        console.log('--- Ответ 1 ---\n');

        if (typeof (response1 as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of response1 as any) {
                const choice = chunk.choices[0];
                if (choice.delta?.content) {
                    fullContent1 += choice.delta.content;
                    console.log(choice.delta.content);
                }
            }
        }

        // Добавляем в историю
        history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Привет! Как твои дела?');
        history = LLMClient.addMessageToHistoryWithId(history, 'assistant', fullContent1);

        // Второй запрос с контекстным промптом
        const response2 = await client.chat({
            model: 'qwen3.5-35b',
            systemPrompt: 'Ты полезный ассистент. Отвечай кратко и по делу.',
            history: history,
            contextPrompt: 'Продолжи наш диалог, помни контекст.',
            userMessage: 'Что ты умеешь?',
            stream: true,
        });

        let fullContent2 = '';
        console.log('\n--- Ответ 2 ---\n');

        if (typeof (response2 as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of response2 as any) {
                const choice = chunk.choices[0];
                if (choice.delta?.content) {
                    fullContent2 += choice.delta.content;
                    console.log(choice.delta.content);
                }
            }
        }

        // Добавляем в историю
        history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Что ты умеешь?');
        history = LLMClient.addMessageToHistoryWithId(history, 'assistant', fullContent2);

        console.log('\n=== Тест чата завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function runHistoryLimitTest() {
    console.log('\n\n=== Тест ограничения истории чата ===\n');

    const client = new LLMClient({
        baseURL: 'http://127.0.0.1:8080/v1',
        timeout: 120000,
    });

    try {
        // Создаём длинную историю
        const longHistory: MessageWithId[] = [
            { role: 'system', content: 'Ты ассистент.', id: 'sys-1' },
            { role: 'user', content: 'Привет', id: 'user-1' },
            { role: 'assistant', content: 'Привет!', id: 'bot-1' },
            { role: 'user', content: 'Как дела?', id: 'user-2' },
            { role: 'assistant', content: 'Хорошо, спасибо!', id: 'bot-2' },
            { role: 'user', content: 'Что делаешь?', id: 'user-3' },
            { role: 'assistant', content: 'Работаю.', id: 'bot-3' },
            { role: 'user', content: 'Что ещё?', id: 'user-4' },
            { role: 'assistant', content: 'Разное.', id: 'bot-4' },
        ];

        console.log('Исходная история (9 сообщений):');
        console.log(longHistory.map(m => `[${m.role}] ${m.content}`).join('\n'));

        // Ограничиваем до 4 сообщений (без системного)
        const limitedHistory = LLMClient.limitHistory(longHistory, 4);

        console.log('\nОграниченная история (макс. 4 сообщения + системный):');
        console.log(limitedHistory.map(m => `[${m.role}] ${m.content}`).join('\n'));

        console.log('\n=== Тест ограничения истории завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function testMessageManagement() {
    console.log('\n\n=== Тест управления сообщениями ===\n');

    try {
        // Создаём историю с cardId и hidden
        const history: MessageWithId[] = [
            { role: 'system', content: 'Ты помощник.', id: 'sys-1' },
            { role: 'user', content: 'Привет', id: 'user-1', cardId: 'card-1' },
            { role: 'assistant', content: 'Привет!', id: 'bot-1', cardId: 'card-1' },
            { role: 'user', content: 'Как дела?', id: 'user-2', cardId: 'card-2' },
            { role: 'assistant', content: 'Хорошо', id: 'bot-2', cardId: 'card-2' },
            { role: 'user', content: 'Скрытое сообщение', id: 'user-3', hidden: true },
        ];

        console.log('Исходная история:', history.length, 'сообщений');
        
        // Генерация ID
        const newId = generateId();
        console.log('Сгенерированный ID:', newId);
        
        // Добавление нового сообщения
        const newMessage: MessageWithId = {
            role: 'user',
            content: 'Новое сообщение',
            id: generateId(),
            cardId: 'card-3'
        };
        const historyWithNew = [...history, newMessage];
        console.log('После добавления:', historyWithNew.length, 'сообщений');
        
        // Редактирование сообщения
        const editedHistory = LLMClient.editMessage(historyWithNew, 'user-2', { content: 'Как твои дела?' });
        console.log('После редактирования:', editedHistory.find(m => m.id === 'user-2')?.content);
        
        // Получение cardId
        const cardIds = LLMClient.getCardIds(history);
        console.log('Уникальные cardId:', cardIds);
        
        // Получение сообщений по cardId
        const cardMessages = LLMClient.getMessagesByCardId(history, 'card-1');
        console.log('Сообщения для card-1:', cardMessages.length);
        
        // Скрытие сообщения
        const hiddenHistory = LLMClient.hideMessage(history, 'user-2');
        const visibleMessages = LLMClient.getVisibleMessages(hiddenHistory);
        console.log('Видимых сообщений после скрытия:', visibleMessages.length);
        
        // Показ скрытого сообщения
        const shownHistory = LLMClient.showMessage(hiddenHistory, 'user-2');
        const shownVisible = LLMClient.getVisibleMessages(shownHistory);
        console.log('Видимых сообщений после показа:', shownVisible.length);
        
        // Удаление сообщения
        const deletedHistory = LLMClient.deleteMessage(shownHistory, 'bot-1');
        console.log('После удаления:', deletedHistory.length, 'сообщений');
        
        console.log('\n=== Тест управления сообщениями завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function testMessageIds() {
    console.log('\n\n=== Тест работы с ID сообщений ===\n');

    try {
        // Создаём историю с ID
        const history: MessageWithId[] = [
            { role: 'system', content: 'Ты помощник.', id: 'sys-1' },
            { role: 'user', content: 'Привет', id: 'user-1', cardId: 'card-1' },
            { role: 'assistant', content: 'Привет!', id: 'bot-1', cardId: 'card-1' },
            { role: 'user', content: 'Как дела?', id: 'user-2', cardId: 'card-2' },
            { role: 'assistant', content: 'Хорошо', id: 'bot-2', cardId: 'card-2' },
        ];

        console.log('Исходная история:', history.length, 'сообщений');
        
        // Получение ID последнего сообщения
        const lastMessageId = LLMClient.getLastMessageId(history);
        console.log('ID последнего сообщения:', lastMessageId);
        
        // Получение всех ID сообщений
        const allMessageIds = LLMClient.getAllMessageIds(history);
        console.log('Все ID сообщений:', allMessageIds);
        
        // Получение сообщения по ID
        const userMessage = LLMClient.getMessageById(history, 'user-2');
        console.log('Сообщение с ID user-2:', userMessage?.content);
        
        // Добавление сообщения с получением ID
        const newHistory = LLMClient.addMessageToHistoryWithId(history, 'user', 'Новое сообщение');
        const newMessageId = LLMClient.getLastMessageId(newHistory);
        console.log('ID нового сообщения:', newMessageId);
        
        console.log('\n=== Тест работы с ID сообщений завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function testSystemAndContextPrompts() {
    console.log('\n\n=== Тест системного и контекстного промптов ===\n');

    const client = new LLMClient({
        baseURL: 'http://127.0.0.1:8080/v1',
        timeout: 120000,
    });

    try {
        // Первый запрос с системным промптом
        const response1 = await client.chat({
            model: 'qwen3.5-35b',
            systemPrompt: 'Ты эксперт по программированию. Отвечай подробно.',
            userMessage: 'Как работает Event Loop в Node.js?',
            stream: true,
        });

        let fullContent1 = '';
        console.log('--- Ответ 1 ---\n');

        if (typeof (response1 as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of response1 as any) {
                const choice = chunk.choices[0];
                if (choice.delta?.content) {
                    fullContent1 += choice.delta.content;
                    console.log(choice.delta.content);
                }
            }
        }

        // Второй запрос с контекстным промптом
        const response2 = await client.chat({
            model: 'qwen3.5-35b',
            systemPrompt: 'Ты эксперт по программированию. Отвечай подробно.',
            history: [
                { role: 'user', content: 'Как работает Event Loop в Node.js?', id: 'user-1' },
                { role: 'assistant', content: fullContent1, id: 'bot-1' }
            ],
            contextPrompt: 'Пользователь интересуется асинхронностью в JavaScript.',
            userMessage: 'А как работает таймеры?',
            stream: true,
        });

        let fullContent2 = '';
        console.log('\n--- Ответ 2 ---\n');

        if (typeof (response2 as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of response2 as any) {
                const choice = chunk.choices[0];
                if (choice.delta?.content) {
                    fullContent2 += choice.delta.content;
                    console.log(choice.delta.content);
                }
            }
        }

        console.log('\n=== Тест системного и контекстного промптов завершен успешно ===');
    } catch (error) {
        console.error('\n=== Ошибка ===');
        if (error instanceof Error) {
            console.error(`Тип ошибки: ${error.name}`);
            console.error(`Сообщение: ${error.message}`);
        } else {
            console.error(`Неизвестная ошибка: ${error}`);
        }
        process.exit(1);
    }
}

async function main() {
    console.log('🚀 Запуск тестов LLM Client Library...\n');
    
    await runBasicTest();
    await runChatTest();
    await runHistoryLimitTest();
    await testMessageManagement();
    await testMessageIds();
    await testSystemAndContextPrompts();
    
    console.log('\n\n=== Все тесты завершены успешно ===');
}

// Запуск тестов
main().catch(console.error);