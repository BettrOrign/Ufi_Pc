import { debug, debugErr } from '../config.mjs';

const PENDING_MAX = 100;

export function handleGeminiWs(clientWs, WebSocket) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[GeminiProxy] No API key configured');
    clientWs.close(1011, 'Gemini API key not configured');
    return;
  }

  const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`;
  debug('[GeminiProxy] Connecting to Gemini...');

  const googleWs = new WebSocket(targetUrl, {
    headers: { 'X-Goog-Api-Key': apiKey },
  });
  let connected = false;
  let pendingMessages = [];

  clientWs.on('message', (data) => {
    const msgStr = data.toString().slice(0, 150);
    debug('[GeminiProxy] Client -> Google:', msgStr);

    if (googleWs.readyState === WebSocket.OPEN) {
      googleWs.send(data);
    } else {
      if (pendingMessages.length >= PENDING_MAX) {
        pendingMessages.shift();
      }
      pendingMessages.push(data);
      debug('[GeminiProxy] Buffered, pending:', pendingMessages.length);
    }
  });

  clientWs.on('close', () => {
    debug('[GeminiProxy] Client disconnected');
    googleWs.close();
  });

  googleWs.on('open', () => {
    debug('[GeminiProxy] Google connection OPEN');
    connected = true;
    debug('[GeminiProxy] Flushing', pendingMessages.length, 'buffered messages');
    for (const msg of pendingMessages) {
      googleWs.send(msg);
    }
    pendingMessages = [];

    googleWs.on('message', (data) => {
      const msgStr = data.toString().slice(0, 200);
      debug('[GeminiProxy] Google -> Client:', msgStr);

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      } else {
        debug('[GeminiProxy] Client not open, dropping message');
      }
    });

    googleWs.on('close', () => {
      debug('[GeminiProxy] Google disconnected');
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });
  });

  googleWs.on('error', (err) => {
    console.error('[GeminiProxy] Error:', err.message);
    if (!connected) {
      clientWs.close(1011, 'Failed to connect to Gemini');
    }
  });

  googleWs.on('unexpected-response', (req, res) => {
    console.error('[GeminiProxy] Unexpected response:', res.statusCode, res.statusMessage);
    clientWs.close(1011, 'Gemini rejected connection (check API key)');
  });
}
