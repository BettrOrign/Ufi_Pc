import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import {
  ALLOWED_COMMANDS, BLOCKED_SUBSTRINGS, MIME_MAP,
  debug, debugErr,
} from '../config.mjs';
import { handleIntent, callMastraAgent } from './intent.mjs';

const ALLOWED_IMAGE_BASE = '/home/sirius/Projects/';

export async function handleApiRequest(core, req, res, url, body) {
  const pathname = url.pathname;
  const method = req.method;

  // GET /api/core/status
  if (pathname === '/api/core/status' && method === 'GET') {
    return sendJSON(res, 200, {
      services: core._getServicesStatus(),
      uptime: core._getUptime(),
      version: '1.0.0',
    });
  }

  // GET /api/auth/services
  if (pathname === '/api/auth/services' && method === 'GET') {
    const { getServices } = await import('../../auth/auth-store.mjs');
    return sendJSON(res, 200, { services: getServices() });
  }

  // POST /api/auth/connect
  if (pathname === '/api/auth/connect' && method === 'POST') {
    const { service, credentials } = JSON.parse(body);
    if (!service || !credentials) return sendJSON(res, 400, { error: 'Missing service or credentials' });
    const { setServiceCredentials } = await import('../../auth/auth-store.mjs');
    setServiceCredentials(service, credentials);
    core._broadcast({ type: 'auth', service, connected: true });
    debug(`[Auth] ${service} connected`);
    return sendJSON(res, 200, { success: true, message: `${service} connected` });
  }

  // POST /api/auth/disconnect
  if (pathname === '/api/auth/disconnect' && method === 'POST') {
    const { service } = JSON.parse(body);
    if (!service) return sendJSON(res, 400, { error: 'Missing service' });
    const { disconnectService } = await import('../../auth/auth-store.mjs');
    disconnectService(service);
    core._broadcast({ type: 'auth', service, connected: false });
    debug(`[Auth] ${service} disconnected`);
    return sendJSON(res, 200, { success: true, message: `${service} disconnected` });
  }

  // POST /api/exec
  if (pathname === '/api/exec') {
    if (method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
    const { command, args = [], background = false } = JSON.parse(body);

    if (!ALLOWED_COMMANDS.has(command)) {
      return sendJSON(res, 403, { error: `Command '${command}' not allowed`, stdout: '', stderr: '', exitCode: -1 });
    }
    for (const b of BLOCKED_SUBSTRINGS) {
      if (command.includes(b)) {
        return sendJSON(res, 403, { error: `Blocked pattern: ${b}`, stdout: '', stderr: '', exitCode: -1 });
      }
    }

    if (background) {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd: process.cwd() });
      child.unref();
      return sendJSON(res, 200, { stdout: `Launched ${command} (PID: ${child.pid})`, stderr: '', exitCode: 0, pid: child.pid });
    }

    const result = await core._runCommand(command, args);
    debug('[API] exec:', command, args.join(' '), '- exit:', result.exitCode);
    return sendJSON(res, 200, result);
  }

  // GET /api/search
  if (pathname === '/api/search') {
    const query = url.searchParams.get('q');
    if (!query) return sendJSON(res, 400, { error: 'Missing query parameter' });
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(apiUrl, { headers: { 'User-Agent': 'Ufi/1.0' } });
    const data = await response.json();
    return sendJSON(res, 200, data);
  }

  // POST /api/intent/route
  if (pathname === '/api/intent/route' && method === 'POST') {
    const { text } = JSON.parse(body);
    if (!text) return sendJSON(res, 400, { error: 'Missing text' });

    const { detectIntent } = await import('../../tools/intent-router.mjs');
    const intent = detectIntent(text);

    if (!intent) return sendJSON(res, 200, { matched: false });

    debug(`[IntentRouter] Matched: ${intent.type} →`, JSON.stringify(intent));
    const result = await handleIntent(intent, core._runCommand.bind(core));
    debug(`[IntentRouter] Result:`, JSON.stringify(result).slice(0, 200));
    return sendJSON(res, 200, { matched: true, intent, result });
  }

  // POST /api/mastra/agent/generate
  if (pathname === '/api/mastra/agent/generate' && method === 'POST') {
    const { agentId, task } = JSON.parse(body);
    if (!agentId || !task) return sendJSON(res, 400, { error: 'Missing agentId or task' });

    const { detectIntent } = await import('../../tools/intent-router.mjs');
    let intent = detectIntent(task);

    if (intent && intent.type === 'telegram_send') {
      const lowerRaw = (intent.raw || '').toLowerCase();
      if (!lowerRaw.includes('избранные') && !lowerRaw.includes(' me') && lowerRaw !== 'me') {
        debug(`[FastPath] telegram_send to contact, falling through to slow path`);
        intent = null;
      }
    }

    if (intent) {
      debug(`[FastPath] "${task}" → ${intent.type}`, JSON.stringify(intent));
      const result = await handleIntent(intent, core._runCommand.bind(core));
      return sendJSON(res, 200, { result: result.message, fastPath: true, matched: true, intent: intent.type });
    }

    try {
      debug(`[SlowPath] "${task}" → Mastra ${agentId}`);
      const mastraRes = await callMastraAgent(agentId, task);
      return sendJSON(res, 200, mastraRes);
    } catch (err) {
      console.error('[Mastra] Agent error:', err.message || err);
      return sendJSON(res, 500, { error: `Mastra agent error: ${err.message || err}` });
    }
  }

  // GET /api/image
  if (pathname === '/api/image' && method === 'GET') {
    const rawPath = url.searchParams.get('path');
    if (!rawPath) return sendJSON(res, 400, { error: 'Missing path parameter' });
    if (!rawPath.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) {
      return sendJSON(res, 403, { error: 'Not an image file' });
    }
    const resolvedPath = resolve(rawPath);
    if (!resolvedPath.startsWith(ALLOWED_IMAGE_BASE)) {
      return sendJSON(res, 403, { error: 'Access denied' });
    }
    try {
      const content = await readFile(resolvedPath);
      const ext = extname(resolvedPath);
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'image/png' });
      res.end(content);
    } catch (err) {
      return sendJSON(res, 404, { error: 'File not found: ' + resolvedPath });
    }
    return;
  }

  // GET /api/image-proxy
  if (pathname === '/api/image-proxy' && method === 'GET') {
    const imageUrl = url.searchParams.get('url');
    if (!imageUrl) return sendJSON(res, 400, { error: 'Missing url parameter' });
    try {
      const response = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Ufi/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return sendJSON(res, 502, { error: 'Failed to fetch: ' + response.status });
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(Buffer.from(buffer));
    } catch (err) {
      return sendJSON(res, 502, { error: 'Image proxy error: ' + err.message });
    }
    return;
  }

  // POST /api/telegram
  if (pathname === '/api/telegram' && method === 'POST') {
    const { action, params } = JSON.parse(body);
    if (!action) return sendJSON(res, 400, { error: 'Missing action' });

    const { getClient, sendToSavedMessages, sendToContactByName, sendToChat, searchContacts, getRecentMessages, getUnreadMessages } = await import('../../tools/telegram-client.mjs');

    let result;
    switch (action) {
      case 'send': {
        const { chat, text } = params || {};
        if (!chat || !text) return sendJSON(res, 400, { error: 'Missing chat or text' });
        const isSaved = chat === 'me' || chat === 'saved' || chat === 'избранные' || chat.toLowerCase() === 'избранные';
        if (isSaved) {
          result = await sendToSavedMessages(text);
        } else {
          try { result = await sendToContactByName(chat, text); }
          catch { result = await sendToChat(chat, text); }
        }
        break;
      }
      case 'searchContact': {
        const { query, limit = 10 } = params || {};
        if (!query) return sendJSON(res, 400, { error: 'Missing query' });
        const contacts = await searchContacts(query, limit);
        result = { success: true, contacts, count: contacts.length };
        break;
      }
      case 'getRecent': {
        const { limit = 5 } = params || {};
        const messages = await getRecentMessages(limit);
        result = { success: true, messages, count: messages.length };
        break;
      }
      case 'getUnread': {
        const { limit = 10 } = params || {};
        const messages = await getUnreadMessages(limit);
        result = { success: true, messages, count: messages.length };
        break;
      }
      default:
        return sendJSON(res, 400, { error: `Unknown action: ${action}` });
    }

    debug(`[Telegram API] ${action}:`, JSON.stringify(result).slice(0, 150));
    return sendJSON(res, 200, result);
  }

  // POST /api/browser
  if (pathname === '/api/browser' && method === 'POST') {
    const { action, params, args } = JSON.parse(body);
    if (!action) return sendJSON(res, 400, { error: 'Missing action' });
    const p = params || args || {};

    const { goto, youtubeSearch, youtubePlay } = await import('../../tools/browser-fast.mjs');

    let result;
    switch (action) {
      case 'goto': {
        const { url: targetUrl } = p;
        if (!targetUrl) return sendJSON(res, 400, { error: 'Missing url' });
        result = await goto(targetUrl);
        break;
      }
      case 'youtube-search': {
        const { query } = p;
        if (!query) return sendJSON(res, 400, { error: 'Missing query' });
        result = await youtubeSearch(query);
        break;
      }
      case 'youtube-play': {
        const { query } = p;
        if (!query) return sendJSON(res, 400, { error: 'Missing query' });
        result = await youtubePlay(query);
        break;
      }
      default:
        return sendJSON(res, 400, { error: `Unknown action: ${action}` });
    }

    debug(`[Browser API] ${action}:`, JSON.stringify(result).slice(0, 200));
    return sendJSON(res, 200, result);
  }

  // POST /api/research/deep
  if (pathname === '/api/research/deep' && method === 'POST') {
    const { topic } = JSON.parse(body);
    if (!topic) return sendJSON(res, 400, { error: 'Missing topic' });

    debug(`[DeepResearch] Starting research on: "${topic}"`);
    const sections = [`# 📖 Исследование: ${topic}\n`];

    try {
      const searchResp = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3&origin=*`,
        { signal: AbortSignal.timeout(10000) }
      );
      const searchData = await searchResp.json();
      const pages = searchData?.query?.search || [];

      if (pages.length > 0) {
        const pageTitle = pages[0].title;
        sections.push(`## 📚 Wikipedia\n**[${pageTitle}](https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))})**\n\n`);

        const extractResp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&titles=${encodeURIComponent(pageTitle)}&format=json&pithumbsize=400&origin=*`,
          { signal: AbortSignal.timeout(10000) }
        );
        const extractData = await extractResp.json();
        const wikiPages = extractData?.query?.pages || {};
        const wikiPage = Object.values(wikiPages)[0];

        if (wikiPage) {
          if (wikiPage.thumbnail?.source) sections.push(`![${wikiPage.title}](${wikiPage.thumbnail.source})\n\n`);
          if (wikiPage.extract) sections.push(`${wikiPage.extract.slice(0, 4000)}\n\n`);
        }

        if (pages.length > 1) {
          sections.push(`**Другие статьи Wikipedia:**\n`);
          for (let i = 1; i < pages.length; i++) {
            sections.push(`- [${pages[i].title}](https://en.wikipedia.org/wiki/${encodeURIComponent(pages[i].title.replace(/ /g, '_'))}) — ${pages[i].snippet.replace(/<[^>]+>/g, '')}\n`);
          }
          sections.push(`\n`);
        }
      } else {
        sections.push(`*Результатов в Wikipedia не найдено*\n\n`);
      }
    } catch (err) {
      sections.push(`*Wikipedia недоступна: ${err.message}*\n\n`);
    }

    try {
      const { mastra } = await import('../../mastra/index.mjs');
      const qwenAgent = mastra.getAgent('agent');
      const mastraRes = await qwenAgent.generate(
        [{ role: 'user', content: `Comprehensive web research on "${topic}". Use webSearch to find information from BBC, Reuters, news sites, and other authoritative sources. For the most important pages, use browserRead to get the full content. Collect: key facts, dates, people involved, evidence, controversies, and recent developments. Return ALL information in a well-structured format with sources cited. Be thorough — search for at least 5 different queries.` }],
        { maxSteps: 12 }
      );

      const text = mastraRes.text || '';
      if (text.length > 100) {
        sections.push(`## 🌐 Результаты веб-поиска\n\n${text.slice(0, 12000)}\n\n`);
      } else {
        sections.push(`*Веб-поиск не дал содержательных результатов*\n\n`);
      }
    } catch (err) {
      sections.push(`*Веб-поиск временно недоступен: ${err.message}*\n\n`);
    }

    try {
      const { youtubeSearch } = await import('../../tools/browser-fast.mjs');
      const ytResult = await youtubeSearch(topic);
      if (ytResult?.results?.length > 0) {
        sections.push(`## 🎬 YouTube\n`);
        for (const video of ytResult.results.slice(0, 5)) {
          sections.push(`- [${video.title}](${video.url})\n`);
        }
        sections.push(`\n`);
      }
    } catch (err) {
      // YouTube search optional
    }

    sections.push(`\n---\n*📅 Исследование выполнено: ${new Date().toLocaleString()}*`);
    const report = sections.join('').trim();
    debug(`[DeepResearch] Report: ${report.length} chars`);
    return sendJSON(res, 200, { report });
  }

  // POST /api/reminder
  if (pathname === '/api/reminder' && method === 'POST') {
    const { action, params } = JSON.parse(body);
    if (!action) return sendJSON(res, 400, { error: 'Missing action' });

    const { createReminder, listReminders, deleteReminder } = await import('../../tools/reminder-store.mjs');

    let result;
    switch (action) {
      case 'create': {
        const { text, datetime } = params || {};
        if (!text || !datetime) return sendJSON(res, 400, { error: 'Missing text or datetime' });
        const reminder = await createReminder({ text, datetime });
        result = { success: true, reminder, message: `Напоминание создано: "${text}" на ${new Date(datetime).toLocaleString()}` };
        break;
      }
      case 'list': {
        const reminders = await listReminders();
        result = { success: true, reminders, count: reminders.length };
        break;
      }
      case 'delete': {
        const { id, text } = params || {};
        if (!id && !text) return sendJSON(res, 400, { error: 'Missing id or text' });
        await deleteReminder({ id, text });
        result = { success: true, message: 'Напоминание удалено' };
        break;
      }
      default:
        return sendJSON(res, 400, { error: `Unknown action: ${action}` });
    }

    debug(`[Reminder API] ${action}:`, JSON.stringify(result).slice(0, 150));
    return sendJSON(res, 200, result);
  }

  return null;
}

export function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}
