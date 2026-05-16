import { dom } from './dom.js';
import { state } from './state.js';
import { config, getSettings, GEMINI_TOOLS } from './config.js';
import { setStatus, showError, scrollToBottom } from './ui-helpers.js';
import { addMessage, addThinking, removeThinking, addToolMessage, addImageMessage } from './chat.js';
import { playAudio } from './audio-playback.js';
import { startScreenShare, stopScreenShare } from './screen-capture.js';

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
        if (part.text) console.log('[WS] Thought:', part.text);
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
      state.currentAssistantMsg.querySelector('.message-content').textContent = state.accumulatedAssistantText;
      scrollToBottom();
    }
    if (sc.turnComplete) {
      console.log('[WS] Turn complete');
      state.currentAssistantMsg = null;
      state.accumulatedAssistantText = '';
      dom.inputArea.classList.add('visible');
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
        if (fc.name === 'toggleScreenShare') {
          const { action } = fc.args;
          console.log('[WS] toggleScreenShare:', action);
          let res;
          if (action === 'start') {
            res = await startScreenShare();
          } else {
            res = stopScreenShare();
          }
          result = { result: res.message, error: res.success ? undefined : res.message };
        } else if (fc.name === 'mastraAgent') {
          const { agentId, task } = fc.args;
          console.log('[WS] mastraAgent:', agentId, task);
          const resp = await fetch('/api/mastra/agent/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId, task }),
          });
          const data = await resp.json();
          result = { result: data.result || data.error, error: data.error };
        } else if (fc.name === 'showImage') {
          const { source } = fc.args;
          console.log('[WS] showImage:', source);
          addImageMessage(source);
          result = { result: 'Image displayed: ' + source };
        } else if (fc.name === 'browserControl') {
          const { action, url, selector, text, direction, amount, ms } = fc.args;
          console.log('[WS] browserControl:', action);
          let args;
          switch (action) {
            case 'open': args = [url]; break;
            case 'click': args = [selector]; break;
            case 'type': args = [selector, text || '']; break;
            case 'scroll': args = [direction || 'down', String(amount || 400)]; break;
            case 'extract': args = []; break;
            case 'wait': args = [String(ms || 1000)]; break;
            case 'close': args = []; break;
            default: args = [];
          }
          const resp = await fetch('/api/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'node', args: ['browser-control.mjs', action, ...args] }),
          });
          const data = await resp.json();
          result = { result: data.stdout || data.error, error: data.error };
        } else {
          const { command, args, background } = fc.args;
          console.log('[WS] systemCommand:', command, (args || []).join(' '));
          const resp = await fetch('/api/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, args: args || [], background: background || false }),
          });
          const data = await resp.json();
          result = { stdout: data.stdout, stderr: data.stderr, exitCode: data.exitCode, error: data.error };
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

export function connectWebSocket() {
  setStatus('connecting', 'Ulanish...');
  state.ws = new WebSocket(config.WS_URL);
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
