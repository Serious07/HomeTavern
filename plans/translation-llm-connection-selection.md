# План: выбор LLM-подключения для перевода

## Цель

В разделе «Настройки → Перевод» при провайдере `llm` добавить выпадающий список,
в котором пользователь выбирает, каким API-подключением (со страницы «Подключения»)
выполнять перевод. По умолчанию — основное (активное) подключение, как сейчас.

## Текущее поведение

Перевод через LLM всегда использует активное подключение:
- `server/src/services/translation.service.ts:140` — `llmService.getActiveConnection(userId)` в `buildLibrary`
- `server/src/routes/translate.ts:262` — то же в потоковом эндпоинте `/api/translate/stream`

Клиент (`client/src/pages/SettingsPage.tsx`) в секции «Перевод» уже имеет
провайдер, reasoning и системный промпт — но не выбор подключения.

## Миграция базы данных

Не требуется. Настройка хранится в существующей key-value таблице `settings`
(new key `translation_llm_connection_id`). Схема не меняется, существующие
данные не удаляются и не изменяются.

Обработка удалённого подключения: если сохранённый id больше не существует
(пользователь удалил подключение), сервер молча откатывается к активному
подключению. Записи в БД при этом не удаляются.

## Изменения

### Server

1. `server/src/services/translation.service.ts`
   - В `UserTranslationSettings` добавить `llmConnectionId?: number`.
   - В `getUserTranslationSettings` читать `translation_llm_connection_id`.
   - Экспортировать `resolveTranslationLlmConnection(userId, settings)`:
     - id задан → `llmConnectionRepository.getByIdWithDecryptedKey(id)`,
       проверить `user_id` (чужой id игнорируется);
     - иначе / не найден → `llmService.getActiveConnection(userId)`.
   - `buildLibrary`: использовать резолвер вместо `getActiveConnection`
     (model, reasoning_effort, base_url, api_key — из выбранного подключения).
2. `server/src/routes/translate.ts`
   - В `/stream` использовать тот же резолвер вместо `getActiveConnection`.
   - `GET /api/translate/settings` — возвращать `llmConnectionId`.
   - `PUT /api/translate/settings` — принимать `llmConnectionId`
     (число → сохранить после проверки существования/принадлежности;
     `null`/`''` → сброс к основному подключению; невалидный id → 400).
   - Кэш сервиса уже инвалидируется (`invalidateServiceCache`).

### Client

3. `client/src/pages/SettingsPage.tsx`
   - При загрузке настроек тянуть список подключений
     (`llmConnectionsApi.getAll()`) и `llmConnectionId` из `/translate/settings`.
   - В секции «Перевод», при `translationProvider === 'llm'`, показать `<select>`
     «Подключение для перевода через LLM»:
     - первый вариант — «Основное подключение (текущее)» (значение `''`, default);
     - далее все подключения пользователя: `name` + `model` + `base_url`,
       активное помечено «(основное)»;
     - сохранение через `PUT /translate/settings` (`llmConnectionId`),
       откат значения при ошибке — как у соседних контролов.

## Проверка

- `npm run build:server` и `npm run build:client` (tsc).
- Ручная проверка сценариев: default = активное подключение; выбор другого
  подключения меняет модель перевода; удаление выбранного подключения →
  фолбэк на активное.

## Коммит

По завершении — один коммит с изменениями (данные БД не трогаем).