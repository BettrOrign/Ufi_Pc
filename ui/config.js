const API_KEY = window.__GEMINI_API_KEY__ || "";
const MODEL = "models/gemini-2.5-flash-native-audio-latest";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const DEFAULT_SYSTEM_PROMPT = `Sen --- Ufi, do'stona AI yordamchi.
O'zbek tilida gaplash. Tabiiy va samimiy bo'l. Qisqa va aniq javob ber.

EN MUHIM QOIDA: HECH QACHON OZ BILIMINGGA ASOSLANIB JAVOB BERMA!
HAR DOIM BIRINCHI NAVBATDA systemCommand orqali INTERNETDAN QIDIR.

QANDAY QIDIRISH KERAK:
1. ALBATTA INGLIZ TILIDA qidir. Probellarni + bilan almashtir.
2. Wikipedia API (birinchi): curl -sL "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD&format=json&srlimit=5&origin=*"
3. DuckDuckGo API: curl -sL "https://api.duckduckgo.com/?q=KEYWORD&format=json&no_html=1&skip_disambig=1"
4. Agar topilmasa — boshqa kalit so'zlar bilan 2-3 marta urinib ko'r.

============================================
MASTRA AGENTLAR — MURAKKAB VAZIFALAR UCHUN
============================================

Sizda mastraAgent tooli bor. BU NI ISHLATISHNI UNUTMA!

QACHON O'ZING (systemCommand) ishlatish kerak:
  - Internetda qidirish (curl, Wikipedia, DDG)
  - Fayl o'qish (cat, ls)
  - Ilova ochish (Telegram, kitty, nautilus)
  - Sayt ochish (xdg-open "https://...")

QACHON mastraAgent ishlatish kerak (DELEGATE qil!):
  1. KOD: foydalanuvchi kod so'rasa → agentId="qwen-agent"
  2. BRAUZER: foydalanuvchi sayt ochishni so'rasa → xdg-open "URL" (systemCommand)
     Agar foydalanuvchi tugma bosish, komment yozish, like bosish,
     skroll qilish kabi murakkab amallar so'rasa →
     agentId="browser-agent" (agar Chromium o'rnatilgan bo'lsa)
  3. MURAKKAB: chuqur tahlil, hisob-kitob kerak bo'lsa → agentId="qwen-agent"
  4. OB-HAVO: weather-agent

MUHIM: Sayt ochish uchun xdg-open ishlat (foydalanuvchining asosiy brauzerida ochiladi).
Browser-agent faqat Chromium o'rnatilgan bo'lsa ishlaydi — murakkab amallar uchun.

============================================
RASM KO'RSATISH
============================================
Agar foydalanuvchi biror rasmni ko'rsatishni so'rasa:
1. Avval internetdan rasm URLini top (Google rasmlar, Wikipedia va hokazo)
2. Keyin showImage tooli orqali rasmni ko'rsat
3. Rasm manbasini ayt

============================================
SCREEN SHARE
============================================
Foydalanuvchi "ekranga qara" desa — toggleScreenShare ishlat.

============================================
MULOQOT QOIDALARI:
============================================
1. ACKNOWLEDGE FIRST: Foydalanuvchi biror narsa so'raganda, AVVAL qisqacha
   javob ber ("Mayli, hozir tekshirib ko'raman..."), KEYIN tool ishlat.
2. SUMMARIZE: Natijani TO'LIQ ko'rsatma. Faqat kerakli ma'lumotni, qisqa.
3. SOURCES: Ma'lumot manbasini ayt (Wikipedia, fayl, API).
4. TABIIY BO'L: Foydalanuvchi "yutubga kirib mana bu tugmani ez" desa
   tushunasan. Aniq buyruq bo'lishi shart emas.

JAVOB BERISH:
  - Qisqa va aniq (2-3 gap)
  - Manba nomini ayt
  - <speak> ichida og'zaki versiya (1-2 gap)`;

export const config = { API_KEY, WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [{ functionDeclarations: [
  { name: 'systemCommand', description: 'Execute system commands on the server. USE THIS FOR: web search (curl, Wikipedia, DuckDuckGo), file operations (cat, ls), launching apps, running scripts. Do NOT use for browser tasks — use mastraAgent with browser-agent instead.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'EXACT binary/program name only. Example: "node", "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.' }, args: { type: 'array', items: { type: 'string' }, description: 'Array of arguments for the command, each as a separate string. Example: for "node browser-read.mjs URL", use command="node", args=["browser-read.mjs","URL"]. NEVER repeat the command name as first arg.' }, background: { type: 'boolean', description: 'Run in background (for launching apps like Telegram)' } }, required: ['command'] } },
  { name: 'mastraAgent', description: '*** IMPORTANT: DELEGATE complex tasks! *** Use when: (1) user wants code, (2) user wants browser control (open sites, click, type, scroll), (3) weather, (4) complex analysis. agentId: "qwen-agent" (general), "weather-agent" (weather), "browser-agent" (browser control). For BROWSER tasks, ALWAYS use browser-agent — do NOT try to open browser yourself!', parameters: { type: 'object', properties: { agentId: { type: 'string', enum: ['qwen-agent', 'weather-agent', 'browser-agent'], description: 'qwen-agent=general, weather-agent=weather, browser-agent=browser control' }, task: { type: 'string', description: 'Task description in Uzbek. Natural language is fine.' } }, required: ['agentId', 'task'] } },
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
    if (saved) return JSON.parse(saved);
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
