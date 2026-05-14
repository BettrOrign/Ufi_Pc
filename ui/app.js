import { dom } from './dom.js';
import { state } from './state.js';
import { config, VOICES, getSettings, saveSettings } from './config.js';
import { showError } from './ui-helpers.js';
import { sendTextMessage } from './chat.js';
import { startListening, stopListening } from './audio-capture.js';
import { connectWebSocket } from './websocket.js';

window.onerror = function(msg, url, line, col, error) {
  console.error('[Global]', msg, error);
  showError('Xatolik: ' + (error?.message || msg));
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('[Promise]', e.reason);
  showError('Xatolik: ' + (e.reason?.message || e.reason));
});

dom.micBigBtn.addEventListener('click', () => {
  if (!state.isSessionActive) {
    showError('Hali ulanish tayyor emas. Kutib turing...');
    return;
  }
  if (state.isListening) {
    stopListening();
    dom.micBigBtn.closest('.mic-wrapper')?.classList.remove('listening');
  } else {
    startListening();
    dom.micBigBtn.closest('.mic-wrapper')?.classList.add('listening');
  }
});

dom.userInput.addEventListener('input', () => {
  dom.userInput.style.height = 'auto';
  dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 120) + 'px';
  dom.sendBtn.disabled = !dom.userInput.value.trim();
});

dom.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage(dom.userInput.value);
  }
});

dom.sendBtn.addEventListener('click', () => {
  sendTextMessage(dom.userInput.value);
});

console.log('[UI] Ufi Live starting...');
console.log('[UI] WebSocket URL:', config.WS_URL.slice(0, 50) + '...');
connectWebSocket();


// Settings modal
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const voiceSelect = document.getElementById('voiceSelect');
const systemPromptInput = document.getElementById('systemPromptInput');

// Populate voice dropdown
VOICES.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v.name;
  opt.textContent = v.name + ' — ' + v.desc;
  voiceSelect.appendChild(opt);
});

function openSettings() {
  const settings = getSettings();
  voiceSelect.value = settings.voiceName;
  systemPromptInput.value = settings.systemPrompt;
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  settingsModal.style.display = 'none';
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
cancelSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

saveSettingsBtn.addEventListener('click', () => {
  saveSettings({
    voiceName: voiceSelect.value,
    systemPrompt: systemPromptInput.value,
  });
  closeSettings();
  showError('Sozlamalar saqlandi. Qayta ulanmoqda...');
  if (state.ws) {
    state.ws.close();
  }
});

// === Mic particle animation ===
const canvas = document.getElementById('micCanvas');
if (canvas) {
  canvas.width = 300; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const RING_COUNT = 4;
  const PARTICLE_COUNT = 160;
  let micLevel = 0;
  let isActive = false;
  let time = 0;

  // Create orbiting particles
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ring = Math.floor(Math.random() * RING_COUNT);
    const radius = 40 + ring * 25 + Math.random() * 15;
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.3 + Math.random() * 0.5) * (ring % 2 === 0 ? 1 : -1);
    particles.push({
      radius, angle, speed, ring,
      size: 1.5 + Math.random() * 3,
      hue: 260 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      wobble: 3 + Math.random() * 8,
    });
  }

  // Central glow particles (extra bright ones near center)
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 30;
    particles.push({ radius, angle, speed: 0.5 + Math.random(), ring: -1, size: 4 + Math.random() * 5, hue: 280 + Math.random() * 40, phase: Math.random() * Math.PI * 2, wobble: 2 });
  }

  function draw() {
    const wrapper = document.getElementById('micWrapper');
    if (wrapper) {
      const level = parseFloat(wrapper.style.getPropertyValue('--mic-level')) || 0;
      micLevel = Math.max(micLevel * 0.85, level);
      isActive = wrapper.classList.contains('listening');
    }

    time += 0.016;
    const cx = 150, cy = 130;
    const active = isActive ? Math.max(0.1, micLevel) : 0;

    ctx.clearRect(0, 0, 300, 300);

    // Draw glow behind particles
    if (active > 0.05) {
      const gradient = ctx.createRadialGradient(cx, cy, 5, cx, cy, 60 + active * 40);
      gradient.addColorStop(0, 'hsla(280, 100%, 70%, ' + (active * 0.3) + ')');
      gradient.addColorStop(0.5, 'hsla(320, 100%, 60%, ' + (active * 0.15) + ')');
      gradient.addColorStop(1, 'hsla(220, 100%, 60%, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 300, 300);
    }

    // Draw particles
    particles.forEach(p => {
      p.angle += p.speed * 0.02 * (1 + active * 2);

      const activeRadius = active > 0.1
        ? p.radius * (1 + Math.sin(time * 2 + p.phase) * active * 0.15)
        : p.radius;

      const wobbleX = Math.sin(time * 1.5 + p.phase * 2) * p.wobble * active;
      const wobbleY = Math.cos(time * 1.3 + p.phase * 2) * p.wobble * active;

      const x = cx + Math.cos(p.angle) * activeRadius + wobbleX;
      const y = cy + Math.sin(p.angle) * activeRadius + wobbleY;

      const size = p.size * (1 + active * 2 * (0.5 + 0.5 * Math.sin(time * 3 + p.phase)));
      const hue = p.hue - active * 60 + Math.sin(time + p.phase) * 20;
      const light = 50 + active * 40;
      const alpha = 0.3 + active * 0.7;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + hue + ', 90%, ' + light + '%, ' + alpha + ')';
      ctx.shadowBlur = size * 3;
      ctx.shadowColor = 'hsla(' + (hue - 20) + ', 100%, 60%, ' + (alpha * 0.5) + ')';
      ctx.fill();
    });

    // Reset shadow for next frame
    ctx.shadowBlur = 0;

    requestAnimationFrame(draw);
  }

  draw();
}
