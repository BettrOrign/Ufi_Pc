import { updateServiceStatus } from './sidebar.js';

export function setStatus(state, text) {
  if (state === 'connected') {
    updateServiceStatus('gemini', 'connected');
  } else if (state === 'error') {
    updateServiceStatus('gemini', 'error');
  } else {
    updateServiceStatus('gemini', 'disconnected');
  }
}

export function showError(msg) {
  const el = document.getElementById('errorBanner');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
  }
}

export function scrollToBottom() {
  const el = document.getElementById('chatContainer');
  if (el) el.scrollTop = el.scrollHeight;
}
