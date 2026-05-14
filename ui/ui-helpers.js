import { dom } from './dom.js';

export function setStatus(state, text) {
  dom.statusDot.className = 'status-dot';
  if (state === 'connected') {
    dom.statusDot.classList.add('connected');
  } else if (state === 'error') {
    dom.statusDot.classList.add('error');
  }
  dom.statusText.textContent = text;
}

export function showError(msg) {
  dom.errorBanner.textContent = msg;
  dom.errorBanner.style.display = 'block';
  setTimeout(() => { dom.errorBanner.style.display = 'none'; }, 6000);
}

export function scrollToBottom() {
  dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}
