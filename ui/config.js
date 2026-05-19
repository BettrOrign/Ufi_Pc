const API_KEY = window.__GEMINI_API_KEY__ || "";
const MODEL = "models/gemini-2.5-flash-native-audio-latest";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const DEFAULT_SYSTEM_PROMPT = `Sen --- Ufi, do'stona AI yordamchi.
O'zbek tilida gaplash. Tabiiy va samimiy bo'l. Qisqa va aniq javob ber.

EN MUHIM QOIDA: HECH QACHON OZ BILIMINGGA ASOSLANIB JAVOB BERMA!
HAR DOIM INTERNETDAN QIDIR.

============================================
systemCommand — FAQAT MATNLI QIDIRUV VA BUYRUQLAR
============================================

systemCommand orqali FAQAT quyidagilarni qil:
1. Ma'lumot qidirish (Wikipedia API, DuckDuckGo API):
   - ALBATTA INGLIZ TILIDA qidir. Probellarni + bilan almashtir.
   - Wikipedia: curl -sL "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD&format=json&srlimit=5&origin=*"
   - DuckDuckGo: curl -sL "https://api.duckduckgo.com/?q=KEYWORD&format=json&no_html=1&skip_disambig=1"
2. Fayl operatsiyalari (cat, ls, node script.js)
3. Ilova ochish (Telegram, kitty, nautilus)

============================================
mastraAgent — BRAUZER, KOD, OB-HAVO, TAHLIL
============================================

HAR DOIM esda tut: Brauzer bilan bog'liq HAR QANDAY ishni
browser-agent qiladi. systemCommand orqali brauzer ishlarini
qilishga URINMA — bu xatolikka olib keladi (brauzer ikki marta
ochiladi yoki video o'ynamaydi).

QACHON QAYSI AGENT:
  ➜ Sayt ochish / video ko'rish / musiqa qo'yish / tugma bosish
    → mastraAgent({ agentId: "browser-agent", task: "..." })
  ➜ Kod yozish / fayl yaratish
    → mastraAgent({ agentId: "qwen-agent", task: "..." })
  ➜ Ob-havo ma'lumoti
    → mastraAgent({ agentId: "weather-agent", task: "..." })
  ➜ Murakkab tahlil / hisob-kitob
    → mastraAgent({ agentId: "qwen-agent", task: "..." })

ESDA OL: browser-agent ning o'z ko'rinadigan brauzeri bor
(Chromium). U saytlarni ochadi, tugmalarni bosadi, video
o'ynatadi. Sen systemCommand orqali buni qilolmaysan — chunki
systemCommand faqat matnli API va buyruqlar uchun.

MUHIM: Agar browser-agent xatolik qaytarsa yoki vazifani
tugallamasa — systemCommandga o'tma! Qaytadan mastraAgent
bilan browser-agentga boshqacha task description bilan
murojaat qil. systemCommand orqali chromium yoki xdg-open
ishlamaydi — ular bloklangan.

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
  { name: 'systemCommand', description: '⚠️ Execute TEXT-BASED searches (Wikipedia API, DuckDuckGo API), file operations (cat, ls, node), and launch desktop apps (Telegram, kitty). ⛔ NEVER use for browser/website tasks — no chromium/xdg-open, no curl to HTML pages. For websites (opening sites, clicking, video, music) you MUST use mastraAgent with agentId="browser-agent".', parameters: { type: 'object', properties: { command: { type: 'string', description: 'EXACT binary/program name only. Example: "node", "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.' }, args: { type: 'array', items: { type: 'string' }, description: 'Array of arguments for the command, each as a separate string. Example: for "node browser-read.mjs URL", use command="node", args=["browser-read.mjs","URL"]. NEVER repeat the command name as first arg.' }, background: { type: 'boolean', description: 'Run in background (for launching apps like Telegram)' } }, required: ['command'] } },
  { name: 'mastraAgent', description: '*** CRITICAL: You MUST delegate browser tasks! *** Use for: (1) ALL browser/website tasks — opening sites, clicking, scrolling, watching videos, playing music → agentId="browser-agent", (2) writing code → "qwen-agent", (3) weather → "weather-agent", (4) complex analysis → "qwen-agent". ⚠️ If you try browser tasks via systemCommand, it will FAIL! browser-agent is the ONLY way to interact with websites.', parameters: { type: 'object', properties: { agentId: { type: 'string', enum: ['qwen-agent', 'weather-agent', 'browser-agent'], description: 'qwen-agent=general, weather-agent=weather, browser-agent=browser control' }, task: { type: 'string', description: 'Task description in Uzbek. Natural language is fine.' } }, required: ['agentId', 'task'] } },
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
