#!/usr/bin/env node

/**
 * intent-router.mjs — Fast-path intent detection via keyword heuristics.
 * 
 * No patterns. No whitelist. Uses general keyword categories + noise word removal.
 * Handles ANY word order naturally.
 */

// ─── Keyword Categories ─────────────────────────────────
// These are NOT command patterns — just general word categories.
// If a word belongs to a category, it suggests that intent.

const MEDIA_KEYWORDS = [
  'музык', 'песн', 'музон', 'трек', 'трека', 'треку', 'треке', 'треком',
  'видео', 'клип', 'клипа', 'клипу', 'клипе',
  'мелоди', 'альбом', 'альбома', 'альбому', 'альбоме',
  'кавер', 'кавера', 'каверу', 'кавере',
  'микс', 'микса', 'миксу', 'миксе',
  'саундтрек', 'саундтрека',
  'плейлист', 'плейлиста', 'плейлисту', 'плейлисте',
  'радио',
  'ютуб', 'ютубе', 'ютуба', 'ютубом',
  'youtube',
  'song', 'music', 'video', 'audio', 'track', 'album',
  'playlist', 'radio',
];

const TELEGRAM_SEND_KEYWORDS = [
  'отправ', 'отправит', 'отправь', 'отправьте', 'отправляй', 'отправляет',
  'напиши', 'напишите', 'напишешь', 'написал', 'написать',
  'сообщени', 'сообщение', 'сообщения',
  'send', 'sending', 'sent',
  'message', 'messages',
];

const TELEGRAM_KEYWORDS = [
  'телеграм', 'телеграме', 'телеграма', 'телеграмм',
  'telegram', 'tg',
];

const TELEGRAM_READ_KEYWORDS = [
  'покажи', 'покаж', 'покажите', 'показывай', 'показыва', 'показать',
  'выведи', 'вывед', 'выведи-ка', 'выводи', 'вывести',
  'прочитай', 'прочитан', 'прочитать', 'читай', 'читать',
  'последн', 'последние', 'последний',
  'отобр', 'отобразить', 'отобрази',
  'продемонстрируй', 'демонстрируй', 'продемонстрировать',
  'show', 'read', 'unread', 'latest', 'recent', 'display',
];

const WEATHER_KEYWORDS = [
  'погод', 'температур', 'осадк', 'дожд', 'снег', 'ветр',
  'weather', 'temperature', 'rain', 'snow', 'wind',
];

const APP_LAUNCH_KEYWORDS = [
  'запуст', 'приложени', 'программ', 'прог',
  'launch', 'application', 'program', 'app',
];

// Action verbs that suggest search intent (without media/weather/app context)
const SEARCH_VERBS = ['найди', 'найдите', 'поищи', 'поищите', 'загугли', 'загуглите', 'поиск', 'search', 'find'];

// ─── Noise Words ────────────────────────────────────────
// Words removed during query extraction.
// These include verbs, prepositions, media words, and other filler.

const NOISE_WORDS = new Set([
  // Verbs (play)
  'поставь', 'постав', 'поставьте', 'поставлю', 'поставишь',
  'включи', 'включ', 'включите', 'включаю', 'включаешь',
  'запусти', 'запуст', 'запустите', 'запускаю', 'запускаешь',
  // Verbs (search/navigate)
  'найди', 'найд', 'найдите', 'нахожу', 'находишь',
  'открой', 'откро', 'откройте', 'открываю', 'открываешь',
  'перейди', 'перейд', 'перейдите',
  'покажи', 'покаж', 'покажите',
  'послушай', 'послушать', 'послушайте',
  'поищи', 'поищ', 'поищите',
  'загугли', 'загугл', 'загуглите',
  'скажи', 'расскажи',
  'давай', 'давайте', 'дай',
  'хочу', 'хотел', 'хотела', 'хотелось', 'хочешь', 'хотите',
  // Telegram send verbs
  'отправь', 'отправ', 'отправьте', 'отправляй', 'отправить',
  'напиши', 'напишите', 'напишешь', 'написать',
  // Media words
  'музыку', 'музыка', 'музыки', 'музыкой', 'музыке', 'музык',
  'песню', 'песня', 'песни', 'песней', 'песне', 'песен',
  'музон', 'музона', 'музоном',
  'трек', 'трека', 'треку', 'треке', 'треком',
  'видео', 'видеоклип', 'видеоролик',
  'клип', 'клипа', 'клипу', 'клипе', 'клипом',
  'мелодию', 'мелодия', 'мелодии', 'мелодией',
  'альбом', 'альбома', 'альбому', 'альбоме', 'альбомом',
  'кавер', 'кавера',
  'микс', 'микса',
  'саундтрек',
  'радио',
  'плейлист', 'плейлиста', 'плейлистом',
  'ютуб', 'ютубе', 'ютуба', 'ютубом',
  'youtube',
  'song', 'music', 'video', 'audio', 'track', 'album',
  'playlist', 'radio',
  // Prepositions and small words
  'на', 'в', 'во', 'с', 'со', 'из', 'у', 'о', 'об', 'от', 'до',
  'по', 'за', 'про', 'для', 'без', 'через', 'над', 'под',
  'перед', 'после', 'около', 'возле', 'мимо', 'кроме',
  'и', 'а', 'но', 'да', 'или', 'что', 'чтобы', 'как',
  'под', 'названием', 'имени', 'имя', 'про',
  // Saved Messages
  'избранные', 'избранн',
  // Politeness
  'пожалуйста', 'плиз', 'спасибо', 'будь', 'добра',
  'please', 'thank', 'thanks',
  // Other noise
  'там', 'тут', 'здесь', 'сейчас', 'мне', 'меня',
  'это', 'этот', 'эта', 'это', 'эти',
  'какой', 'какая', 'какое', 'какие', 'какую',
  'такой', 'такая', 'такое', 'такие',
  // Weather words (strip from city query)
  'погода', 'погоду', 'погоды', 'погоде', 'погодой',
  'температура', 'температуру', 'температуры', 'температуре',
  // English noise words
  'play', 'plays', 'playing', 'played',
  // Generic internet command words
  'download', 'downloads', 'downloading', 'downloaded',
  'view', 'views', 'viewing', 'viewed',
  'load', 'loads', 'loading', 'loaded',
  'start', 'starts', 'starting', 'started',
  'search', 'searches', 'searching', 'searched',
  'open', 'opens', 'opening', 'opened',
  'find', 'finds', 'finding', 'found',
  'watch', 'watches', 'watching', 'watched',
  'listen', 'listens', 'listening', 'listened',
  'show', 'shows', 'showing', 'showed',
  'tell', 'tells', 'telling', 'told',
  'the', 'a', 'an', 'for', 'to', 'in', 'on', 'at', 'with',
  'and', 'or', 'of', 'is', 'are', 'was', 'were',
  'please', 'some', 'any', 'this', 'that', 'these', 'those',
  'me', 'my', 'i', 'we', 'you', 'your',
  // Telegram platform
  'телеграм', 'телеграме', 'телеграма', 'телеграмм',
]);

// ─── Site aliases (browse intent) ───────────────────────

const SITE_ALIASES = {
  'ютуб': 'youtube.com',
  'ютубе': 'youtube.com',
  'ютуба': 'youtube.com',
  'youtube': 'youtube.com',
  'гугл': 'google.com',
  'google': 'google.com',
  'яндекс': 'ya.ru',
  'yandex': 'ya.ru',
  'github': 'github.com',
  'гитхаб': 'github.com',
  'gmail': 'mail.google.com',
  'почта': 'mail.google.com',
  'вк': 'vk.com',
  'vk': 'vk.com',
  'reddit': 'reddit.com',
  'редит': 'reddit.com',
  'озон': 'ozon.ru',
  'ozon': 'ozon.ru',
  'wildberries': 'wildberries.ru',
  'авито': 'avito.ru',
  'avito': 'avito.ru',
};

// ─── App aliases ────────────────────────────────────────

const APP_ALIASES = {
  'телеграм': 'Telegram',
  'telegram': 'Telegram',
  'telegramm': 'Telegram',
  'терминал': 'kitty',
  'terminal': 'kitty',
  'kitty': 'kitty',
  'браузер': 'chromium',
  'browser': 'chromium',
  'хром': 'chromium',
  'chrome': 'chromium',
  'наутилус': 'nautilus',
  'файлы': 'nautilus',
  'files': 'nautilus',
  'харуна': 'haruna',
  'haruna': 'haruna',
  'плеер': 'haruna',
  'player': 'haruna',
  'код': 'code',
  'vs code': 'code',
  'vscode': 'code',
  'visual studio code': 'code',
};

// ─── Helpers ────────────────────────────────────────────

function hasAnyKeyword(keywords, lowerText) {
  for (const kw of keywords) {
    if (lowerText.includes(kw)) return true;
  }
  return false;
}

function getMatchingKeywords(keywords, lowerText) {
  const matched = [];
  for (const kw of keywords) {
    if (lowerText.includes(kw)) matched.push(kw);
  }
  return matched;
}

function extractQuery(text) {
  // Step 1: If text has quoted content, extract the first quoted string as the query
  // e.g., "Montagem Debado" nomli musiqani topib ijro eting → "Montagem Debado"
  const quoteMatch = text.match(/["""'']["']?([^""''"]+)["""''"]["']?/);
  if (quoteMatch && quoteMatch[1].trim()) {
    return quoteMatch[1].trim();
  }
  
  // Step 2: Remove punctuation (but keep apostrophes for words like qo'shig'ini)
  const cleaned = text.replace(/[,!?.;:()[\]{}"«»@#$%^&*+=~`]+/g, ' ').trim();
  const words = cleaned.split(/\s+/);
  
  // Step 3: Filter words - remove exact noise word matches AND
  // words that CONTAIN a noise word as substring (e.g., "YouTubeda" contains "youtube")
  const filtered = words.filter(w => {
    const lower = w.toLowerCase();
    // Exact match check
    if (NOISE_WORDS.has(lower)) return false;
    // Substring check: if word contains any noise word that's 4+ chars
    // This catches "YouTubeda" → "youtube" is in NOISE_WORDS
    for (const nw of NOISE_WORDS) {
      if (nw.length >= 4 && lower.includes(nw)) return false;
    }
    return true;
  });
  
  const query = filtered.join(' ').trim();
  return query || text; // fallback to original
}

// ─── Public API ─────────────────────────────────────────

export function detectIntent(text) {
  if (!text || typeof text !== 'string') return null;
  
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  // 1. URL → browse (fastest check)
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'browse', url: trimmed, raw: trimmed };
  }
  
  // 2. Weather check
  if (hasAnyKeyword(WEATHER_KEYWORDS, lower)) {
    const query = extractQuery(trimmed);
    return { type: 'weather', city: query || 'Moscow' };
  }
  
  // 3. App launch check (before browse — "запусти телеграм" should launch app, not open web.telegram.org)
  const launchVerbMatch = /(?:запусти|запуст|запускай|launch|open\s+app)(?:\s|$)/i.test(trimmed + ' ');
  if (launchVerbMatch) {
    const launchQuery = extractQuery(trimmed).toLowerCase().trim();
    if (launchQuery) {
      const app = APP_ALIASES[launchQuery];
      if (app) return { type: 'launch', app };
      if (/^[a-z][a-z0-9_-]+$/i.test(launchQuery)) {
        return { type: 'launch', app: launchQuery };
      }
    }
    // If no app matched but we detected a launch verb, still try launch with the query
    const launchRawQuery = extractQuery(trimmed).toLowerCase().trim();
    if (launchRawQuery && /^[a-zа-я][a-zа-я0-9_-]+$/i.test(launchRawQuery)) {
      return { type: 'launch', app: launchRawQuery };
    }
  }
  
  // 4. Media/youtube check
  const matchingMedia = getMatchingKeywords(MEDIA_KEYWORDS, lower);
  if (matchingMedia.length > 0) {
    // If the ONLY matched keywords are site names (youtube, ютуб), it's a browse intent
    // e.g., "открой ютуб" → browse youtube.com, not "search 'открой'"
    const siteSubdomains = Object.keys(SITE_ALIASES);
    const onlySiteNames = matchingMedia.every(kw => {
      // Check if this keyword matches any site alias
      return siteSubdomains.some(site => kw.includes(site) || site.includes(kw));
    });
    
    if (onlySiteNames) {
      // Check if there's a real search query (not just noise words)
      const query = extractQuery(trimmed);
      // If we extracted something meaningful (different from original), it's a search
      // e.g., "youtube lofi hip hop" → query "lofi hip hop" → youtube search
      // e.g., "открой ютуб" → query "открой ютуб" (same as original, nothing removed) → browse
      if (query && query !== trimmed) {
        return { type: 'youtube', query };
      }
      // Just the site name → browse intent
      for (const [alias, url] of Object.entries(SITE_ALIASES)) {
        if (lower.includes(alias)) {
          return { type: 'browse', url, raw: trimmed };
        }
      }
    }
    
    // Normal media intent - extract the query
    const query = extractQuery(trimmed);
    return { type: 'youtube', query: query || trimmed };
  }
  
  // 4.5. Telegram send
  const hasSendKeywords = hasAnyKeyword(TELEGRAM_SEND_KEYWORDS, lower);
  const hasTelegramKeywords = hasAnyKeyword(TELEGRAM_KEYWORDS, lower);
  const hasIzbrannye = lower.includes('избранные');
  const hasReadKeywords = hasAnyKeyword(TELEGRAM_READ_KEYWORDS, lower);

  // Don't match as "send" if read/show keywords are present
  if ((hasSendKeywords && (hasTelegramKeywords || hasIzbrannye)) || (hasIzbrannye && hasTelegramKeywords)) {
    if (!hasReadKeywords) {
      const query = extractQuery(trimmed);
      return { type: 'telegram_send', text: query || trimmed, raw: trimmed };
    }
  }
  // 4.5b. Telegram read (show/recent/unread messages)
  if (hasReadKeywords && hasTelegramKeywords) {
    const query = extractQuery(trimmed);
    const isUnread = lower.includes('непрочитан') || lower.includes('unread') || lower.includes('новые');
    return { 
      type: 'telegram_read', 
      subtype: isUnread ? 'unread' : 'recent',
      text: query || trimmed, 
      raw: trimmed 
    };
  }
  // 4.6. Telegram search — fall through to LLM (no browse)
  if (hasAnyKeyword(TELEGRAM_KEYWORDS, lower)) {
    const searchVerbs = getMatchingKeywords(SEARCH_VERBS, lower);
    if (searchVerbs.length > 0) {
      return null;
    }
    // "открой телеграм" etc with no send/search — check for launch
    if (/(?:открой|открывай|открыть)/i.test(lower)) {
      // Try to launch Telegram app
      const launchQuery = extractQuery(trimmed).toLowerCase().trim();
      if (launchQuery) {
        const app = APP_ALIASES[launchQuery];
        if (app) return { type: 'launch', app };
      }
    }
  }

  // 5. Browse by site name
  for (const [alias, url] of Object.entries(SITE_ALIASES)) {
    if (lower.includes(alias)) {
      return { type: 'browse', url, raw: trimmed };
    }
  }
  
  // 6. General search intent (has a search verb but no other category matched)
  for (const verb of SEARCH_VERBS) {
    if (lower.startsWith(verb) || lower.includes(` ${verb} `) || lower.endsWith(` ${verb}`)) {
      const query = extractQuery(trimmed);
      if (query) return { type: 'search', query };
    }
  }
  
  // 7. Unknown — fall through to LLM
  return null;
}

// ─── CLI mode ───────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('intent-router.mjs');
if (isMain && process.argv[2]) {
  const text = process.argv[2];
  const result = detectIntent(text);
  console.log(JSON.stringify(result || { type: 'unknown', text }));
  process.exit(0);
}
