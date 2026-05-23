import { dom } from '../interface/dom.js';
import { state } from './state.js';
import { config, getSettings, GEMINI_TOOLS } from './config.js';
import { setStatus, showError, scrollToBottom } from '../interface/ui-helpers.js';
import { addMessage, addThinking, removeThinking, addToolMessage, addImageMessage, addAssistantMessage } from '../interface/chat.js';
import { renderMarkdown } from '../interface/markdown.js';
import { playAudio } from '../tools/audio-playback.js';
import { startScreenShare, stopScreenShare } from '../tools/screen-capture.js';
import { updateServiceStatus, updateAuthService } from '../interface/sidebar.js';

import { HANDLERS } from '../tools/handlers/index.js';
async function execTool(command, args, background) {
  const resp = await fetch('/api/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args: args || [], background: background || false }),
  });
  const data = await resp.json();
  return data;
}

function handleServerMessage(msg) {
  if (msg.setupComplete) {
    console.log('[WS] Setup complete!');
    state.isSessionActive = true;
    dom.micBigBtn.disabled = false;
    dom.micBigBtn.classList.remove('connecting');
    dom.micLabel.textContent = 'Gapirish uchun bosing';
    setStatus('connected', 'Tayyor');
    return;
  }
  if (msg.serverContent) {
    const sc = msg.serverContent;
    if (sc.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.inlineData?.data) playAudio(part.inlineData.data);
        if (part.text) {
          const text = part.text;
          removeThinking();
          if (!state.currentAssistantMsg) {
            state.currentAssistantMsg = addMessage('assistant', '');
          }
          state.accumulatedAssistantText += text;
          state.currentAssistantMsg.innerHTML = renderMarkdown(state.accumulatedAssistantText);
          scrollToBottom();
          console.log('[WS] Text:', text);
        }
      }
    }
    if (sc.outputTranscription?.text) {
      const text = sc.outputTranscription.text;
      console.log('[WS] Transcription:', text);
      removeThinking();
      if (!state.currentAssistantMsg) {
        state.currentAssistantMsg = addMessage('assistant', '');
      }
      state.accumulatedAssistantText += text;
      state.currentAssistantMsg.textContent = state.accumulatedAssistantText;
      scrollToBottom();
    }
    if (sc.turnComplete) {
      console.log('[WS] Turn complete');
      state.currentAssistantMsg = null;
      state.accumulatedAssistantText = '';
    }
    if (sc.inputTranscription?.text) {
      const text = sc.inputTranscription.text;
      console.log('[WS] User said:', text);
      addMessage('user', text);
      removeThinking();
      addThinking();
    }
  }
  if (msg.toolCall) {
    console.log('[WS] Tool call:', JSON.stringify(msg.toolCall, null, 2));
    Promise.all(msg.toolCall.functionCalls.map(async (fc) => {
      let result;
      try {
        const handler = HANDLERS[fc.name];
        if (handler) {
          result = await handler(fc.args);
        } else {
          result = { error: `Unknown tool: ${fc.name}` };
        }
      } catch (err) {
        result = { error: err.message };
      }
      return { id: fc.id, name: fc.name, response: result };
    })).then(functionResponses => {
      state.ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      console.log('[WS] Tool responses sent:', functionResponses.length);
    });
  }
  if (msg.usageMetadata) {
    console.log('[WS] Usage:', msg.usageMetadata);
  }
}

let coreWs = null;

export function connectCoreWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  coreWs = new WebSocket(`${protocol}//${location.host}/api/core/ws`);
  
  coreWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status' && data.services) {
        Object.entries(data.services).forEach(([name, info]) => {
          updateServiceStatus(name, info.status);
        });
      } else if (data.type === 'reminder') {
        showReminderNotification(data.text, data.datetime);
      } else if (data.type === 'auth') {
        updateAuthService(data.service, data.connected);
      }
    } catch (e) {
      console.error('[Core WS] Parse error:', e.message);
    }
  };
  
  coreWs.onclose = () => {
    setTimeout(connectCoreWebSocket, 10000);
  };
  
  coreWs.onerror = () => {
    coreWs.close();
  };
}

function showReminderNotification(text, datetime) {
  removeThinking();
  const div = document.createElement('div');
  div.className = 'message reminder-msg';
  div.innerHTML = `<div class="reminder-icon">⏰</div><div class="reminder-body"><div class="reminder-text">${escapeHtml(text)}</div><div class="reminder-time">${new Date(datetime).toLocaleString()}</div></div>`;
  dom.chatContainer.appendChild(div);
  dom.chatContainer.style.display = 'flex';
  scrollToBottom();
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Initial status fetch
fetch('/api/core/status')
  .then(r => r.json())
  .then(data => {
    if (data.services) {
      Object.entries(data.services).forEach(([name, info]) => {
        updateServiceStatus(name, info.status);
      });
    }
  })
  .catch(() => {});

export function connectWebSocket() {
  setStatus('connecting', 'Ulanish...');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}/api/gemini/ws`);
  state.ws.binaryType = 'blob';
  state.ws.onopen = () => {
    console.log('[WS] Connected');
    state.isConnected = true;
    setStatus('connected', 'Tayyor');
    dom.micBigBtn.classList.remove('connecting');
    dom.micLabel.textContent = 'Gapirish uchun bosing';
    const settings = getSettings();
    const setup = { setup: { model: config.MODEL, systemInstruction: { parts: [{ text: settings.systemPrompt }] }, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } } } }, tools: GEMINI_TOOLS } };
    state.ws.send(JSON.stringify(setup));
    console.log('[WS] Setup sent');
    connectCoreWebSocket();
  };
  state.ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        try { handleServerMessage(JSON.parse(reader.result)); }
        catch (e) { console.error('[WS] Parse error (binary):', e.message); }
      };
      reader.readAsText(event.data);
    } else {
      try { handleServerMessage(JSON.parse(event.data)); }
      catch (e) { console.error('[WS] Parse error (text):', e.message); }
    }
  };
  state.ws.onerror = () => {
    setStatus('error', 'Xatolik');
    showError('WebSocket xatosi');
  };
  state.ws.onclose = (e) => {
    console.log('[WS] Closed:', e.code, e.reason);
    state.isConnected = false;
    state.isSessionActive = false;
    setStatus('error', 'Uzildi');
    dom.micBigBtn.classList.add('connecting');
    dom.micBigBtn.disabled = true;
    dom.micLabel.textContent = 'Qayta ulanish...';
    setTimeout(connectWebSocket, 3000);
  };
}
