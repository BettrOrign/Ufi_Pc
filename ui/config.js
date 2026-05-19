const API_KEY = window.__GEMINI_API_KEY__ || "";
const MODEL = "models/gemini-2.5-flash-native-audio-latest";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const DEFAULT_SYSTEM_PROMPT = `Ты — Ufi, дружелюбный AI-ассистент.
Говори на русском языке. Будь естественным и дружелюбным. Отвечай коротко и по делу.

ВАЖНЕЙШЕЕ ПРАВИЛО: НИКОГДА НЕ ОТВЕЧАЙ ИЗ СВОИХ ЗНАНИЙ!
ВСЕГДА ИЩИ В ИНТЕРНЕТЕ.

============================================
systemCommand — ТОЛЬКО ТЕКСТОВЫЙ ПОИСК И КОМАНДЫ
============================================

Через systemCommand делай ТОЛЬКО следующее:
1. Поиск информации (Wikipedia API, DuckDuckGo API):
   - Ищи НА АНГЛИЙСКОМ ЯЗЫКЕ. Пробелы заменяй на +.
   - Wikipedia: curl -sL "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD&format=json&srlimit=5&origin=*"
   - DuckDuckGo: curl -sL "https://api.duckduckgo.com/?q=KEYWORD&format=json&no_html=1&skip_disambig=1"
2. Файловые операции (cat, ls, node script.js)
3. Запуск приложений (Telegram, kitty, nautilus)

============================================
mastraAgent — БРАУЗЕР, КОД, ПОГОДА, TELEGRAM
============================================

У тебя есть mastraAgent. Он вызывает агентов, у которых есть инструменты.
НЕ пытайся делать браузерные штуки через systemCommand — это сломается.

КОГДА КАКОГО АГЕНТА ИСПОЛЬЗОВАТЬ:
  ➜ Открыть сайт / посмотреть видео / нажать кнопку
    → browser-agent (у него есть браузер)
  ➜ Написать код / создать файл / сделать расчёты
    → qwen-agent (у него есть инструменты для кода)
  ➜ Погода
    → weather-agent
  ➜ ВСЁ ЧТО СВЯЗАНО С TELEGRAM (найти контакт, отправить сообщение, проверить контакт)
    → qwen-agent — скажи ему на русском что нужно сделать

ВАЖНО: qwen-agent умеет работать с Telegram API — искать контакты по имени,
отправлять сообщения любому контакту, писать в Избранные. Просто скажи ему что делать.

ПОМНИ: у browser-agent есть свой видимый браузер (Chromium).
Если browser-agent вернул ошибку — попробуй ещё раз, но с другим описанием.


============================================
TELEGRAM — КАК РАБОТАТЬ
============================================
Любые действия в Telegram делаются через mastraAgent с qwen-agent.
НЕ пытайся открыть Telegram через браузер или systemCommand (кроме запуска приложения).

ЧТО ДЕЛАТЬ:
  ➜ "найди контакт [имя]" или "есть ли контакт [имя]"
    → mastraAgent({ agentId: "qwen-agent", task: "найди в телеграме контакт [имя]" })
  ➜ "напиши [кому] [текст]" (даже если пользователь не сказал "телеграм")
    → mastraAgent({ agentId: "qwen-agent", task: "отправь в телеграм контакту [кому]: [текст]" })
  ➜ "напиши привет в избранные"
    → mastraAgent({ agentId: "qwen-agent", task: "отправь в телеграм: привет" })
  ➜ "открой телеграм" / "запусти телеграм" (именно открыть приложение)
    → systemCommand({ command: "Telegram", args: [], background: true })
  ➜ "открой телеграм веб" (только если пользователь явно попросил веб)
    → mastraAgent({ agentId: "browser-agent", task: "открой web.telegram.org" })

ВАЖНО: Если пользователь просит что-то связанное с контактами или отправкой
сообщений — ДУМАЙ про Telegram. Например "напиши Ане привет" → это Telegram.

============================================
ПОКАЗ ИЗОБРАЖЕНИЙ
============================================
Если пользователь просит показать картинку:
1. Сначала найди URL картинки в интернете (Google картинки, Wikipedia и т.д.)
2. Потом покажи через showImage
3. Скажи откуда картинка

============================================
SCREEN SHARE
============================================
Если пользователь говорит "посмотри на экран" — используй toggleScreenShare.

============================================
ПРАВИЛА ОБЩЕНИЯ:
============================================
1. СНАЧАЛА ПОДТВЕРДИ: Когда пользователь что-то просит, сначала коротко ответь
   ("Хорошо, сейчас проверю..."), ПОТОМ используй инструмент.
2. РЕЗЮМИРУЙ: Покажи результат ПОЛНОСТЬЮ. Только нужную информацию, коротко.
3. ИСТОЧНИКИ: Называй источник информации (Wikipedia, файл, API).
4. БУДЬ ЕСТЕСТВЕННЫМ: Пользователь может сказать "зайди на ютуб и нажми вот эту кнопку" —
   ты поймёшь. Команда не обязана быть точной.

ОТВЕЧАЙ:
  - Коротко и по делу (2-3 предложения)
  - Называй источник
  - В <speak> голосовая версия (1-2 предложения)`;

export const config = { API_KEY, WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [{ functionDeclarations: [
  { name: 'systemCommand', description: '⚠️ Execute TEXT-BASED searches (Wikipedia API, DuckDuckGo API), file operations (cat, ls, node), and launch desktop apps (Telegram, kitty). ⛔ NEVER use for browser/website tasks — no chromium/xdg-open, no curl to HTML pages. For websites (opening sites, clicking, video, music) you MUST use mastraAgent with agentId="browser-agent".', parameters: { type: 'object', properties: { command: { type: 'string', description: 'EXACT binary/program name only. Example: "node", "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.' }, args: { type: 'array', items: { type: 'string' }, description: 'Array of arguments for the command, each as a separate string. Example: for "node browser-read.mjs URL", use command="node", args=["browser-read.mjs","URL"]. NEVER repeat the command name as first arg.' }, background: { type: 'boolean', description: 'Run in background (for launching apps like Telegram)' } }, required: ['command'] } },
  { name: 'mastraAgent', description: '*** CRITICAL: You MUST delegate browser tasks! *** Use for: (1) ALL browser/website tasks → "browser-agent", (2) writing code → "qwen-agent", (3) weather → "weather-agent", (4) Telegram (search contacts, send messages) → "qwen-agent", (5) complex analysis → "qwen-agent". ⚠️ browser-agent is the ONLY way to interact with websites.', parameters: { type: 'object', properties: { agentId: { type: 'string', enum: ['qwen-agent', 'weather-agent', 'browser-agent'], description: 'qwen-agent=general, weather-agent=weather, browser-agent=browser control' }, task: { type: 'string', description: 'Описание задачи на русском. Можно естественным языком.' } }, required: ['agentId', 'task'] } },
  { name: 'toggleScreenShare', description: 'Start or stop screen sharing. Use when user says "ekranga qara" or "screen share".', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop'], description: '"start" or "stop"' } }, required: ['action'] } },
  { name: 'showImage', description: 'Display an image in the chat. Use when user asks to see a photo or image. FIRST find the image URL from internet (Google images, Wikipedia), THEN use this tool. Source can be a URL (https://...) or local path.', parameters: { type: 'object', properties: { source: { type: 'string', description: 'Image URL or local file path' } }, required: ['source'] } },
] }];

export const VOICES = [
  { name: 'Charon', desc: 'Informative' },
  { name: 'Puck', desc: 'Upbeat' },
  { name: 'Zephyr', desc: 'Bright' },
  { name: 'Aeolus', desc: 'Breezy' },
  { name: 'Kore', desc: 'Firm' },
  { name: 'Orus', desc: 'Firm' },
  { name: 'Autonoe', desc: 'Bright' },
  { name: 'Umbriel', desc: 'Easy-going' },
  { name: 'Erinome', desc: 'Clear' },
  { name: 'Laomedeia', desc: 'Upbeat' },
  { name: 'Schedar', desc: 'Even' },
  { name: 'Achird', desc: 'Friendly' },
  { name: 'Sadachbia', desc: 'Lively' },
  { name: 'Fenrir', desc: 'Excitable' },
  { name: 'Aoede', desc: 'Breezy' },
  { name: 'Enceladus', desc: 'Breathy' },
  { name: 'Algieba', desc: 'Smooth' },
  { name: 'Algenib', desc: 'Gravelly' },
  { name: 'Achernar', desc: 'Soft' },
  { name: 'Gacrux', desc: 'Mature' },
  { name: 'Zubenelgenubi', desc: 'Casual' },
  { name: 'Sadaltager', desc: 'Knowledgeable' },
  { name: 'Leda', desc: 'Youthful' },
  { name: 'Callirrhoe', desc: 'Easy-going' },
  { name: 'Iapetus', desc: 'Clear' },
  { name: 'Despina', desc: 'Smooth' },
  { name: 'Rasalgethi', desc: 'Informative' },
  { name: 'Alnilam', desc: 'Firm' },
  { name: 'Pulcherrima', desc: 'Forward' },
  { name: 'Vindemiatrix', desc: 'Gentle' },
  { name: 'Sulafat', desc: 'Warm' },
];

export function getSettings() {
  try {
    const saved = localStorage.getItem('ufi_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // If saved prompt is old version (missing Telegram section), replace with current default
      if (!parsed.systemPrompt?.includes('TELEGRAM — КАК РАБОТАТЬ')) {
        parsed.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      }
      return parsed;
    }
  } catch {}
  return { voiceName: 'Charon', systemPrompt: DEFAULT_SYSTEM_PROMPT, coreTheme: 'nebula', coreSpeed: 1.0, coreSensitivity: 1.0, coreHue: 0 };
}

export function saveSettings(settings) {
  localStorage.setItem('ufi_settings', JSON.stringify(settings));
}

export const CORE_THEMES = {
  nebula: {
    name: 'Purple Nebula', desc: 'Standart binafsha-cyan',
    shellH: [280,270,255,240,220], shellLt: [70,62,55,50,45],
    ringH: [280,220,320,300], hueOff: 0,
    agentCol: '34,211,238', userCol: '236,72,153',
    idleR:230, idleG:215, idleB:255,
  },
  solar: {
    name: 'Solar Flare', desc: 'Issiq to\'q sariq-qizil',
    shellH: [35,28,20,12,5], shellLt: [72,65,58,52,48],
    ringH: [35,5,350,20], hueOff: -40,
    agentCol: '251,191,36', userCol: '239,68,68',
    idleR:255, idleG:180, idleB:100,
  },
  aurora: {
    name: 'Aurora', desc: 'Yashil-havo rang-ko\'k',
    shellH: [175,168,160,153,146], shellLt: [70,62,55,50,45],
    ringH: [175,155,185,145], hueOff: -80,
    agentCol: '34,211,238', userCol: '52,211,153',
    idleR:200, idleG:255, idleB:230,
  },
  neon: {
    name: 'Neon Pulse', desc: 'Qizg\'ish pushti-magenta-cyan',
    shellH: [335,325,315,305,295], shellLt: [72,65,58,52,48],
    ringH: [335,305,345,285], hueOff: 40,
    agentCol: '34,211,238', userCol: '236,72,153',
    idleR:255, idleG:200, idleB:240,
  },
  ocean: {
    name: 'Deep Ocean', desc: 'To\'q ko\'k-cyan- oq',
    shellH: [222,216,210,204,198], shellLt: [68,60,53,48,43],
    ringH: [222,202,232,192], hueOff: -50,
    agentCol: '56,189,248', userCol: '99,102,241',
    idleR:180, idleG:210, idleB:255,
  },
};
