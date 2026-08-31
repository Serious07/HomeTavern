# HomeTavern

> 🌐 **Language:** English | [Русский](README.ru.md)

A full-stack web app for role-playing and open-ended dialogue with LLMs, using SillyTavern-style character cards. It pairs a multi-user React front end with a Node/Express API, and can talk to **local** models (via a [llama.cpp](llama-cpp-setup.md) server) or any **OpenAI-compatible** endpoint.

## Features

- **Multi-user accounts** — JWT auth with role-based access; an admin account is seeded on first run.
- **Character cards** — persona, description, system prompt, avatar, and multiple greeting/first messages per character.
- **Hero profile with variations** — model the user as their own persistent character, with switchable variants.
- **Streaming chat** — token-streamed responses with optional visibility of the model's reasoning trace.
- **RU ⇄ EN translation** — per-message translation with pluggable providers (LibreTranslate by default; Google, Yandex, and LLM backends available).
- **Smart history compression** — folds long dialogues into summary "blocks" to keep prompts within context limits.
- **Context stats** — live token usage and context-window tracking per chat.
- **System-prompt editor** — author and reuse named system prompts across characters and chats.
- **Multiple LLM connections** — register and switch between local and cloud endpoints at runtime.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, react-markdown, react-window |
| Backend    | Node.js, Express 4, TypeScript, better-sqlite3, JWT (jsonwebtoken + bcrypt) |
| LLM I/O    | [`llm-client`](llm-client/README.md) — local workspace library wrapping OpenAI-compatible APIs |
| Translation| [`translation-library`](translation-library/README.md) — local workspace library (Node + Python) |
| Models     | llama.cpp `llama-server` (OpenAI-compatible `/v1`) or any cloud endpoint |
| Database   | SQLite (single `hometavern.db` file, created on first run) |

## Repository layout

```
HomeTavern V5/
├─ client/                     # React + Vite front end (dev server on :3000)
├─ server/                     # Express API (on :4000) + SQLite
│  └─ src/
│     ├─ config/database.ts    # schema bootstrap (tables created on start)
│     ├─ routes/               # /api/* route modules
│     ├─ services/             # business logic (auth, chat, llm, compression, …)
│     ├─ repositories/         # data access layer
│     └─ migrations/           # one-off schema migrations
├─ llm-client/nodejs/          # local lib — OpenAI-compatible LLM client
├─ translation-library/        # local lib — nodejs/ and python/ implementations
├─ plans/                      # design docs (architecture, features)
├─ docs/                       # operational docs (prompt caching, llama.cpp)
├─ llama-cpp-setup.md          # how to run the local model server
├─ start.bat / start.sh        # one-shot build + run helpers
└─ package.json                # workspace orchestrator (concurrently)
```

The `server` package depends on the two local libraries via `file:` references (see [`server/package.json`](server/package.json)), so **they must be built before the server starts.**

## Prerequisites

- **Node.js 18+** (and `npm`).
- A running **llama.cpp server** (or any OpenAI-compatible API) — see [`llama-cpp-setup.md`](llama-cpp-setup.md).
- *(Optional)* A translation backend, e.g. [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate), if you want live RU ⇄ EN translation.

## Setup

> Note: the repository folder is `HomeTavern V5` and contains a space, so quote it in your shell.

```bash
git clone <repo-url>
cd "HomeTavern V5"
```

**1. Build the local workspace libraries** (required — the server links to their `dist/`):

```bash
cd translation-library/nodejs && npm install && npm run build && cd ../../
cd llm-client/nodejs           && npm install && npm run build && cd ../../
```

**2. Install app dependencies:**

```bash
cd server  && npm install && cd ..
cd client  && npm install && cd ..
npm install          # root: installs `concurrently`
```

**3. Configure the server:**

```bash
cd server
cp .env.example .env   # on Windows: copy .env.example .env
cd ..
```

Edit [`server/.env`](server/.env) to point at your model server (see the [Environment](#environment) table).

**4. Start the model server** (in a separate terminal). Default target is `http://localhost:1234/v1`:

```bash
llama-server -m ./models/model.gguf --port 1234
```

Full options (GPU offload, `--n-ctx`, flash attention) are in [`llama-cpp-setup.md`](llama-cpp-setup.md).

**5. Run the app:**

```bash
npm run dev
```

This starts the API on `:4000` and the Vite dev server on `:3000`. Open <http://localhost:3000>.

On Windows you can use `start.bat`; on Linux/macOS `./start.sh` — both rebuild the local libraries before launching, so the manual build step above becomes optional if you use them.

**6. Create an account and start chatting.** The first-run admin is created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` (defaults `admin` / `admin123` — change them).

## Environment

All server configuration lives in [`server/.env`](server/.env) (template: [`server/.env.example`](server/.env.example)):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `DB_PATH` | `./hometavern.db` | SQLite file location |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | Admin account seeded on first run |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `qwen-3.5` | Model name passed to the LLM server |
| `LLM_API_KEY` | `local-model-key` | API key (ignored by local servers) |
| `LLM_MAX_TOKENS` | `64000` | Max generation tokens |
| `LLM_MAX_CONTEXT_LENGTH` | `131072` | Context-window size used for stats |
| `TRANSLATION_PROVIDER` | `libretranslate` | `libretranslate`, `google`, `yandex`, or `llm` |
| `TRANSLATION_API_KEY` | *(empty)* | Key for hosted translation providers |
| `REQUEST_TIMEOUT` | `3600000` | Request timeout (ms) — large history/compression ops |
| `ENABLE_PROMPT_DEBUG` | `false` | Prompt-hash debugging for KV-cache issues |

## Ports

| Port | Service |
|------|---------|
| `3000` | Vite dev server (front end) |
| `4000` | Express API |
| `1234` | llama.cpp model server |

The front end calls the API at `/api/*`, which Vite proxies to `:4000` (see [`client/vite.config.ts`](client/vite.config.ts)). The API binds `0.0.0.0`, so it is also reachable from other devices on your LAN.

## API surface

Top-level route groups (mounted under `/api` in [`server/src/index.ts`](server/src/index.ts)): `auth`, `admin`, `characters`, `chats`, `messages`, `hero`, `context`, `compression`, `translate`, `system-prompts`, `settings`, and `llm-connections`. The full endpoint reference is in [`plans/architecture.md`](plans/architecture.md).

## Architecture

```mermaid
graph TD
  UI[React SPA :3000] -->|/api/* (Vite proxy)| API[Express API :4000]
  API --> DB[(SQLite hometavern.db)]
  API --> LLM[llama.cpp / OpenAI-compatible :1234]
  API --> TR[Translation provider]
```

## Migrations

Schema tables are auto-created on server start. For the one-off system-prompts schema migration:

```bash
npm run migrate:system-prompts
```

## Other commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run API + client together |
| `npm run server` | API only |
| `npm run client` | Front end only |
| `npm run build` | Build server and client for production |
| `npm start` | Run the compiled server |

## Documentation

- [`llama-cpp-setup.md`](llama-cpp-setup.md) — building and running the local model server
- [`docs/README_LLAMA_CPP_SERVER.md`](docs/README_LLAMA_CPP_SERVER.md) — llama.cpp server notes
- [`docs/PROMPT_CACHING.md`](docs/PROMPT_CACHING.md) — prompt/KV-cache behavior and debugging
- [`llm-client/README.md`](llm-client/README.md) — LLM client library
- [`translation-library/README.md`](translation-library/README.md) — translation library
- [`plans/architecture.md`](plans/architecture.md) — full data model & API reference

## Author

Created by **Serious07** (2026).

- Support: <https://www.donationalerts.com/r/serious07>
- Twitch: <https://www.twitch.tv/serious07>

## License

MIT — see [`LICENSE`](LICENSE).
