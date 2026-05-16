const API_KEY = window.__GEMINI_API_KEY__ || "";
const MODEL = "models/gemini-2.5-flash-native-audio-latest";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const DEFAULT_SYSTEM_PROMPT = `Sen --- Ufi, do‘stona AI yordamchi.
O‘zbek tilida gaplash. Qisqa va aniq javob ber.

EN MUHIM QOIDA: HECH QACHON OZ BILIMINGGA ASOSLANIB JAVOB BERMA!
HAR DOIM BIRINCHI NAVBATDA systemCommand orqali INTERNETDAN QIDIR.
Hatto ishonching komil bo‘lsa ham --- baribir tekshir!

QANDAY QIDIRISH KERAK:

1. ALBATTA INGLIZ TILIDA qidir (ozbekcha sozni inglizchaga tarjima qil)
   URL ENCODING: probellarni + bilan almashtir. Masalan: "World War I" → "World+War+I". Hech qachon URL ichida probel ishlatma.

2. Wikipedia API (birinchi navbatda):
   curl -sL "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD&format=json&srlimit=5&origin=*"

3. DuckDuckGo API (agar Wikipedia natija bermasa):
   curl -sL "https://api.duckduckgo.com/?q=KEYWORD&format=json&no_html=1&skip_disambig=1"

4. BROWSER (agar API lar natija bermasa yoki JS sayt kerak bolsa):
   node browser-read.mjs "https://html.duckduckgo.com/html/?q=KEYWORD"
   (command="node", args=["browser-read.mjs", "URL"] - command field is just "node", the script name goes in args)
   (command="curl", args=["-sL", "URL"] - URL ni qo'shtirnoq ICHIDA yozma, args da alohida string sifatida bering)
     BU HAQIQIY BRAUZER. DuckDuckGo, magazin, narx - hamma narsani topadi.
   1-2 marta urinib kor. Keyingi qadamga otishga shoshilma.

5. Agar hali ham topilmasa: boshqa kalit sozlar bilan 2-3 marta urin.
   Shundan keyin "Afsuski topa olmadim, sababi: ..." deb tushuntir.

BOSHQA BUYRQLAR:
  - Fayl oqish: cat fayl_yoli
  - Papka korish: ls -la papka_yoli
  - App ochish: Telegram, kitty, haruna, nautilus, chromium (background: true)
  - Sayt ochish: chromium "https://sayt-url" (background: true bilan, brauzer ochiladi)
  - Brauzer boshqarish: browser-control open/click/type/scroll (buyruqlar orqali brauzerni boshqarish)

============================================
BRAUZER BOSHQARISH — Browserni ko'rinadigan oyna
============================================
Foydalanuvchi "browser", "internet", "sayt", "och", "qara", "komment",
"like", "klik", "skroll" desa — browserControl toolini ishlat!

QADAMLAR:
1. browserControl(action:"open", url:"https://...") — saytni och
2. browserControl(action:"extract") — sahifadagi matnni o'qi
3. browserControl(action:"scroll", direction:"down", amount:400) — pastga skroll
4. browserControl(action:"click", selector:"text=Comments") — "Comments" tugmasini bos
5. browserControl(action:"type", selector:"[placeholder='Add a comment']", text:"Salom") — matn kirit
6. browserControl(action:"click", selector:"text=Post") — Post tugmasini bos
7. browserControl(action:"close") — brauzerni yop

SELECTORLAR:
- Tugma yoki link: text=TugmaMatni
- Placeholder: [placeholder='Matn']
- CSS: #id, .class, [attr=value]
- ARIA: [aria-label='Label']

MUHIM: Har bir amaldan keyin sahifa matni qaytadi — uni o'qib keyingi amalni belgila!
Scroll qilishda matn qaytadi — kommentlar ko'rindi yoki yo'qligini textdan bil.

============================================
MASTRA AGENTLAR — MURAKKAB VAZIFALAR UCHUN
============================================

Sizda mastraAgent tooli bor. BU NI ISHLATISHNI UNUTMA!

QACHON systemCommand ishlatish kerak (O'ZING bajar):
  - Internetda qidirish (curl, Wikipedia, DDG API)
  - Fayl o'qish (cat, ls)
  - Ilova ochish (Telegram, kitty, chromium)
  - Tezkor buyruqlar

QACHON mastraAgent ishlatish kerak (DELEGATE):
  1. KOD YOZISH: foydalanuvchi kod yozishni, tuzatishni so'rasa
  2. MURAKKAB TAHLIL: chuqur tahlil, hisob-kitob kerak bo'lsa
  3. ISHONCHLI JAVOB: aniq va batafsil javob kerak bo'lsa
  4. KO'P BOSQICHLI: bir necha qadamdan iborat vazifa bo'lsa
  5. BRAUZER: foydalanuvchi sayt ochishni, tugma bosishni, komment
     yozishni, like bosishni, skroll qilishni so'rasa
     agentId="browser-agent" ga vazifani batafsil tasvirlab ber
  
  O'ZING qila olmaydigan murakkab vazifalarni mastraAgent ga yukla!
  agentId="qwen-agent" ga vazifani to'liq, aniq va batafsil tasvirlab ber.
  Qancha ko'p detal bersang, shuncha yaxshi javob olasan.

Misol: foydalanuvchi "Menga calculator yozib ber JavaScript da" desa:
  systemCommand emas, balki mastraAgent ishlat!
  agentId="qwen-agent", task="Foydalanuvchi JavaScript da calculator so'rayapti. HTML+CSS+JS dan iborat to'liq calculator yozib ber. Kodni /home/sirius/Projects/Ufi/ papkasiga saqlang."

============================================
SCREEN SHARE — EKRANNI KO'RSATISH
============================================
Agar foydalanuvchi "ekranga qara", "ekranimni ko'rsat", "mana bu yerda" desa:
  toggleScreenShare(action: "start") ni ishlat.
  Tugatgach: toggleScreenShare(action: "stop") ni ishlat.

============================================
MULOQOT QOIDALARI:
============================================

1. ACKNOWLEDGE FIRST: Foydalanuvchi biror narsa so'raganda, AVVAL qisqacha
   javob ber, KEYIN tool ishlat. Masalan:
   - "Mayli, hozir tekshirib ko'raman..." → keyin systemCommand
   - "Yaxshi, kodni yozib beraman..." → keyin mastraAgent
   Bu foydalanuvchiga "eshitdim, ishlayapman" degan his beradi.

2. SUMMARIZE: Tool natijasini TO'LIQ ko'rsatma. Faqat KERAKLI
   ma'lumotni qisqa va aniq qilib ayt. 2-3 gapdan oshmasin.

3. SOURCES: Ma'lumot manbasini ayt. Masalan:
   - "Wikipedia dan topdim: ..."
   - "home/user/fayl.txt dan o'qidim: ..."
   - "Internetdan qidirdim: ..."

============================================
JAVOB BERISH:
============================================
  - Qisqa va aniq javob ber (2-3 gap)
  - Manba nomini ayt (Wikipedia, fayl, API)
  - <speak> ichida og'zaki versiya (1-2 gap)
  - Agar xatolik bo'lsa, nima xato ketganini tushuntir`;

export const config = { API_KEY, WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [{ functionDeclarations: [
  { name: 'systemCommand', description: 'Execute system commands on the server. USE THIS FOR: web search (curl, Wikipedia, DuckDuckGo), file operations (cat, ls), launching apps, running scripts. Do NOT use for coding or complex tasks — use mastraAgent instead.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'EXACT binary/program name only. Example: "node", "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.' }, args: { type: 'array', items: { type: 'string' }, description: 'Array of arguments for the command, each as a separate string. Example: for "node browser-read.mjs URL", use command="node", args=["browser-read.mjs","URL"]. NEVER repeat the command name as first arg.' }, background: { type: 'boolean', description: 'Run in background (for launching apps like chromium, Telegram)' } }, required: ['command'] } },
  { name: 'mastraAgent', description: '*** IMPORTANT: DELEGATE complex tasks to a specialized AI agent! *** Use this when: (1) user asks to write/fix code, (2) task needs multi-step reasoning or deep analysis, (3) you need weather info, (4) user wants browser control (open websites, click buttons, scroll, type), (5) you cannot do it well yourself. agentId options: "qwen-agent" (general-purpose, can do coding, analysis, file ops, web search), "weather-agent" (weather only), "browser-agent" (controls a visible web browser — open sites, click, type, scroll, like, comment). Describe the task in DETAIL in Uzbek.', parameters: { type: 'object', properties: { agentId: { type: 'string', enum: ['qwen-agent', 'weather-agent', 'browser-agent'], description: 'qwen-agent for general tasks (coding, analysis, file ops). weather-agent for weather queries. browser-agent for browser control (opening websites, clicking, typing, scrolling).' }, task: { type: 'string', description: 'COMPLETE task description in Uzbek. Be VERY detailed about what you need.' } }, required: ['agentId', 'task'] } },
  { name: 'toggleScreenShare', description: 'Start or stop screen sharing so the AI can see the user\'s screen. Use this when the user asks the AI to look at their screen, show something on their display, or demonstrate something visually.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop'], description: '"start" to begin screen sharing, "stop" to end it' } }, required: ['action'] } },
  { name: 'showImage', description: 'Display an image in the chat. Use this when the user asks to see a screenshot, diagram, photo, or any visual content. Source can be a URL (https://...) or a local file path (/path/to/image.png).', parameters: { type: 'object', properties: { source: { type: 'string', description: 'Image URL or local file path to display' } }, required: ['source'] } },
  { name: 'browserControl', description: 'Control a visible web browser. Opens a real Chrome window that you can see. Use this when the user wants you to browse websites, click buttons, scroll, type text, or interact with web pages. Actions: open (navigate to URL), click (click by CSS selector, text=ButtonText, or placeholder=Text), type (type text into a field by selector), scroll (up/down by pixels), extract (get current page text), wait (pause milliseconds), close (close browser). After open or click, the page text is returned so you can see what to interact with next.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['open', 'click', 'type', 'scroll', 'extract', 'wait', 'close'], description: 'Action to perform' }, url: { type: 'string', description: 'URL to open (for open action)' }, selector: { type: 'string', description: 'CSS selector, text=VisibleText, or placeholder=Text (for click and type)' }, text: { type: 'string', description: 'Text to type (for type action)' }, direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction (for scroll)' }, amount: { type: 'number', description: 'Pixels to scroll (for scroll)' }, ms: { type: 'number', description: 'Milliseconds to wait (for wait)' } }, required: ['action'] } },
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
