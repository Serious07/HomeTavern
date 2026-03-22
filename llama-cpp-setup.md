# Инструкция по настройке llama.cpp

## Описание

Этот документ содержит подробную инструкцию по запуску llama.cpp с OpenAI-compatible API для работы с HomeTavern.

## Требования

- **llama.cpp** - Клонируйте репозиторий или скачайте бинарники
- **Модель в формате GGUF** - Например, Qwen, Llama, Mistral и др.
- **Достаточно оперативной памяти** (минимум 4GB для небольших моделей)

## Установка llama.cpp

### Вариант 1: Сборка из исходного кода (Windows)

```powershell
# Клонировать репозиторий
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp

# Установить зависимости (требуется CMake и компилятор)
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# Или использовать make (если есть MinGW/MSYS2)
cmake -B build
cmake --build build --config Release
```

### Вариант 2: Скачать предсобранные бинарники

1. Перейдите на [GitHub releases](https://github.com/ggerganov/llama.cpp/releases)
2. Скачайте соответствующий бинарник для вашей платформы
3. Распакуйте в удобную директорию

## Запуск сервера llama.cpp

### Базовая команда

```powershell
# Windows (PowerShell)
.\build\bin\Release\llama-server.exe --model .\models\qwen-3.5.gguf --port 8080

# Или если используете main
.\build\bin\Release\llama-main.exe --model .\models\qwen-3.5.gguf --port 8080
```

### Рекомендуемые параметры (для Qwen 3.5 с Reasoning)

```powershell
.\build\bin\Release\llama-server.exe `
  --model ./models/qwen-3.5.gguf `
  --port 8080 `
  --host 127.0.0.1 `
  --n-ctx 8192 `
  --n-thread 8 `
  --n-gpu-layers 35 `
  --flash-attn `
  --batch-size 2048 `
  --ubatch-size 4096
```

**Важно:** Для работы с длинными ответами (Reasoning) необходимо установить `--n-ctx` не менее 8192 токенов. Если модель поддерживает, можно увеличить до 16384 или 32768 для ещё более длинных диалогов.

**Параметры:**

| Параметр | Значение | Описание |
|----------|----------|----------|
| `--model` | путь к файлу | Путь к модели в формате GGUF |
| `--port` | 8080 | Порт для API (обязательно 8080) |
| `--host` | 127.0.0.1 | Хост для прослушивания |
| `--n-ctx` | 8192 | Размер контекстного окна (увеличено для Reasoning) |
| `--n-thread` | 8 | Количество CPU потоков |
| `--n-gpu-layers` | 35 | Слоёв для GPU (для CUDA/Vulkan) |
| `--flash-attn` | - | Включить Flash Attention |
| `--batch-size` | 2048 | Размер батча |
| `--ubatch-size` | 4096 | Размер микро-батча |

### Параметры для CPU только

```powershell
.\build\bin\Release\llama-server.exe `
  --model ./models/qwen-3.5.gguf `
  --port 8080 `
  --n-ctx 8192 `
  --n-thread 8 `
  --mlock
```

`--mlock` блокирует память, чтобы система не выгружала модель.

**Примечание:** Для Qwen 3.5 с включенным Reasoning рекомендуется `--n-ctx 8192` или больше.

### Параметры для GPU (CUDA)

```powershell
.\build\bin\Release\llama-server.exe `
  --model ./models/qwen-3.5.gguf `
  --port 8080 `
  --n-gpu-layers 999 `
  --tensor-split 0,1 `
  --max-tensor-sizes 1024:2048
```

## Запуск в фоновом режиме

### Windows (PowerShell)

```powershell
# Запуск в фоне
Start-Process -NoNewWindow .\build\bin\Release\llama-server.exe -ArgumentList "--model", ".\models\qwen-3.5.gguf", "--port", "8080"

# Или использовать nssm для управления как службой
nssm install llama-cpp "C:\path\to\llama-server.exe" "--model" "C:\models\model.gguf" "--port" "8080"
```

### Linux/macOS

```bash
# Запуск в фоне с nohup
nohup ./llama-server --model ./models/qwen-3.5.gguf --port 8080 &

# Или использовать screen/tmux
tmux new -s llama-cpp
./llama-server --model ./models/qwen-3.5.gguf --port 8080
# Ctrl+B, затем D для отключения
```

## Проверка работы API

### 1. Проверка здоровья

```powershell
curl http://localhost:8080/v1/health
```

Ожидаемый ответ:
```json
{
  "status": "ok"
}
```

### 2. Получение списка моделей

```powershell
curl http://localhost:8080/v1/models
```

Ожидаемый ответ:
```json
{
  "object": "list",
  "data": [
    {
      "id": "qwen-3.5",
      "object": "model",
      "owned_by": "llama.cpp"
    }
  ]
}
```

### 3. Тестовый чат-запрос

```powershell
curl http://localhost:8080/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{
    "model": "qwen-3.5",
    "messages": [
      {"role": "system", "content": "Ты полезный помощник."},
      {"role": "user", "content": "Привет! Как дела?"}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

Ожидаемый ответ:
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "qwen-3.5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Привет! Я в порядке, спасибо. А как у тебя дела?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 20,
    "total_tokens": 35
  }
}
```

## Настройка HomeTavern для работы с llama.cpp

### 1. Проверьте `.env` файл в `server/`

```env
LLM_BASE_URL=http://localhost:8080/v1
LLM_MODEL=qwen-3.5
LLM_API_KEY=local-model-key
```

### 2. Убедитесь, что сервер llama.cpp запущен

```powershell
# Проверка порта
netstat -ano | findstr :8080
```

### 3. Перезапустите сервер HomeTavern

```powershell
npm run server
```

## Решение проблем

### Ошибка: "Слишком длинное сообщение" или "Message too long" для Qwen 3.5 с Reasoning

Если при использовании Qwen 3.5 с включенным Reasoning ответ обрывается досрочно, это связано с ограничением длины сообщения:

1. **Увеличьте `--n-ctx` в llama.cpp** до 8192 или больше (рекомендуется 16384 для длинных диалогов)
2. **Проверьте `max_tokens` в сервере HomeTavern** - должно быть установлено на 999999 (уже настроено по умолчанию)
3. **Убедитесь, что модель поддерживает указанное контекстное окно** - некоторые модели имеют максимальный размер контекста

### Ошибка: "Connection refused"

- Убедитесь, что llama.cpp запущен
- Проверьте, что порт 8080 свободен
- Проверьте брандмауэр

### Ошибка: "Model not found"

- Проверьте путь к файлу модели
- Убедитесь, что файл существует и имеет расширение `.gguf`

### Медленная генерация

- Уменьшите `--n-ctx`
- Увеличьте `--n-thread`
- Используйте GPU если доступно (`--n-gpu-layers`)
- Используйте квантованные модели (Q4_0, Q5_K_M)

### Недостаточно памяти

- Используйте меньшую модель
- Используйте более сильное квантование (Q3_K_S, Q4_0)
- Увеличьте виртуальную память

## Рекомендуемые модели

| Модель | Размер | Качество | Рекомендации |
|--------|--------|----------|--------------|
| Qwen-3.5-7B | ~5GB | Хорошее | Баланс скорости и качества |
| Llama-3-8B | ~5GB | Хорошее | Универсальная модель |
| Mistral-7B | ~4GB | Среднее | Быстрая, хорошая для диалогов |
| Phi-3-mini | ~2GB | Среднее | Очень быстрая, мало ресурсов |

## Полезные ссылки

- [llama.cpp GitHub](https://github.com/ggerganov/llama.cpp)
- [HuggingFace - Модели GGUF](https://huggingface.co/models?sort=trending&search=gguf)
- [TheBloke - Квантованные модели](https://huggingface.co/TheBloke)
