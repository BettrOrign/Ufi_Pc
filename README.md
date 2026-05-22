# Ufi — Мультимодальный голосовой AI-ассистент

**Ufi** — это AI-ассистент с веб-интерфейсом, голосовым вводом/выводом, интеграцией с Telegram, браузером и глубоким поиском в интернете.

Стек: **Gemini** (основной AI), **Mastra** (фреймворк агентов), **Qwen3-32B** (агент инструментов), собственный Core-сервер на Node.js.

---

## Архитектура

```
                  ┌──────────────────────┐
                  │   Веб-интерфейс       │
                  │  (ui/interface/)      │
                  │  HTML + CSS + JS      │
                  └──────────┬───────────┘
                             │ WebSocket
                             ▼
                  ┌──────────────────────┐
                  │  Gemini API          │
                  │  (BidiGenerate)      │
                  └──────────┬───────────┘
                             │ Tool Calls
                             ▼
                  ┌──────────────────────┐
   HTTP ─────────►│   Core Server :3000  │◄────── WebSocket (UI)
                  │  (src/core/)         │
                  └──┬───────┬───────────┘
                     │       │
            ┌────────┘       └──────────┐
            ▼                            ▼
   ┌──────────────────┐      ┌──────────────────┐
   │ Mastra :4111      │      │ Fast Path         │
   │ (агент Ufi/Qwen) │      │ (intent-router)    │
   │ инструменты       │      │ media/browse/....  │
   └──────────────────┘      └──────────────────┘
```

### Основные компоненты

| Компонент | Описание |
|-----------|----------|
| **Gemini API** | Основной диалоговый AI. Передаёт текстовые/аудио-сообщения, обрабатывает tool calls через веб-интерфейс |
| **Core Server** (src/core/index.mjs) | HTTP + WebSocket сервер на порту 3000. Прокси Gemini, выполняет REST API, раздаёт статику |
| **Mastra Agent** (src/mastra/agents/agent.ts) | Агент Ufi на Qwen3-32B (Groq). Исполняет инструменты по запросу Gemini |
| **Oscar Agent** (src/mastra/agents/oscar.ts) | Агент глубокого поиска. Собирает информацию через webSearch + browserRead |
| **Telegram Client** (src/tools/telegram-client.mjs) | MTProto клиент (GramJS) для отправки/чтения сообщений |
| **Browser Controller** (src/tools/browser-fast.mjs) | Puppeteer (Chromium) для навигации и YouTube |

---

## Структура проекта

```
ufi/
├── serve-ui.mjs                    # Точка входа (запуск Core сервера)
├── package.json
├── tsconfig.json
├── License/                        # MIT License + благодарности
├── README.md
│
├── src/
│   ├── core/
│   │   ├── index.mjs              # Core-сервер (1138 строк)
│   │   └── event-bus.mjs          # Pub/sub шина
│   │
│   ├── mastra/
│   │   ├── index.ts               # Mastra entry point (регистрация агентов)
│   │   ├── agents/
│   │   │   ├── agent.ts           # Ufi — главный агент (Qwen3-32B)
│   │   │   └── oscar.ts           # Oscar — агент глубокого поиска
│   │   └── tools/
│   │       ├── web-search-tool.ts       # DuckDuckGo поиск
│   │       ├── browser-read-tool.ts     # Чтение страниц (Chromium)
│   │       ├── system-command-tool.ts   # Выполнение команд (whitelist)
│   │       ├── write-file-tool.ts       # Запись файлов
│   │       ├── weather-tool.ts          # Погода (Open-Meteo)
│   │       ├── deepsearch.ts            # Обёртка Oscar для глубокого поиска
│   │       └── telegram-tool.ts         # 4 Telegram-инструмента
│   │
│   ├── tools/
│   │   ├── telegram-client.mjs    # GramJS Telegram клиент
│   │   ├── browser-fast.mjs       # Puppeteer контроллер
│   │   ├── intent-router.mjs      # Быстрый роутинг (keyword-based)
│   │   └── reminder-store.mjs     # CRUD напоминаний (JSON)
│   │
│   └── auth/
│       ├── auth-store.mjs         # Encrypted credential store (AES-256-CBC)
│       └── telegram-login.mjs     # Скрипт входа в Telegram
│
└── ui/
    ├── interface/                 # Веб-интерфейс
    │   ├── index.html
    │   ├── styles.css
    │   ├── app.js                 # Главный скрипт UI
    │   ├── chat.js                # Отрисовка сообщений
    │   ├── sidebar.js             # Боковая панель (сервисы)
    │   ├── dom.js                 # DOM-ссылки
    │   ├── markdown.js            # Рендер Markdown
    │   ├── ui-helpers.js          # Вспомогательные функции
    │   └── quick-actions.js       # Быстрые действия
    │
    ├── backend/                   # Связь с сервером
    │   ├── websocket.js           # WebSocket клиент + tool executor
    │   ├── config.js              # Gemini config + tools declarations
    │   └── state.js               # Состояние приложения
    │
    └── tools/                     # Браузерные инструменты
        ├── audio-capture.js       # Запись микрофона (AudioWorklet)
        ├── audio-playback.js      # Воспроизведение звука
        ├── pcm-processor.js       # AudioWorkletProcessor (PCM 16kHz)
        └── screen-capture.js      # Захват экрана
```

---

## Требования

- **Node.js >= 22.13.0**
- **Chromium** (для Puppeteer)
- **Микрофон** (для голосового ввода)
- **API ключи** (см. ниже)

---

## Быстрый старт

```bash
# 1. Клонировать
git clone <url>
cd ufi

# 2. Установить зависимости
npm install

# 3. Создать .env из шаблона
cp .env.example .env
# Заполните API ключи

# 4. Запустить в режиме разработки
npm run dev
```

После запуска откройте **http://localhost:3000**.

---

## Переменные окружения (.env)

| Переменная | Описание | Где взять |
|-----------|----------|-----------|
| `GEMINI_API_KEY` | Gemini API ключ | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GROQ_API_KEY` | Groq API (Qwen) | [Groq Console](https://console.groq.com) |
| `OPENCODE_API_KEY` | OpenCode API (Oscar) | [OpenCode](https://opencode.ai) |
| `OPENROUTER_API_KEY` | OpenRouter (запасной) | [OpenRouter](https://openrouter.ai) |
| `TELEGRAM_API_ID` | Telegram API ID | [my.telegram.org](https://my.telegram.org) |
| `TELEGRAM_API_HASH` | Telegram API Hash | [my.telegram.org](https://my.telegram.org) |

---

## Режимы запуска

```bash
# Разработка (Core + Mastra одновременно)
npm run dev

# Только Mastra Studio (порт 4111)
npm run dev:mastra

# Только UI/Core (порт 3000)
npm run dev:ui

# Сборка Mastra
npm run build

# Production-запуск Mastra
npm start

# Electron Desktop (экспериментально)
npm run electron:dev
```

---

## Как это работает

### Диалог (Voice/Text)

1. Пользователь говорит или печатает в веб-интерфейсе
2. Аудио/текст отправляется через WebSocket в **Gemini API**
3. Gemini возвращает ответ (текст + аудио) и/или **tool calls**
4. Tool calls перехватываются на фронтенде и отправляются в **Core Server**
5. Core Server либо обрабатывает сам (fast path), либо проксирует в **Mastra Agent**
6. Результат возвращается Gemini для финального ответа

### Fast Path (быстрый роутинг)

Некоторые команды обрабатываются без участия Mastra:
- **Медиа**: play/pause/volume (playerctl)
- **Погода**: запрос к Open-Meteo API
- **Telegram**: отправка/поиск сообщений напрямую
- **Браузер**: YouTube поиск и воспроизведение

---

## Как добавить новый инструмент

1. **Создайте файл инструмента** в `src/mastra/tools/`:
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const myTool = createTool({
  id: 'myTool',
  description: 'Что делает инструмент',
  inputSchema: z.object({
    param: z.string().describe('Параметр'),
  }),
  execute: async ({ context }) => {
    // логика
    return { result: '...' };
  },
});
```

2. **Зарегистрируйте** в агенте `src/mastra/agents/agent.ts`:
```typescript
import { myTool } from '../tools/my-tool';
// Добавьте myTool в поле tools: { ... } в new Agent({...})
```

3. **Задекларируйте** для Gemini в `ui/backend/config.js` (раздел `tools`):
```javascript
tools.push({
  functionDeclarations: [{
    name: 'myTool',
    description: '...',
    parameters: { type: 'OBJECT', properties: { param: { type: 'STRING' } } }
  }]
});
```

4. **Добавьте обработчик** в `ui/backend/websocket.js` (раздел tool dispatch).

---

## Обслуживаемые сервисы (Service Heartbeat)

Core Server мониторит 4 сервиса с интервалом 30 секунд:

| Сервис | Проверка | Автовосстановление |
|--------|----------|-------------------|
| **Mastra** | `GET http://localhost:4111` | `npm run dev:mastra` (до 3 попыток) |
| **Telegram** | Ping MTProto клиента | — |
| **Browser** | Проверка WebSocket endpoint | — |
| **Gemini** | Проверка API ключа | — |

---

## Безопасность

- API ключи хранятся в **AES-256-CBC** зашифрованном хранилище (`~/.config/ufi/`)
- Команды терминала — **белый список** (30+ команд), запрещены `sudo`, `dd`, `mkfs`, `passwd`, shell-инъекции
- Telegram сессия сохраняется локально (`.telegram-session`)
- **Не коммитьте `.env` с реальными ключами**

---

## Модификация и улучшение

### Типовые сценарии

- **Добавить новый API endpoint** → `src/core/index.mjs` (секция `handleRequest`)
- **Изменить поведение агента** → `src/mastra/agents/agent.ts` (поле `instructions`)
- **Добавить голосовую модель** → `ui/backend/config.js` (массив `voices`)
- **Сменить тему** → `ui/interface/styles.css` (CSS-переменные)

### Важные замечания

- Mastra агент **stateless** — без памяти. Вся история диалога хранится у Gemini
- TypeScript компилируется через Mastra bundler, не через `tsc` напрямую
- Core-сервер — monolithic (1138 строк), планируется рефакторинг
- Для проверки TypeScript: `npx tsc --noEmit`

---

## Лицензия

MIT — подробнее в [License/LICENSE](License/LICENSE).

Благодарности — в [License/CREDITS.md](License/CREDITS.md).
