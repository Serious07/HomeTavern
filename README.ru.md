# HomeTavern

> 🌐 **Язык:** [English](README.md) | Русский

Полноценное веб-приложение для ролевых игр и свободных диалогов с LLM, использующее карточки персонажей в стиле SillyTavern. Соединяет многопользовательский фронтенд на React с API на Node/Express и умеет работать с **локальными** моделями (через сервер [llama.cpp](llama-cpp-setup.md)) или с любым **OpenAI-совместимым** эндпоинтом.

## Возможности

- **Многопользовательские аккаунты** — аутентификация по JWT с ролевой моделью доступа; при первом запуске создаётся учётная запись администратора.
- **Карточки персонажей** — характер, описание, системный промпт, аватар и несколько приветственных/первых сообщений на персонажа.
- **Профиль героя с вариациями** — пользователь представлен как собственный постоянный персонаж, с переключаемыми вариациями.
- **Потоковый чат** — построчная (посимвольная) генерация ответов с опциональным показом «размышлений» модели (reasoning).
- **Перевод RU ⇄ EN** — перевод сообщений с подключаемыми провайдерами (по умолчанию LibreTranslate; доступны Google, Yandex и LLM-бэкенды).
- **Умное сжатие истории** — длинные диалоги сворачиваются в резюме-«блоки», чтобы промпт оставался в пределах контекста.
- **Статистика контекста** — отслеживание использования токенов и окна контекста для каждого чата.
- **Редактор системных промптов** — создание и повторное использование именованных промптов для персонажей и чатов.
- **Несколько LLM-подключений** — регистрация и переключение локальных и облачных эндпоинтов на лету.

## Стек технологий

| Слой | Технологии |
|------|------------|
| Фронтенд | React 18, TypeScript, Vite, Tailwind CSS, react-markdown, react-window |
| Бэкенд | Node.js, Express 4, TypeScript, better-sqlite3, JWT (jsonwebtoken + bcrypt) |
| Обмен с LLM | [`llm-client`](llm-client/README.md) — локальная библиотека поверх OpenAI-совместимых API |
| Перевод | [`translation-library`](translation-library/README.md) — локальная библиотека (Node + Python) |
| Модели | llama.cpp `llama-server` (OpenAI-совместимый `/v1`) или любой облачный эндпоинт |
| База данных | SQLite (один файл `hometavern.db`, создаётся при первом запуске) |

## Структура репозитория

```
HomeTavern V5/
├─ client/                     # Фронтенд на React + Vite (dev-сервер на :3000)
├─ server/                     # Express API (на :4000) + SQLite
│  └─ src/
│     ├─ config/database.ts    # инициализация схемы (таблицы создаются при старте)
│     ├─ routes/               # модули маршрутов /api/*
│     ├─ services/             # бизнес-логика (auth, chat, llm, compression, …)
│     ├─ repositories/         # слой доступа к данным
│     └─ migrations/           # разовые миграции схемы
├─ llm-client/nodejs/          # локальная библиотека — LLM-клиент
├─ translation-library/        # локальная библиотека — nodejs/ и python/ реализации
├─ plans/                      # проектные документы (архитектура, фичи)
├─ docs/                       # эксплуатационные доки (кэширование промптов, llama.cpp)
├─ llama-cpp-setup.md          # как запустить локальный модельный сервер
├─ start.bat / start.sh        # helpers: сборка + запуск одной командой
└─ package.json                # оркестратор workspace (concurrently)
```

Пакет `server` зависит от двух локальных библиотек через `file:`-ссылки (см. [`server/package.json`](server/package.json)), поэтому **их нужно собрать перед запуском сервера.**

## Предварительные требования

- **Node.js 18+** (и `npm`).
- Запущенный **сервер llama.cpp** (или любой OpenAI-совместимый API) — см. [`llama-cpp-setup.md`](llama-cpp-setup.md).
- *(Необязательно)* Бэкенд перевода, например [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate), если нужен живой перевод RU ⇄ EN.

## Установка

> Примечание: папка репозитория называется `HomeTavern V5` и содержит пробел, поэтому в оболочке её нужно взять в кавычки.

```bash
git clone <repo-url>
cd "HomeTavern V5"
```

**1. Собрать локальные библиотеки workspace** (обязательно — сервер ссылается на их `dist/`):

```bash
cd translation-library/nodejs && npm install && npm run build && cd ../../
cd llm-client/nodejs           && npm install && npm run build && cd ../../
```

**2. Установить зависимости приложения:**

```bash
cd server  && npm install && cd ..
cd client  && npm install && cd ..
npm install          # корень: устанавливает `concurrently`
```

**3. Настроить сервер:**

```bash
cd server
cp .env.example .env   # в Windows: copy .env.example .env
cd ..
```

Отредактируйте [`server/.env`](server/.env), указав свой модельный сервер (см. таблицу [Переменные окружения](#переменные-окружения)).

**4. Запустить модельный сервер** (в отдельном терминале). Целевой адрес по умолчанию — `http://localhost:1234/v1`:

```bash
llama-server -m ./models/model.gguf --port 1234
```

Полный набор параметров (оффлоад на GPU, `--n-ctx`, flash attention) — в [`llama-cpp-setup.md`](llama-cpp-setup.md).

**5. Запустить приложение:**

```bash
npm run dev
```

Это поднимет API на `:4000` и dev-сервер Vite на `:3000`. Откройте <http://localhost:3000>.

На Windows можно воспользоваться `start.bat`; на Linux/macOS — `./start.sh` — оба скрипта предварительно пересобирают локальные библиотеки, поэтому ручной шаг сборки выше становится необязательным при их использовании.

**6. Создайте аккаунт и начните общение.** Администратор при первом запуске создаётся из `ADMIN_USERNAME` / `ADMIN_PASSWORD` в `.env` (по умолчанию `admin` / `admin123` — обязательно смените).

## Переменные окружения

Вся конфигурация сервера — в файле [`server/.env`](server/.env) (шаблон: [`server/.env.example`](server/.env.example)):

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `4000` | Порт API-сервера |
| `CORS_ORIGIN` | `*` | Разрешённые origins (через запятую) |
| `DB_PATH` | `./hometavern.db` | Путь к файлу SQLite |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | Администратор, создаваемый при первом запуске |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | OpenAI-совместимый базовый URL |
| `LLM_MODEL` | `qwen-3.5` | Имя модели для LLM-сервера |
| `LLM_API_KEY` | `local-model-key` | API-ключ (игнорируется локальными серверами) |
| `LLM_MAX_TOKENS` | `64000` | Максимум токенов генерации |
| `LLM_MAX_CONTEXT_LENGTH` | `131072` | Размер окна контекста для статистики |
| `TRANSLATION_PROVIDER` | `libretranslate` | `libretranslate`, `google`, `yandex` или `llm` |
| `TRANSLATION_API_KEY` | *(пусто)* | Ключ для облачных провайдеров перевода |
| `REQUEST_TIMEOUT` | `3600000` | Таймаут запроса (мс) — для загрузки больших историй/сжатия |
| `ENABLE_PROMPT_DEBUG` | `false` | Отладка хэшей промптов для проблем с KV-кэшем |

## Порты

| Порт | Сервис |
|------|--------|
| `3000` | Dev-сервер Vite (фронтенд) |
| `4000` | Express API |
| `1234` | Модельный сервер llama.cpp |

Фронтенд обращается к API по `/api/*`, который Vite проксирует на `:4000` (см. [`client/vite.config.ts`](client/vite.config.ts)). API слушает `0.0.0.0`, поэтому доступен и с других устройств в вашей локальной сети.

## Покрытие API

Топ-уровневые группы маршрутов (монтируются под `/api` в [`server/src/index.ts`](server/src/index.ts)): `auth`, `admin`, `characters`, `chats`, `messages`, `hero`, `context`, `compression`, `translate`, `system-prompts`, `settings` и `llm-connections`. Полный справочник эндпоинтов — в [`plans/architecture.md`](plans/architecture.md).

## Архитектура

```mermaid
graph TD
  UI[React SPA :3000] -->|/api/* (Vite proxy)| API[Express API :4000]
  API --> DB[(SQLite hometavern.db)]
  API --> LLM[llama.cpp / OpenAI-compatible :1234]
  API --> TR[Провайдер перевода]
```

## Миграции

Таблицы схемы создаются автоматически при старте сервера. Для разовой миграции схемы системных промптов:

```bash
npm run migrate:system-prompts
```

## Другие команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запустить API и клиент вместе |
| `npm run server` | Только API |
| `npm run client` | Только фронтенд |
| `npm run build` | Собрать сервер и клиент для продакшена |
| `npm start` | Запустить собранный сервер |

## Документация

- [`llama-cpp-setup.md`](llama-cpp-setup.md) — сборка и запуск локального модельного сервера
- [`docs/README_LLAMA_CPP_SERVER.md`](docs/README_LLAMA_CPP_SERVER.md) — заметки по серверу llama.cpp
- [`docs/PROMPT_CACHING.md`](docs/PROMPT_CACHING.md) — поведение кэша промптов/KV и отладка
- [`llm-client/README.md`](llm-client/README.md) — библиотека LLM-клиента
- [`translation-library/README.md`](translation-library/README.md) — библиотека перевода
- [`plans/architecture.md`](plans/architecture.md) — полная модель данных и справочник API

## Автор

Создано **Serious07** (2026).

- Поддержка: <https://www.donationalerts.com/r/serious07>
- Twitch: <https://www.twitch.tv/serious07>

## Лицензия

MIT — см. [`LICENSE`](LICENSE).
