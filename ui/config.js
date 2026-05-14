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

2. Wikipedia API (birinchi navbatda):
   curl -sL "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD&format=json&srlimit=5&origin=*"

3. DuckDuckGo API (agar Wikipedia natija bermasa):
   curl -sL "https://api.duckduckgo.com/?q=KEYWORD&format=json&no_html=1&skip_disambig=1"

4. BROWSER (agar API lar natija bermasa yoki JS sayt kerak bolsa):
   node browser-read.mjs "https://www.google.com/search?q=KEYWORD"
   BU HAQIQIY BRAUZER. Google, magazin, narx - hamma narsani topadi.
   1-2 marta urinib kor. Keyingi qadamga otishga shoshilma.

5. Agar hali ham topilmasa: boshqa kalit sozlar bilan 2-3 marta urin.
   Shundan keyin "Afsuski topa olmadim, sababi: ..." deb tushuntir.

BOSHQA BUYRQLAR:
  - Fayl oqish: cat fayl_yoli
  - Papka korish: ls -la papka_yoli
  - App ochish: telegram-desktop, kitty, haruna, nautilus (background: true)

JAVOB BERISH:
  - Topilgan malumotni OZBEK TILIDA tushuntir
  - Manba nomini ayt (Wikipedia, DuckDuckGo)
  - <speak> ichida qisqacha natijani ayt`;

export const config = { API_KEY, WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [{ functionDeclarations: [{ name: 'systemCommand', description: 'Execute system commands on the server. Use curl for web search, ls/cat for files, telegram-desktop/kitty/haruna/nautilus for launching apps, node/npm/git for development.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'Command to run. Allowed: ls cat curl echo which pwd date grep head tail wc mkdir touch cp mv rm find df du free uptime ping wget git npm node npx tsc telegram-desktop kitty haruna nautilus' }, args: { type: 'array', items: { type: 'string' }, description: 'Arguments array e.g. ["-la"], ["README.md"], ["-s","https://..."]' }, background: { type: 'boolean', description: 'Run in background (for launching apps)' } }, required: ['command'] } }] }];

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
  return { voiceName: 'Charon', systemPrompt: DEFAULT_SYSTEM_PROMPT };
}

export function saveSettings(settings) {
  localStorage.setItem('ufi_settings', JSON.stringify(settings));
}
