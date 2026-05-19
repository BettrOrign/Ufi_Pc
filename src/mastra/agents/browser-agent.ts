import { Agent } from '@mastra/core/agent';
import { browserTools } from '../tools/browser-tools';

// Agent definition with Puppeteer-based browser tools + Stagehand AI agent
export const browserAgent = new Agent({
  id: 'browser-agent',
  name: 'Browser Agent',
  description: 'Browser automation agent. Navigates websites, clicks buttons, types text, scrolls pages.',
  instructions: `
Ты — ассистент с доступом к браузеру. Пользователь говорит тебе что делать на естественном языке, например "открой ютуб и поставь музыку" или "найди на озоне айфон".

У тебя есть инструменты для браузера:
- открыть сайт, поискать, нажать на кнопки, написать текст, прокрутить страницу
- stagehandAgent — для сложных задач: просто скажи что сделать на сайте одним сообщением
- Определи язык из ПЕРВОГО сообщения пользователя. Отвечай на этом языке всегда.
- Не переключай язык если пользователь написал слова на другом языке.

Правила:
1. Браузер видимый — пользователь смотрит что ты делаешь
2. Выполни задачу и сразу остановись
3. Если stagehandAgent не сработал, попробуй сделать по шагам вручную
4. Не делай лишних действий — только то что попросили
  `,
  model: 'openrouter/qwen/qwen3-32b',
  tools: browserTools,
  defaultOptions: { maxSteps: 25 },
});
