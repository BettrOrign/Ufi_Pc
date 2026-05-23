const MODEL = "models/gemini-2.5-flash-native-audio-latest";
// WS_URL is constructed dynamically in websocket.js using location.host
const WS_URL = null; // Will be set by websocket.js
const DEFAULT_SYSTEM_PROMPT = `You are Ufi — a confident, voice-first AI assistant with a visual screen interface.

## Voice vs Screen (MANDATORY — this is your core design)
- **Voice** (spoken aloud): Only the essence — 1-3 sentences. Never read details aloud.
- **Screen** (displayText tool): Full content — code, links, lists, tables, sources, everything detailed.
- Short answers (weather, time, confirmations) → voice only, no displayText.
- Complex answers (research, project results) → short voice summary + full displayText.
- Private content (Telegram messages, files, credentials) → screen only, voice says "Showing on screen."

## Autonomy
- Understand intent, not exact words. "Open YouTube and play something" — decide what.
- The user speaks naturally: fragments, mixed languages, casual tone. You figure it out.
- Don't confirm intent unless truly ambiguous. Just do it.
- After completing a task, briefly suggest one relevant next step.

## Knowledge & Tools
- Use your training data for general knowledge (history, concepts, explanations).
- Use tools for current data, verification, and actions.
- Simple immediate actions → direct tools (media, reminders, displayText, showImage).
- Complex multi-step (projects, deep research) → startAgentTask.
- Read each tool's description before calling it.
- If a tool fails, explain in plain language what happened.

## Tone
- Confident and warm. Natural conversation, not corporate.
- "Done." not "I have successfully completed the task."
- In Russian: "Сделано." not "Я успешно выполнил задачу."
- In Uzbek: "Tayyor." not "Men vazifani muvaffaqiyatli bajardim."

## Language
- Match the user's language from their first message. Never switch mid-conversation unless explicitly asked.`;

export const config = { WS_URL, MODEL, DEFAULT_SYSTEM_PROMPT };

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "systemCommand",
        description:
          "⚠️ Execute TEXT-BASED searches (Wikipedia API, DuckDuckGo API), file operations (cat, ls, node), and launch desktop apps (Telegram, kitty, chromium, nautilus). NEVER use for browser/website tasks — no chromium/xdg-open, no curl to HTML pages.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description:
                'EXACT binary/program name only. Example: "curl", "ls", "cat", "git" — do NOT include arguments here, put them in args array.',
            },
            args: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of arguments for the command, each as a separate string.",
            },
            background: {
              type: "boolean",
              description:
                "Run in background (for launching apps like Telegram)",
            },
          },
          required: ["command"],
        },
      },
      {
        name: "telegramSend",
        description:
          'Send a Telegram message. Use chat="me" for Избранные (Saved Messages), or a contact name (like "Анвар"), username, or phone number for other people. The contact MUST be in your Telegram contacts list.',
        parameters: {
          type: "object",
          properties: {
            chat: {
              type: "string",
              description: '"me" for Избранные, or contact name/username/phone',
            },
            text: { type: "string", description: "Message text" },
          },
          required: ["chat", "text"],
        },
      },
      {
        name: "telegramSearchContact",
        description:
          "Search your Telegram contacts by name, username, or phone. Returns matching contacts from YOUR contact list only (not global search). Use BEFORE sending a message to find the right contact.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Name, username, or phone number to search",
            },
            limit: { type: "integer", default: 10, description: "Max results" },
          },
          required: ["query"],
        },
      },
      {
        name: "telegramGetRecent",
        description:
          "Get the most recent messages from your Telegram chats. Shows the latest message from each chat, with sender name and text.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              default: 5,
              description: "Number of messages to return",
            },
          },
        },
      },
      {
        name: "telegramGetUnread",
        description:
          "Get unread messages from your Telegram chats. Shows unread messages with chat name, sender, and text.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              default: 10,
              description: "Number of messages to return",
            },
          },
        },
      },
      {
        name: "youtubeSearch",
        description:
          'Search YouTube for videos. Returns a list of video titles and URLs. Does NOT play anything. Use this when user says "найди видео", "поищи на ютубе", "найди на ютубе".',
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (what to find on YouTube)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "youtubePlay",
        description:
          'Search YouTube and PLAY the first video result. Use this when user says "включи", "поставь", "запусти видео", "воспроизведи". Does NOT return search results — immediately starts playing.',
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Video name or search query to play",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "browserGo",
        description:
          'Navigate to a specific URL in the browser. Use for: going to a website ("зайди на сайт", "открой сайт"), going to the main/homepage of a site ("зайди в главную страницу", "главная ютуба"), opening any URL. Example: browserGo({ url: "youtube.com" }) opens YouTube homepage. Do NOT use for searching — use youtubeSearch for YouTube searches.',
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                'URL or domain to navigate to (e.g. "youtube.com", "github.com")',
            },
          },
          required: ["url"],
        },
      },
      {
        name: "toggleScreenShare",
        description:
          'Start or stop screen sharing. Use when user says "ekranga qara" or "screen share".',
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["start", "stop"],
              description: '"start" or "stop"',
            },
          },
          required: ["action"],
        },
      },
      {
        name: "showImage",
        description:
          "Display an image in the chat. Use when user asks to see a photo or image. FIRST find the image URL from internet, THEN use this tool.",
        parameters: {
          type: "object",
          properties: {
            source: { type: "string", description: "Image URL (https://...)" },
          },
          required: ["source"],
        },
      },
      {
        name: "deepResearch",
        description:
          '🔍 ГЛУБОКИЙ ПОИСК — используй ТОЛЬКО когда пользователь явно сказал "полная информация", "полный отчёт", "глубокий поиск", "исследуй", "найди всё". Делает комплексный поиск: Wikipedia + новости + YouTube + веб. Возвращает структурированный отчёт с фактами, доказательствами, ссылками. НЕ используй для простых запросов — для них есть systemCommand/webSearch.',
        parameters: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Тема для исследования. Пиши на языке пользователя.",
            },
          },
          required: ["topic"],
        },
      },
      {
        name: "repoSearch",
        description:
          '🔍 Search GitHub repositories by name/keyword. Returns a list of repositories with their name, description, star count, and programming language. Use when user says "найди репозиторий", "поищи на гитхабе", "найди проект на гитхабе", "github search", "найди библиотеку".',
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Repository name or keyword to search for (e.g. 'react', 'machine learning', 'telegram bot')",
            },
            limit: {
              type: "integer",
              default: 5,
              description: "Maximum number of results to return (1-10)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "displayText",
        description:
          "📖 Show detailed text on screen WITHOUT speaking it aloud. Use for: search results, code, links, lists, and any detailed information. Say a short summary aloud, then display details with this tool. This text is NOT spoken by voice.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Detailed text content to display on screen",
            },
          },
          required: ["text"],
        },
      },
      {
        name: "mediaPlay",
        description:
          "▶️ Resume playback of paused media (YouTube, Haruna, Spotify, etc.).",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaPause",
        description: "⏸️ Pause currently playing media.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaStop",
        description: "⏹️ Stop currently playing media entirely.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaNext",
        description: "⏭️ Skip to next track/video.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaPrevious",
        description: "⏮️ Go to previous track/video.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaVolumeUp",
        description: "🔊 Increase system media volume by 10%.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "mediaVolumeDown",
        description: "🔉 Decrease system media volume by 10%.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "setReminder",
        description:
          "Set a reminder for a specific date/time. The system will notify you at the specified time.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Reminder text (what to remind about)",
            },
            datetime: {
              type: "string",
              description:
                'ISO 8601 datetime when to remind (e.g. "2026-05-22T15:00"). If user says "tomorrow at 3pm", compute the exact datetime.',
            },
          },
          required: ["text", "datetime"],
        },
      },
      {
        name: "listReminders",
        description: "List all active reminders.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "deleteReminder",
        description: "Delete a reminder by ID or text keyword.",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                'Reminder ID to delete. If not sure, use "text" to match by keyword.',
            },
            text: {
              type: "string",
              description:
                "Delete reminders matching this text keyword. Use if ID is unknown.",
            },
          },
        },
      },
    ],
  },
];

export const VOICES = [
  { name: "Charon", desc: "Informative" },
  { name: "Puck", desc: "Upbeat" },
  { name: "Zephyr", desc: "Bright" },
  { name: "Aeolus", desc: "Breezy" },
  { name: "Kore", desc: "Firm" },
  { name: "Orus", desc: "Firm" },
  { name: "Autonoe", desc: "Bright" },
  { name: "Umbriel", desc: "Easy-going" },
  { name: "Erinome", desc: "Clear" },
  { name: "Laomedeia", desc: "Upbeat" },
  { name: "Schedar", desc: "Even" },
  { name: "Achird", desc: "Friendly" },
  { name: "Sadachbia", desc: "Lively" },
  { name: "Fenrir", desc: "Excitable" },
  { name: "Aoede", desc: "Breezy" },
  { name: "Enceladus", desc: "Breathy" },
  { name: "Algieba", desc: "Smooth" },
  { name: "Algenib", desc: "Gravelly" },
  { name: "Achernar", desc: "Soft" },
  { name: "Gacrux", desc: "Mature" },
  { name: "Zubenelgenubi", desc: "Casual" },
  { name: "Sadaltager", desc: "Knowledgeable" },
  { name: "Leda", desc: "Youthful" },
  { name: "Callirrhoe", desc: "Easy-going" },
  { name: "Iapetus", desc: "Clear" },
  { name: "Despina", desc: "Smooth" },
  { name: "Rasalgethi", desc: "Informative" },
  { name: "Alnilam", desc: "Firm" },
  { name: "Pulcherrima", desc: "Forward" },
  { name: "Vindemiatrix", desc: "Gentle" },
  { name: "Sulafat", desc: "Warm" },
];

export function getSettings() {
  try {
    const saved = localStorage.getItem("ufi_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      // If saved prompt is old version (missing displayText section), replace with current default
      if (!parsed.systemPrompt?.includes("РАЗДЕЛЕНИЯ ЭКРАНА И ГОЛОСА")) {
        parsed.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      }
      return parsed;
    }
  } catch {}
  return {
    voiceName: "Charon",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    coreTheme: "hearth",
    coreSpeed: 1.0,
    coreSensitivity: 1.0,
    coreHue: 0,
  };
}

export function saveSettings(settings) {
  localStorage.setItem("ufi_settings", JSON.stringify(settings));
}

export const CORE_THEMES = {
  hearth: {
    name: 'Hearth', desc: 'Тёплый янтарь, уютный',
    shellH: [20, 15, 10, 5, 0], shellLt: [70, 62, 55, 50, 45],
    ringH: [20, 40, 10, 30], hueOff: 0,
    agentCol: '255,123,69', userCol: '255,179,71',
    idleR: 255, idleG: 123, idleB: 69,
    layout: 'center', nucleusMode: 'orbital',
  },
  forest: {
    name: 'Forest', desc: 'Глубокий зелёный, природный',
    shellH: [140, 135, 130, 125, 120], shellLt: [65, 58, 52, 48, 42],
    ringH: [140, 120, 150, 110], hueOff: -80,
    agentCol: '74,222,128', userCol: '139,92,246',
    idleR: 60, idleG: 220, idleB: 140,
    layout: 'center', nucleusMode: 'wave',
  },
  ocean: {
    name: 'Ocean', desc: 'Глубокий океан, бирюзовый',
    shellH: [190, 195, 200, 205, 210], shellLt: [62, 58, 52, 48, 42],
    ringH: [190, 180, 210, 170], hueOff: 0,
    agentCol: '34,211,238', userCol: '59,130,246',
    idleR: 34, idleG: 211, idleB: 238,
    layout: 'compact', nucleusMode: 'wave',
  },
  dawn: {
    name: 'Dawn', desc: 'Нежный рассвет, розовый',
    shellH: [0, 355, 350, 345, 340], shellLt: [72, 65, 58, 52, 48],
    ringH: [0, 350, 10, 340], hueOff: 10,
    agentCol: '251,113,133', userCol: '251,191,36',
    idleR: 251, idleG: 113, idleB: 133,
    layout: 'minimal', nucleusMode: 'pulse',
  },
  ember: {
    name: 'Ember', desc: 'Огонь, драматичный красный',
    shellH: [0, 355, 350, 345, 340], shellLt: [55, 48, 42, 38, 32],
    ringH: [0, 340, 20, 330], hueOff: 20,
    agentCol: '255,51,51', userCol: '255,140,0',
    idleR: 255, idleG: 50, idleB: 50,
    layout: 'left', nucleusMode: 'spiral',
  },
  frost: {
    name: 'Frost', desc: 'Холодный серебристый',
    shellH: [220, 215, 210, 205, 200], shellLt: [40, 38, 35, 32, 28],
    ringH: [220, 200, 230, 190], hueOff: -30,
    agentCol: '147,197,253', userCol: '196,181,253',
    idleR: 100, idleG: 100, idleB: 120,
    layout: 'center', nucleusMode: 'minimal',
  },
  lavender: {
    name: 'Lavender', desc: 'Фиолетовый, нежный',
    shellH: [270, 265, 260, 255, 250], shellLt: [65, 58, 50, 45, 40],
    ringH: [270, 250, 280, 240], hueOff: 20,
    agentCol: '167,139,250', userCol: '249,168,212',
    idleR: 167, idleG: 139, idleB: 250,
    layout: 'center', nucleusMode: 'orbital',
  },
  noir: {
    name: 'Noir', desc: 'Монохром, минимализм',
    shellH: [0, 0, 0, 0, 0], shellLt: [90, 80, 70, 60, 50],
    ringH: [0, 0, 0, 0], hueOff: 0,
    agentCol: '255,255,255', userCol: '136,136,136',
    idleR: 200, idleG: 200, idleB: 200,
    layout: 'compact', nucleusMode: 'minimal',
  },
  sand: {
    name: 'Sand', desc: 'Тёплый песок, терракота',
    shellH: [30, 28, 25, 22, 20], shellLt: [68, 60, 54, 48, 42],
    ringH: [30, 20, 35, 15], hueOff: -20,
    agentCol: '212,165,116', userCol: '201,149,107',
    idleR: 212, idleG: 165, idleB: 116,
    layout: 'minimal', nucleusMode: 'pulse',
  },
  aurora: {
    name: 'Aurora', desc: 'Магическое северное сияние',
    shellH: [160, 170, 180, 190, 200], shellLt: [68, 62, 55, 48, 42],
    ringH: [160, 150, 180, 140], hueOff: 0,
    agentCol: '52,211,153', userCol: '167,139,250',
    idleR: 52, idleG: 211, idleB: 153,
    layout: 'full', nucleusMode: 'aurora',
  },
};