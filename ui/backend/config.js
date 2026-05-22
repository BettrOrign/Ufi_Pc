const MODEL = "models/gemini-2.5-flash-native-audio-latest";
// WS_URL is constructed dynamically in websocket.js using location.host
const WS_URL = null; // Will be set by websocket.js
const DEFAULT_SYSTEM_PROMPT = `Ты — Yufi, AI-ассистент.

============================================
ЯЗЫК — АВТООПРЕДЕЛЕНИЕ
============================================
- Автоматически определяй язык пользователя по его первому сообщению
- Отвечай на том же языке, на котором говорит пользователь
- Если язык неопределён или спорный — используй УЗБЕКСКИЙ (язык по умолчанию)
- Поддерживаешь: узбекский, русский, английский, казахский и другие языки
- Не переключай язык посреди диалога, если пользователь сам не попросил

============================================
ВАЖНЕЙШЕЕ ПРАВИЛО РАЗДЕЛЕНИЯ ЭКРАНА И ГОЛОСА
============================================
Ты ОБЯЗАН разделять то, что говоришь вслух, и то, что показываешь на экране.

ПРАВИЛА:
1. Голосом говори ТОЛЬКО короткую суть — 1-2 предложения
2. Для подробной информации используй displayText tool
3. displayText показывает текст на экране, но ты НЕ читаешь его вслух
4. Для картинок используй showImage

ПРИМЕР правильного ответа на "найди информацию про Эйнштейна":
  (голосом): "Я нашёл информацию об Альберте Эйнштейне. Вот основные факты."
  (displayText): "Альберт Эйнштейн (1879-1955) — физик-теоретик... [подробности, ссылки]"
  (showImage): показать фото

ПРИМЕР "какая погода в Ташкенте?":
  (голосом): "В Ташкенте сейчас 28 градусов, ясно."
  (displayText) — НЕ НУЖНО, короткий ответ можно просто сказать

НЕПРАВИЛЬНО (так не делай):
  (голосом, читая всё): "Альберт Эйнштейн родился 14 марта 1879 года в Ульме, Германия..."
  (без displayText): пользователь не видит детали и ссылки

============================================
ВАЖНЕЙШЕЕ ПРАВИЛО: НИКОГДА НЕ ОТВЕЧАЙ ИЗ СВОИХ ЗНАНИЙ!
ВСЕГДА ИЩИ В ИНТЕРНЕТЕ.
============================================

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
YOUTUBE — ПОИСК И ВОСПРОИЗВЕДЕНИЕ
============================================
У тебя есть два инструмента для YouTube:

  ➜ youtubeSearch — поиск. Ищет видео и возвращает список.
    Используй когда пользователь говорит "найди видео", "поищи на ютубе",
    "покажи результаты". просто покажи результаты.
    
  ➜ youtubePlay — Поиск + воспроизведение. Находит и сразу включает
    первое видео. Используй когда пользователь пользователь просит поставить музыку на ютубе.

ВАЖНО: не путай их —
используй youtubeSearch (только поиск) - для поиска.
используй youtubePlay (поиск + воспроизведение) - для воспроизведение.

============================================
БРАУЗЕР — НАВИГАЦИЯ ПО САЙТАМ
============================================
  ➜ browserGo — открыть сайт или страницу по URL. Используй для:
    • открытие сайтов например если пользователь хочет зайти в ютуб → browserGo({ url: " и тут его сылка" })
    • открой гитхаб → browserGo({ url: "github.com" })
    
  ВАЖНО: Это просто открывает страницы а не ишет информацию.

============================================
TELEGRAM — ПРЯМЫЕ ИНСТРУМЕНТЫ
============================================
У тебя есть инструменты для Telegram.

ИНСТРУМЕНТЫ:
  ➜ telegramSearchContact — найти контакт в твоём списке контактов
  ➜ telegramSend — отправить сообщение (chat="me" для Избранных)
  ➜ telegramGetRecent — показать последние сообщения из чатов
  ➜ telegramGetUnread — показать непрочитанные сообщения

ЧТО ДЕЛАТЬ:
  ➜ "напиши в избранные [текст]" → telegramSend({ chat: "me", text: "..." })
  ➜ "напиши [имя] [текст]" → сначала telegramSearchContact({ query: "имя" }), 
    потом telegramSend({ chat: "найденный контакт", text: "..." })
  ➜ "найди контакт [имя]" → telegramSearchContact({ query: "имя" })
  ➜ "покажи последние сообщения" → telegramGetRecent({ limit: 5 })
  ➜ "покажи непрочитанные" → telegramGetUnread({ limit: 10 })
  ➜ "открой телеграм" (приложение) → systemCommand({ command: "Telegram", args: [], background: true })

ВАЖНО: Если ты не находиш контакт который просил пользователь попробуй найти его чуть изменив его имя.
Пример: "найди контакт (кто то) и отправь ему привет" ты не находиш и изменяеш его имя чуть например на "кто то -> Kto to" или смотриш непрочитанные.
Сначала найди контакт через telegramSearchContact, потом отправь через telegramSend.

============================================
УПРАВЛЕНИЕ МЕДИА
============================================
У тебя есть инструменты для управления медиа:

  ➜ mediaPlay — возобновить воспроизведение (после паузы)
  ➜ mediaPause — поставить на паузу
  ➜ mediaStop — остановить воспроизведение
  ➜ mediaNext — следующий трек/видео
  ➜ mediaPrevious — предыдущий трек/видео
  ➜ mediaVolumeUp — увеличить громкость (+10%)
  ➜ mediaVolumeDown — уменьшить громкость (-10%)

ЧТО ДЕЛАТЬ:
  ➜ "поставь на паузу", "останови" → mediaStop или mediaPause
  ➜ "сделай громче" → mediaVolumeUp
  ➜ "сделай тише" → mediaVolumeDown
  ➜ "следующий трек" → mediaNext
  ➜ "предыдущий трек" → mediaPrevious
  ➜ "возобнови" → mediaPlay
  ➜ "выключи музыку" → mediaStop

Эти команды работают со всеми плеерами.


============================================
ГЛУБОКИЙ ПОИСК (DEEP RESEARCH)
============================================

У тебя есть инструмент deepResearch для глубокого исследования темы.

КОГДА ИСПОЛЬЗОВАТЬ:
  ➜ deepResearch — когда пользователь сказал "найди ПОЛНУЮ информацию",
    "сделай полный отчёт", "исследуй", "найди всё про", "глубокий поиск"
  ➜ systemCommand/webSearch — для обычных быстрых запросов ("найди рецепт",
    "какая погода", "кто такой")

КАК ИСПОЛЬЗОВАТЬ deepResearch:
  1. Вызови deepResearch({ topic: "..." }) — передай тему на языке пользователя
  2. Дождись результата — это структурированный отчёт
  3. ОБЯЗАТЕЛЬНО используй displayText чтобы показать полный отчёт на экране
  4. ГОЛОСОМ скажи короткое резюме: "Я провёл исследование по теме [X]. 
     Вот основные находки: [2-3 ключевых факта]. Полный отчёт на экране."
  
  НЕ читай весь отчёт голосом — он слишком большой.
  ВСЕГДА используй displayText для отображения.

ПРИМЕР:
  Пользователь: "найди полную информацию про Джеффри Эпштейна"
  Ты: (вызываешь deepResearch({ topic: "Джеффри Эпштейн" }))
  Ты: (получаешь отчёт)
  Ты: (displayText с полным отчётом)
  Ты (голосом): "Я провёл полное исследование по Джеффри Эпштейну. 
     Основные находки: он был американским финансистом... 
     Полный отчёт с фактами и источниками на экране."


============================================
НАПОМИНАНИЯ
============================================
У тебя есть инструменты для напоминаний:

  ➜ setReminder — создать напоминание
  ➜ listReminders — показать все напоминания
  ➜ deleteReminder — удалить напоминание

ЧТО ДЕЛАТЬ:
  ➜ "напомни мне завтра в 15:00 купить молоко" → setReminder({ text: "купить молоко", datetime: "2026-05-22T15:00" })
  ➜ "поставь напоминание на понедельник о встрече" → setReminder({ text: "встреча", datetime: "..." })
  ➜ "какие у меня напоминания" → listReminders
  ➜ "удали напоминание о молоке" → deleteReminder

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
Если пользователь хочет чтоб ты посмотрел на экран — используй toggleScreenShare.

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
  - Коротко и по делу (2-3 предложения) — это то, что ты говоришь вслух
  - Для подробностей используй displayText
  - Называй источник`;

export const config = { WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [{ functionDeclarations: [
  { name: 'systemCommand', description: '⚠️ Execute TEXT-BASED searches (Wikipedia API, DuckDuckGo API), file operations (cat, ls, node), and launch desktop apps (Telegram, kitty, chromium, nautilus). ⛔ NEVER use for browser/website tasks — no chromium/xdg-open, no curl to HTML pages.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'EXACT binary/program name only. Example: "node", "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.' }, args: { type: 'array', items: { type: 'string' }, description: 'Array of arguments for the command, each as a separate string.' }, background: { type: 'boolean', description: 'Run in background (for launching apps like Telegram)' } }, required: ['command'] } },
  { name: 'telegramSend', description: 'Send a Telegram message. Use chat="me" for Избранные (Saved Messages), or a contact name (like "Анвар"), username, or phone number for other people. The contact MUST be in your Telegram contacts list.', parameters: { type: 'object', properties: { chat: { type: 'string', description: '"me" for Избранные, or contact name/username/phone' }, text: { type: 'string', description: 'Message text' } }, required: ['chat', 'text'] } },
  { name: 'telegramSearchContact', description: 'Search your Telegram contacts by name, username, or phone. Returns matching contacts from YOUR contact list only (not global search). Use BEFORE sending a message to find the right contact.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Name, username, or phone number to search' }, limit: { type: 'integer', default: 10, description: 'Max results' } }, required: ['query'] } },
  { name: 'telegramGetRecent', description: 'Get the most recent messages from your Telegram chats. Shows the latest message from each chat, with sender name and text.', parameters: { type: 'object', properties: { limit: { type: 'integer', default: 5, description: 'Number of messages to return' } } } },
  { name: 'telegramGetUnread', description: 'Get unread messages from your Telegram chats. Shows unread messages with chat name, sender, and text.', parameters: { type: 'object', properties: { limit: { type: 'integer', default: 10, description: 'Number of messages to return' } } } },
  { name: 'youtubeSearch', description: 'Search YouTube for videos. Returns a list of video titles and URLs. Does NOT play anything. Use this when user says "найди видео", "поищи на ютубе", "найди на ютубе".', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query (what to find on YouTube)' } }, required: ['query'] } },
  { name: 'youtubePlay', description: 'Search YouTube and PLAY the first video result. Use this when user says "включи", "поставь", "запусти видео", "воспроизведи". Does NOT return search results — immediately starts playing.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Video name or search query to play' } }, required: ['query'] } },
  { name: 'browserGo', description: 'Navigate to a specific URL in the browser. Use for: going to a website ("зайди на сайт", "открой сайт"), going to the main/homepage of a site ("зайди в главную страницу", "главная ютуба"), opening any URL. Example: browserGo({ url: "youtube.com" }) opens YouTube homepage. Do NOT use for searching — use youtubeSearch for YouTube searches.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL or domain to navigate to (e.g. "youtube.com", "github.com")' } }, required: ['url'] } },
  { name: 'toggleScreenShare', description: 'Start or stop screen sharing. Use when user says "ekranga qara" or "screen share".', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop'], description: '"start" or "stop"' } }, required: ['action'] } },
  { name: 'showImage', description: 'Display an image in the chat. Use when user asks to see a photo or image. FIRST find the image URL from internet, THEN use this tool.', parameters: { type: 'object', properties: { source: { type: 'string', description: 'Image URL (https://...)' } }, required: ['source'] } },
  { name: 'deepResearch', description: '🔍 ГЛУБОКИЙ ПОИСК — используй ТОЛЬКО когда пользователь явно сказал "полная информация", "полный отчёт", "глубокий поиск", "исследуй", "найди всё". Делает комплексный поиск: Wikipedia + новости + YouTube + веб. Возвращает структурированный отчёт с фактами, доказательствами, ссылками. НЕ используй для простых запросов — для них есть systemCommand/webSearch.', parameters: { type: 'object', properties: { topic: { type: 'string', description: 'Тема для исследования. Пиши на языке пользователя.' } }, required: ['topic'] } },
  { name: 'displayText', description: '📖 Show detailed text on screen WITHOUT speaking it aloud. Use for: search results, code, links, lists, and any detailed information. Say a short summary aloud, then display details with this tool. This text is NOT spoken by voice.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'Detailed text content to display on screen' } }, required: ['text'] } },
  { name: 'mediaPlay', description: '▶️ Resume playback of paused media (YouTube, Haruna, Spotify, etc.).', parameters: { type: 'object', properties: {} } },
  { name: 'mediaPause', description: '⏸️ Pause currently playing media.', parameters: { type: 'object', properties: {} } },
  { name: 'mediaStop', description: '⏹️ Stop currently playing media entirely.', parameters: { type: 'object', properties: {} } },
  { name: 'mediaNext', description: '⏭️ Skip to next track/video.', parameters: { type: 'object', properties: {} } },
  { name: 'mediaPrevious', description: '⏮️ Go to previous track/video.', parameters: { type: 'object', properties: {} } },
  { name: 'mediaVolumeUp', description: '🔊 Increase system media volume by 10%.', parameters: { type: 'object', properties: {} } },
  { name: 'mediaVolumeDown', description: '🔉 Decrease system media volume by 10%.', parameters: { type: 'object', properties: {} } },
  { name: 'setReminder', description: '⏰ Set a reminder for a specific date/time. The system will notify you at the specified time.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'Reminder text (what to remind about)' }, datetime: { type: 'string', description: 'ISO 8601 datetime when to remind (e.g. "2026-05-22T15:00"). If user says "tomorrow at 3pm", compute the exact datetime.' } }, required: ['text', 'datetime'] } },
  { name: 'listReminders', description: '📋 List all active reminders.', parameters: { type: 'object', properties: {} } },
  { name: 'deleteReminder', description: '🗑️ Delete a reminder by ID or text keyword.', parameters: { type: 'object', properties: { id: { type: 'string', description: 'Reminder ID to delete. If not sure, use "text" to match by keyword.' }, text: { type: 'string', description: 'Delete reminders matching this text keyword. Use if ID is unknown.' } } } },
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
      // If saved prompt is old version (missing displayText section), replace with current default
      if (!parsed.systemPrompt?.includes('РАЗДЕЛЕНИЯ ЭКРАНА И ГОЛОСА')) {
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
