import { spawn } from 'node:child_process';
import { debug } from '../config.mjs';

async function handleBrowse(intent) {
  const { goto } = await import('../../tools/browser-fast.mjs');
  return await goto(intent.url);
}

async function handleYoutubeSearch(intent) {
  const { youtubeSearch } = await import('../../tools/browser-fast.mjs');
  return await youtubeSearch(intent.query);
}

async function handleWeather(intent) {
  const apiKey = process.env.OPENWEATHER_API_KEY || '';
  const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(intent.city)}&units=metric&appid=${apiKey}`;
  try {
    const resp = await fetch(apiUrl);
    const data = await resp.json();
    if (data.main) {
      return { success: true, message: `В ${intent.city} сейчас ${Math.round(data.main.temp)}°C, ${data.weather[0].description}` };
    }
    return { success: false, message: `Не удалось получить погоду для ${intent.city}` };
  } catch (e) {
    return { success: false, message: `Ошибка получения погоды: ${e.message}` };
  }
}

async function handleLaunch(intent) {
  try {
    const child = spawn(intent.app, [], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, message: `Запущен ${intent.app}` };
  } catch (e) {
    return { success: false, message: `Не удалось запустить ${intent.app}: ${e.message}` };
  }
}

async function handleSearch(intent) {
  const { search } = await import('../../tools/browser-fast.mjs');
  return await search(intent.query);
}

async function handleMedia(intent, runCommand) {
  const action = intent.action || 'play-pause';
  const actionMap = {
    'stop': ['stop'],
    'pause': ['pause'],
    'play': ['play'],
    'play-pause': ['play-pause'],
    'next': ['next'],
    'previous': ['previous'],
    'volume-up': ['volume', '0.1+'],
    'volume-down': ['volume', '0.1-'],
  };
  const args = actionMap[action] || ['play-pause'];
  try {
    const r = await runCommand('playerctl', args);
    return { success: r.exitCode === 0, message: `Media ${action}`, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    return { success: false, message: `Media error: ${e.message}` };
  }
}

async function handleTelegramIntent(intent) {
  const { sendToSavedMessages, getRecentMessages, getUnreadMessages } =
    await import('../../tools/telegram-client.mjs');

  switch (intent.type) {
    case 'telegram_send': {
      try {
        await sendToSavedMessages(intent.text);
        return { success: true, message: 'Сообщение отправлено в Избранные ✅' };
      } catch (e) {
        return { success: false, message: 'Ошибка Telegram: ' + e.message };
      }
    }
    case 'telegram_read': {
      try {
        const isUnread = intent.subtype === 'unread' || (intent.raw || '').toLowerCase().includes('непрочитан');
        if (isUnread) {
          const msgs = await getUnreadMessages(10);
          if (msgs.length === 0) return { success: true, message: '✅ Непрочитанных сообщений нет' };
          return { success: true, message: `📨 Непрочитанные сообщения:\n${msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}`).join('\n')}` };
        }
        const msgs = await getRecentMessages(10);
        if (msgs.length === 0) return { success: true, message: '✅ Нет последних сообщений' };
        return { success: true, message: `📨 Последние сообщения:\n${msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}${m.unread ? ' [❗]' : ''}`).join('\n')}` };
      } catch (e) {
        return { success: false, message: 'Ошибка Telegram: ' + e.message };
      }
    }
    default:
      return { success: false, message: 'Unknown telegram intent' };
  }
}

export async function handleIntent(intent, runCommand) {
  debug(`[IntentHandler] Processing: ${intent.type}`, JSON.stringify(intent));
  let result;

  switch (intent.type) {
    case 'browse':
      result = await handleBrowse(intent);
      break;
    case 'youtube':
      result = await handleYoutubeSearch(intent);
      break;
    case 'weather':
      result = await handleWeather(intent);
      break;
    case 'launch':
      result = await handleLaunch(intent);
      break;
    case 'search':
      result = await handleSearch(intent);
      break;
    case 'telegram_send':
    case 'telegram_read':
      result = await handleTelegramIntent(intent);
      break;
    case 'media':
      result = await handleMedia(intent, runCommand);
      break;
    default:
      result = { success: false, message: 'Unknown intent type' };
  }

  return result;
}

export async function callMastraAgent(agentId, task) {
  const { mastra } = await import('../../mastra/index.mjs');
  const agent = mastra.getAgent(agentId);
  const result = await agent.generate(
    [{ role: 'user', content: task }],
    { maxSteps: 3 }
  );
  return { result: result.text, fastPath: false };
}
