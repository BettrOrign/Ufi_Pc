import { dom } from './dom.js';
import { state } from './state.js';
import { scrollToBottom } from './ui-helpers.js';

export function addMessage(role, text) {
  if (dom.welcomeMsg) dom.welcomeMsg.remove();
  while (dom.chatContainer.children.length > 50) {
    dom.chatContainer.removeChild(dom.chatContainer.firstChild);
  }
  const div = document.createElement('div');
  div.className = 'message ' + role;
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'Siz' : 'Ufi';
  div.appendChild(label);
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  div.appendChild(content);
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  div.appendChild(time);
  dom.chatContainer.appendChild(div);
  dom.chatContainer.style.display = 'flex';
  scrollToBottom();
  return content;
}

export function addThinking() {
  const div = document.createElement('div');
  div.className = 'thinking';
  div.id = 'thinkingIndicator';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'thinking-dot';
    div.appendChild(dot);
  }
  dom.chatContainer.appendChild(div);
  scrollToBottom();
}

export function addToolMessage(cmd, stdout, stderr, exitCode) {
  if (dom.welcomeMsg) dom.welcomeMsg.remove();
  while (dom.chatContainer.children.length > 50) {
    dom.chatContainer.removeChild(dom.chatContainer.firstChild);
  }
  const div = document.createElement('div');
  div.className = 'message tool';
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = '\u{1F6E1} system';
  div.appendChild(label);
  const content = document.createElement('div');
  content.className = 'message-content tool-content';
  let html = `<span class="tool-cmd">${escapeHtml(cmd)}</span>`;
  if (stdout) html += `<pre class="tool-output">${escapeHtml(stdout)}</pre>`;
  if (stderr) html += `<pre class="tool-stderr">${escapeHtml(stderr)}</pre>`;
  html += `<span class="tool-exit">exit: ${exitCode ?? '-'}</span>`;
  content.innerHTML = html;
  div.appendChild(content);
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  div.appendChild(time);
  dom.chatContainer.appendChild(div);
  dom.chatContainer.style.display = 'flex';
  scrollToBottom();
}

export function addImageMessage(source) {
  if (dom.welcomeMsg) dom.welcomeMsg.remove();
  while (dom.chatContainer.children.length > 50) {
    dom.chatContainer.removeChild(dom.chatContainer.firstChild);
  }
  const div = document.createElement('div');
  div.className = 'message media-msg';

  // YouTube video → iframe
  const ytMatch = source.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) {
    const vid = ytMatch[1];
    div.innerHTML = `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe></div>`;
    const srcLabel = document.createElement('div');
    srcLabel.className = 'media-source';
    srcLabel.textContent = '📺 YouTube: ' + source;
    div.appendChild(srcLabel);
    dom.chatContainer.appendChild(div);
    dom.chatContainer.style.display = 'flex';
    scrollToBottom();
    return;
  }

  // Regular image — proxy through server to avoid CSP
  const imgSrc = source.startsWith('http')
    ? '/api/image-proxy?url=' + encodeURIComponent(source)
    : '/api/image?path=' + encodeURIComponent(source);

  const img = document.createElement('img');
  img.className = 'chat-image';
  img.src = imgSrc;
  img.alt = 'Image';
  img.loading = 'lazy';

  img.onerror = () => {
    div.className = 'message media-msg error';
    div.textContent = '❌ Image: ' + source;
  };
  div.appendChild(img);

  // Source label
  const srcLabel = document.createElement('div');
  srcLabel.className = 'media-source';
  srcLabel.textContent = '📷 ' + source;
  div.appendChild(srcLabel);

  dom.chatContainer.appendChild(div);
  dom.chatContainer.style.display = 'flex';
  scrollToBottom();
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function removeThinking() {
  const el = document.getElementById('thinkingIndicator');
  if (el) el.remove();
}

export function addStatusMsg(text) {
  if (dom.welcomeMsg) dom.welcomeMsg.remove();
  const div = document.createElement('div');
  div.className = 'message status-msg';
  div.textContent = text;
  dom.chatContainer.appendChild(div);
  dom.chatContainer.style.display = 'flex';
  scrollToBottom();
}

export async function sendTextMessage(text) {
  if (!text.trim() || state.ws?.readyState !== WebSocket.OPEN) return;
  addMessage('user', text);
  dom.userInput.value = '';
  dom.userInput.style.height = 'auto';
  addThinking();
  state.ws.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: text }] }],
      turnComplete: true
    }
  }));
  const silence = new Int16Array(1600);
  const silenceBytes = new Uint8Array(silence.buffer);
  let binary = '';
  for (let i = 0; i < silenceBytes.length; i++) {
    binary += String.fromCharCode(silenceBytes[i]);
  }
  state.ws.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{ data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }]
    }
  }));
  dom.sendBtn.disabled = true;
}
