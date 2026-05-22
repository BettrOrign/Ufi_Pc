import { dom } from './dom.js';
import { state } from '../backend/state.js';
import { config, VOICES, getSettings, saveSettings, CORE_THEMES } from '../backend/config.js';
import { showError } from './ui-helpers.js';
import { sendTextMessage } from './chat.js';
import { startListening, stopListening } from '../tools/audio-capture.js';
import { connectWebSocket } from '../backend/websocket.js';
import { initSidebar, toggleSidebar } from './sidebar.js';
import { initChips } from './quick-actions.js';

window.onerror = function(msg, url, line, col, error) {
  console.error('[Global]', msg, error);
  showError('Xatolik: ' + (error?.message || msg));
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('[Promise]', e.reason);
  showError('Xatolik: ' + (e.reason?.message || e.reason));
});

document.getElementById('nucleusWrapper').addEventListener('click', () => {
  if (!state.isSessionActive) {
    showError('Hali ulanish tayyor emas. Kutib turing...');
    return;
  }
  if (state.isListening) {
    stopListening();
    document.getElementById('nucleusWrapper')?.classList.remove('listening');
  } else {
    startListening();
    document.getElementById('nucleusWrapper')?.classList.add('listening');
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
console.log('[UI] WebSocket URL:', config.WS_URL ? config.WS_URL.slice(0, 50) + '...' : '(proxied via /api/gemini/ws)');
connectWebSocket();
initSidebar();
initChips();


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
    coreTheme: state.coreTheme,
    coreSpeed: state.coreSpeed,
    coreSensitivity: state.coreSensitivity,
    coreHue: state.coreHue,
  });
  closeSettings();
  showError('Sozlamalar saqlandi. Qayta ulanmoqda...');
  if (state.ws) {
    state.ws.close();
  }
});

// === Core Settings UI ===
// Load saved settings into state
const savedSet = getSettings();
if (savedSet.coreTheme) state.coreTheme = savedSet.coreTheme;
if (savedSet.coreSpeed) state.coreSpeed = savedSet.coreSpeed;
if (savedSet.coreSensitivity) state.coreSensitivity = savedSet.coreSensitivity;
if (savedSet.coreHue !== undefined) state.coreHue = savedSet.coreHue;

// Theme buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
  if (btn.dataset.theme === state.coreTheme) btn.classList.add('active');
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.coreTheme = btn.dataset.theme;
  });
});

// Range sliders — update state live
['coreSpeed','coreSensitivity','coreHue'].forEach(id => {
  const el = document.getElementById(id);
  const disp = document.getElementById(id === 'coreSpeed' ? 'speedDisp' : id === 'coreSensitivity' ? 'sensDisp' : 'hueDisp');
  if (el) {
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      state[id] = val;
      if (disp) disp.textContent = val;
    });
  }
});

// Feature cards
document.getElementById('featureCards')?.addEventListener('click', (e) => {
  const card = e.target.closest('.feature-card');
  if (!card) return;
  const action = card.dataset.action;
  if (action === 'mic') {
    document.getElementById('nucleusWrapper')?.click();
    return;
  }
  const prompts = {
    weather: "Проверь погоду в Москве",
    search: "Найди в интернете информацию о ",
    'tg-send': "Отправь сообщение в избранные: ",
    'tg-read': "Покажи последние сообщения из Telegram",
    youtube: "Найди на YouTube видео: ",
    browse: "Открой сайт: ",
  };
  const text = prompts[action] || action;
  if (text.endsWith(': ')) {
    dom.userInput.value = text;
    dom.userInput.focus();
  } else {
    sendTextMessage(text);
  }
});

// Command Palette (Ctrl+K)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    toggleCommandPalette();
  }
  if (e.key === 'Escape') {
    closeCommandPalette();
  }
});

function toggleCommandPalette() {
  if (!dom.commandPalette) return;
  const isOpen = dom.commandPalette.style.display !== 'none';
  if (isOpen) closeCommandPalette();
  else openCommandPalette();
}

function openCommandPalette() {
  dom.commandPalette.style.display = 'flex';
  dom.commandInput.value = '';
  dom.commandInput.focus();
  renderCommands(state.commands);
}

function closeCommandPalette() {
  if (dom.commandPalette) dom.commandPalette.style.display = 'none';
}

function renderCommands(commands) {
  dom.commandResults.innerHTML = commands.map(cmd =>
    `<div class="command-item" data-command-id="${cmd.id}">
      <span>${cmd.name}</span>
    </div>`
  ).join('');
  
  dom.commandResults.querySelectorAll('.command-item').forEach(el => {
    el.addEventListener('click', () => executeCommand(el.dataset.commandId));
  });
  
  // Filter on input
  dom.commandInput.oninput = () => {
    const q = dom.commandInput.value.toLowerCase();
    dom.commandResults.querySelectorAll('.command-item').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  };
}

function executeCommand(id) {
  closeCommandPalette();
  const actions = {
    'weather': () => sendTextMessage("Проверь погоду в Москве"),
    'search': () => { dom.userInput.value = "Найди в интернете информацию о "; dom.userInput.focus(); },
    'tg-send': () => { dom.userInput.value = "Отправь сообщение в избранные: "; dom.userInput.focus(); },
    'tg-read': () => sendTextMessage("Покажи последние сообщения из Telegram"),
    'youtube': () => { dom.userInput.value = "Найди на YouTube видео: "; dom.userInput.focus(); },
    'browse': () => { dom.userInput.value = "Открой сайт: "; dom.userInput.focus(); },
    'settings': () => document.getElementById('settingsBtn')?.click(),
    'toggle-sidebar': () => toggleSidebar(),
    'clear-chat': () => { dom.chatContainer.innerHTML = ''; dom.welcomeMsg.style.display = 'flex'; },
  };
  const action = actions[id];
  if (action) action();
}

// === Neon Nucleus Animation ===
const canvas = document.getElementById('nucleusCanvas');
if (canvas) {
  const SZ = 160;
  canvas.width = SZ; canvas.height = SZ;
  const ctx = canvas.getContext('2d');
  const cx = SZ/2, cy = SZ/2;
  const theme = (typeof CORE_THEMES !== 'undefined' && CORE_THEMES[state.coreTheme]) ? CORE_THEMES[state.coreTheme] : CORE_THEMES.nebula;
  let t = 0, micLevel = 0, isListening = false, isPlaying = false;

  const orbits = [
    { radius: 45, segments: 8, gapSize: 0.3, speed: 0.4, width: 2.5, hue: 180 },
    { radius: 58, segments: 5, gapSize: 0.5, speed: -0.25, width: 2, hue: 300 },
    { radius: 35, segments: 12, gapSize: 0.15, speed: 0.6, width: 1.5, hue: 120 },
    { radius: 65, segments: 3, gapSize: 0.7, speed: -0.15, width: 3, hue: 40 },
  ];

  // Trail particles
  const trailParticles = [];
  const MAX_TRAIL = 50;

  function draw() {
    const wrapper = document.getElementById('nucleusWrapper');
    if (wrapper) {
      const lv = parseFloat(wrapper.style.getPropertyValue('--mic-level')) || 0;
      const sens = state.coreSensitivity || 1.0;
      micLevel = Math.max(micLevel * 0.88, lv * sens);
      isListening = wrapper.classList.contains('listening');
    }
    isPlaying = state.isPlaying || false;
    t += 0.016;
    const spd = state.coreSpeed || 1.0;
    const active = (isListening && micLevel > 0.02) || isPlaying;

    ctx.clearRect(0, 0, SZ, SZ);

    // 1. Background glow
    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 75);
    const bgIntensity = active ? 0.12 : 0.04;
    bgGlow.addColorStop(0, `rgba(0, 240, 255, ${bgIntensity})`);
    bgGlow.addColorStop(0.5, `rgba(100, 0, 255, ${bgIntensity * 0.5})`);
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, SZ, SZ);

    // 2. Energy pulses (expanding rings)
    const pulseCount = active ? 2 + Math.floor(micLevel * 3) : 1;
    for (let i = 0; i < pulseCount; i++) {
      const pulsePhase = (t * 0.8 + i * 1.5) % 1;
      const pulseRadius = 15 + pulsePhase * 65;
      const pulseAlpha = (1 - pulsePhase) * (active ? 0.3 + micLevel * 0.3 : 0.1);
      
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 240, 255, ${pulseAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(0, 240, 255, ${pulseAlpha * 0.5})`;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 3. Orbiting segmented rings with trails
    orbits.forEach((orb) => {
      const angle = t * orb.speed * spd;
      const segAngle = (Math.PI * 2) / orb.segments;
      const gapAngle = segAngle * orb.gapSize;
      const fillAngle = segAngle - gapAngle;
      const hueShift = isPlaying ? 0 : (isListening ? 20 : 0);

      for (let i = 0; i < orb.segments; i++) {
        const startAngle = angle + i * segAngle + gapAngle / 2;
        const endAngle = startAngle + fillAngle;

        // Glow layer
        ctx.beginPath();
        ctx.arc(cx, cy, orb.radius, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${orb.hue + hueShift}, 100%, ${active ? 75 : 50}%, ${active ? 0.3 : 0.1})`;
        ctx.lineWidth = orb.width + 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsla(${orb.hue + hueShift}, 100%, 60%, ${active ? 0.4 : 0.1})`;
        ctx.stroke();

        // Core layer
        ctx.beginPath();
        ctx.arc(cx, cy, orb.radius, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${orb.hue + hueShift}, 100%, ${active ? 85 : 60}%, ${active ? 0.9 : 0.4})`;
        ctx.lineWidth = orb.width;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Add trail particles at segment tips
        if (active && Math.random() < 0.3) {
          const tipAngle = endAngle;
          const tx = cx + Math.cos(tipAngle) * orb.radius;
          const ty = cy + Math.sin(tipAngle) * orb.radius;
          trailParticles.push({
            x: tx, y: ty,
            vx: -Math.sin(tipAngle) * 0.5,
            vy: Math.cos(tipAngle) * 0.5,
            life: 1,
            hue: orb.hue,
            size: orb.width * 0.8,
          });
        }
      }
    });

    // 4. Update and draw trail particles
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
      p.size *= 0.98;

      if (p.life <= 0 || p.size < 0.1) {
        trailParticles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.life * 0.6})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${p.life * 0.4})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Cap trail particles
    while (trailParticles.length > MAX_TRAIL) trailParticles.shift();

    // 5. Interference patterns (bright spots at ring intersections)
    if (active) {
      for (let i = 0; i < orbits.length; i++) {
        for (let j = i + 1; j < orbits.length; j++) {
          const angle_i = t * orbits[i].speed * spd;
          const angle_j = t * orbits[j].speed * spd;
          // Multiple intersection points
          for (let k = 0; k < 4; k++) {
            const intAngle = (angle_i + angle_j) / 2 + k * Math.PI / 2;
            // Inner intersection
            const ix = cx + Math.cos(intAngle) * (orbits[i].radius * 0.7 + orbits[j].radius * 0.3);
            const iy = cy + Math.sin(intAngle) * (orbits[i].radius * 0.7 + orbits[j].radius * 0.3);
            ctx.beginPath();
            ctx.arc(ix, iy, 1.5 + micLevel * 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + micLevel * 0.3})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = `rgba(0, 240, 255, ${micLevel * 0.5})`;
            ctx.fill();
          }
        }
      }
      ctx.shadowBlur = 0;
    }

    // 6. Radar scan line
    const scanAngle = t * 0.5 * spd;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 75, scanAngle - 0.3, scanAngle);
    ctx.closePath();
    ctx.fillStyle = `rgba(0, 240, 255, ${active ? 0.04 : 0.015})`;
    ctx.fill();

    // Scan line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(scanAngle) * 75, cy + Math.sin(scanAngle) * 75);
    ctx.strokeStyle = `rgba(0, 240, 255, ${active ? 0.15 : 0.05})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 7. Central core orb (enhanced)
    const coreSize = 16 + (active ? micLevel * 10 : 0);
    const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 1.5);
    
    if (isPlaying) {
      coreGlow.addColorStop(0, 'rgba(0, 255, 255, 0.95)');
      coreGlow.addColorStop(0.3, 'rgba(0, 200, 255, 0.7)');
      coreGlow.addColorStop(0.6, 'rgba(0, 100, 200, 0.3)');
      coreGlow.addColorStop(1, 'rgba(0, 50, 100, 0)');
    } else if (isListening && micLevel > 0.02) {
      coreGlow.addColorStop(0, `rgba(255, 0, 200, ${0.7 + micLevel * 0.3})`);
      coreGlow.addColorStop(0.3, `rgba(200, 0, 150, ${0.5 + micLevel * 0.3})`);
      coreGlow.addColorStop(0.6, `rgba(100, 0, 100, ${0.2 + micLevel * 0.2})`);
      coreGlow.addColorStop(1, 'rgba(50, 0, 50, 0)');
    } else {
      coreGlow.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
      coreGlow.addColorStop(0.4, 'rgba(0, 150, 200, 0.12)');
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.shadowBlur = active ? 30 : 10;
    ctx.shadowColor = isPlaying
      ? `rgba(0, 240, 255, ${0.4 + micLevel * 0.5})`
      : `rgba(255, 0, 200, ${0.15 + micLevel * 0.4})`;
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fillStyle = coreGlow;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Core inner bright spot
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 3, coreSize * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${active ? 0.3 : 0.1})`;
    ctx.fill();

    // 8. Volume indicator ring (enhanced)
    const volRadius = 74;
    const volWidth = 1.5 + micLevel * 5;
    const volAlpha = 0.15 + micLevel * 0.7;

    if (micLevel > 0.01) {
      // Glow
      ctx.beginPath();
      ctx.arc(cx, cy, volRadius, 0, Math.PI * 2 * Math.min(1, micLevel * 2));
      ctx.strokeStyle = `rgba(0, 255, 136, ${volAlpha * 0.3})`;
      ctx.lineWidth = volWidth + 4;
      ctx.shadowBlur = 20;
      ctx.shadowColor = `rgba(0, 255, 136, ${volAlpha * 0.3})`;
      ctx.stroke();

      // Core stroke
      ctx.beginPath();
      ctx.arc(cx, cy, volRadius, 0, Math.PI * 2 * Math.min(1, micLevel * 2));
      ctx.strokeStyle = `rgba(0, 255, 136, ${volAlpha})`;
      ctx.lineWidth = volWidth;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // Volume dots along the ring
      const dotCount2 = Math.floor(micLevel * 12);
      for (let i = 0; i < dotCount2; i++) {
        const dotAngle2 = (i / dotCount2) * Math.PI * 2 * Math.min(1, micLevel * 2);
        const dx2 = cx + Math.cos(dotAngle2) * volRadius;
        const dy2 = cy + Math.sin(dotAngle2) * volRadius;
        ctx.beginPath();
        ctx.arc(dx2, dy2, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 136, ${volAlpha * 0.8})`;
        ctx.fill();
      }
    }

    // 9. Orbiting dots with pulse
    const dotCount = 4 + Math.floor(micLevel * 8);
    for (let i = 0; i < dotCount; i++) {
      const dotPhase = (t * 0.15 + i * 0.1) % 1;
      const dotAngle = t * (0.2 + i * 0.03) * spd + i * (Math.PI * 2 / dotCount);
      const orbitRadius = 28 + Math.sin(dotPhase * Math.PI * 2) * 22;
      const dx = cx + Math.cos(dotAngle) * orbitRadius;
      const dy = cy + Math.sin(dotAngle) * orbitRadius;
      const dotSize = 0.8 + micLevel * 2.5 + (1 - dotPhase) * 0.5;

      // Glow
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize + 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(i * 60 + t * 20) % 360}, 100%, 70%, ${0.1 + micLevel * 0.3})`;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsla(${(i * 60 + t * 20) % 360}, 100%, 60%, ${0.3 + micLevel * 0.4})`;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(i * 60 + t * 20) % 360}, 100%, 85%, ${0.5 + micLevel * 0.5})`;
      ctx.shadowBlur = 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (animActive) requestAnimationFrame(draw);
  }

  let animActive = true;
  document.addEventListener('visibilitychange', () => {
    animActive = !document.hidden;
    if (!document.hidden) draw();
  });
  draw();
}
