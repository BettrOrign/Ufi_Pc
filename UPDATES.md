# UPDATES

## [2026-05-22] Oscar Deep Search Agent

### Что сделано
- Подключён **Oscar** (`deepsearch-agent`) — агент глубокого поиска на модели `opencode/big-pickle`
- Создан `deepSearchTool` — обёртка, которая вызывает Оскара как инструмент из Ufi
- Добавлена инструкция Ufi: для сложных тем использовать `deepSearch` вместо `webSearch`

### Как работает
```
User: "найди полную информацию про X"
  → Ufi (qwen-agent) видит сложную тему → вызывает deepSearchTool
    → Oscar agent получает задачу + maxSteps:12
      → 1+ раундов: webSearch → browserRead → анализ → webSearch → ...
    → Oscar возвращает структурированный отчёт с источниками
  → Ufi отдаёт результат пользователю
```

Оскар может быть вызван и напрямую через `POST /api/agents/deepsearch-agent/generate`.

### Что было сложного
- **Двойная роль Оскара**: и самостоятельный агент, и инструмент для Ufi. Нужно было избежать циклов и правильно настроить `maxSteps`
- **Stateless архитектура**: вся история в Gemini, каждый запуск Оскара — с чистого листа. Промпт должен быть самодостаточным
- **Структурированный ответ**: инструмент возвращает `{ report, sourceCount }`, чтобы Ufi знал, сколько источников было использовано

### Файлы
| Файл | Роль |
|------|------|
| `src/mastra/agents/oscar.ts` | Определение агента Оскар |
| `src/mastra/tools/deepsearch.ts` | DeepSearch tool — мост между Ufi и Оскаром |
| `src/mastra/index.ts` | Регистрация Оскара в Mastra |
| `src/mastra/agents/agent.ts` | Ufi агент с подключённым `deepSearch` инструментом |

## [2026-05-22] Theme System (7 тем)

### Что сделано
- Полностью переработана система тем интерфейса
- 7 тем: **Dark**, **Gloomy**, **Cosmic**, **Nature**, **Relaxing**, **Blood**, **Retro**
- Все CSS-переменные переключаются через `data-theme` на `<html>`
- Старые 5 тем (nebula/solar/aurora/neon/ocean) заменены на новые 7

### Как работает
```
Выбор темы в Settings → Core Theme
  → app.js: applyTheme("cosmic")
    → document.documentElement.dataset.theme = "cosmic"
      → CSS автоматически подхватывает [data-theme="cosmic"] блок
        → меняются: фон, текст, акценты, бордеры, сообщения, кнопки
    → state.coreTheme = "cosmic"
      → canvas (ядро) также переключает цвета через CORE_THEMES
  → Сохраняется в localStorage, восстанавливается при загрузке
```

### Что было сложного
- **Консолидация двух систем**: CSS :root переменные были статичны, CORE_THEMES жил отдельно только для canvas. Пришлось соединить их через `data-theme` атрибут
- **~30+ hardcoded rgba(0,240,255)** по всему CSS — заменены на `rgba(var(--accent-r), var(--accent-g), var(--accent-b), X)` через RGB-компоненты в переменных
- **Совместимость**: `:root, [data-theme="dark"]` как fallback — старый код без data-theme продолжает работать

### Файлы
| Файл | Роль |
|------|------|
| `ui/interface/styles.css` | 7 блоков `[data-theme="..."]` с полным набором CSS-переменных |
| `ui/backend/config.js` | `CORE_THEMES` — 7 тем с canvas-цветами |
| `ui/interface/index.html` | 7 кнопок в `.theme-grid` |
| `ui/interface/app.js` | `applyTheme()` + `data-theme` на `<html>` |
