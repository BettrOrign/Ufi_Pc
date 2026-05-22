import { dom } from './dom.js';
import { updateServiceStatus } from './sidebar.js';

export function setStatus(state, text) {
  // Update Gemini service status in sidebar
  if (state === 'connected') {
    updateServiceStatus('gemini', 'connected');
  } else if (state === 'error') {
    updateServiceStatus('gemini', 'error');
  } else {
    updateServiceStatus('gemini', 'disconnected');
  }

  // Legacy: also update old status elements if they exist
  if (dom.statusDot) {
    dom.statusDot.className = 'status-dot';
    if (state === 'connected') {
      dom.statusDot.classList.add('connected');
    } else if (state === 'error') {
      dom.statusDot.classList.add('error');
    }
  }
  if (dom.statusText) {
    dom.statusText.textContent = text;
  }
}

export function showError(msg) {
  dom.errorBanner.textContent = msg;
  dom.errorBanner.style.display = 'block';
  setTimeout(() => { dom.errorBanner.style.display = 'none'; }, 6000);
}

export function scrollToBottom() {
  dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}
