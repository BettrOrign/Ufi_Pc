import { dom } from './dom.js';
import { state } from '../backend/state.js';

export function updateServiceStatus(name, status) {
  state.serviceStatus[name] = status;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const dot = dom[`statusDot${cap}`];
  const text = dom[`statusText${cap}`];
  if (dot) {
    dot.className = 'service-dot';
    if (status === 'connected') dot.classList.add('connected');
    else if (status === 'error') dot.classList.add('error');
  }
  if (text) {
    const labels = {
      gemini: 'AI', telegram: 'TG', browser: 'Br', mastra: 'Ma',
    };
    text.textContent = labels[name] || name;
  }
}

export function updateAuthService(serviceId, connected) {
  updateServiceStatus(serviceId, connected ? 'connected' : 'disconnected');
}
