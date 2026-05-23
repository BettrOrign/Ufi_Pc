import { dom } from './dom.js';
import { state } from '../backend/state.js';
import { config, VOICES, getSettings, saveSettings, CORE_THEMES } from '../backend/config.js';
import { showError } from './ui-helpers.js';
import { sendTextMessage } from './chat.js';
import { startListening, stopListening } from '../tools/audio-capture.js';
import { connectWebSocket } from '../backend/websocket.js';
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

// Restore range slider positions from saved state
['coreSpeed','coreSensitivity','coreHue'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.value = state[id];
});
// Restore display values
const speedDisp = document.getElementById('speedDisp');
const sensDisp = document.getElementById('sensDisp');
const hueDisp = document.getElementById('hueDisp');
if (speedDisp) speedDisp.textContent = state.coreSpeed;
if (sensDisp) sensDisp.textContent = state.coreSensitivity;
if (hueDisp) hueDisp.textContent = state.coreHue;

// Theme buttons
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  state.coreTheme = theme;
  
  // Set layout variant per theme
  const layoutMap = {
    hearth: 'center', forest: 'center', ocean: 'compact',
    dawn: 'minimal', ember: 'left', frost: 'center',
    lavender: 'center', noir: 'compact', sand: 'minimal', aurora: 'full'
  };
  document.documentElement.dataset.layout = layoutMap[theme] || 'center';
  
  // Set nucleus mode per theme
  const nucleusMap = {
    hearth: 'glow', forest: 'hex', ocean: 'float',
    dawn: 'circular', ember: 'diamond', frost: 'minimal',
    lavender: 'float', noir: 'minimal', sand: 'circular', aurora: 'diamond'
  };
  document.documentElement.dataset.nucleus = nucleusMap[theme] || 'glow';
}

// Clear and populate theme grid from config
const themeGrid = document.getElementById('themeGrid');
if (themeGrid) {
  themeGrid.innerHTML = ''; // Clear existing
  const themeNames = ['hearth','forest','ocean','dawn','ember','frost','lavender','noir','sand','aurora'];
  const themeLabels = { hearth:'Hearth', forest:'Forest', ocean:'Ocean', dawn:'Dawn', ember:'Ember', frost:'Frost', lavender:'Lavender', noir:'Noir', sand:'Sand', aurora:'Aurora' };
  const themeColors = { hearth:'#ff7b45', forest:'#4ade80', ocean:'#22d3ee', dawn:'#fb7185', ember:'#ff3333', frost:'#93c5fd', lavender:'#a78bfa', noir:'#ffffff', sand:'#d4a574', aurora:'#34d399' };
  
  themeNames.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.dataset.theme = t;
    btn.style.setProperty('--tc', themeColors[t]);
    btn.textContent = themeLabels[t];
    if (t === state.coreTheme) btn.classList.add('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(t);
    });
    themeGrid.appendChild(btn);
  });
}
// Apply saved theme on load
if (savedSet.coreTheme) applyTheme(savedSet.coreTheme);

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

  // Cached CSS variable reads — avoids getComputedStyle per frame
  const cssCache = { accentR: 255, accentG: 123, accentB: 69 };
  function readAccentColors() {
    const s = getComputedStyle(document.documentElement);
    cssCache.accentR = parseInt(s.getPropertyValue('--accent-r')) || 255;
    cssCache.accentG = parseInt(s.getPropertyValue('--accent-g')) || 123;
    cssCache.accentB = parseInt(s.getPropertyValue('--accent-b')) || 69;
  }
  readAccentColors();
  // Re-read on theme change
  new MutationObserver(readAccentColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let t = 0, micLevel = 0, isListening = false, isPlaying = false;
  let prevHudState = '';

  // Burst particles on click — capped at 80
  const burstParticles = [];
  const MAX_BURST = 80;
  // Circular waveform frequency data — pre-computed LUT
  const NUM_BARS = 36;
  const freqData = new Float32Array(NUM_BARS);
  const freqLUT1 = new Float32Array(NUM_BARS);
  const freqLUT2 = new Float32Array(NUM_BARS);
  const freqLUT3 = new Float32Array(NUM_BARS);
  for (let i = 0; i < NUM_BARS; i++) {
    freqData[i] = 0.5;
    freqLUT1[i] = Math.sin(i * 0.3) * 0.5 + 0.5;
    freqLUT2[i] = Math.sin(i * 0.7) * 0.3 + 0.3;
    freqLUT3[i] = Math.sin(i * 1.1) * 0.2 + 0.2;
  }

  const orbits = [
    { radius: 45, segments: 8, gapSize: 0.3, speed: 0.4, width: 2.5 },
    { radius: 58, segments: 5, gapSize: 0.5, speed: -0.25, width: 2 },
    { radius: 35, segments: 12, gapSize: 0.15, speed: 0.6, width: 1.5 },
    { radius: 65, segments: 3, gapSize: 0.7, speed: -0.15, width: 3 },
  ];

  // RGB to HSL helper for theme-aware orbit colors
  function rgbToHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return h;
  }

  // Trail particles
  const trailParticles = [];
  const MAX_TRAIL = 50;

  // Observe --mic-level style changes instead of reading DOM every frame
  const wrapperEl = document.getElementById('nucleusWrapper');
  let micLevelRaw = 0;
  if (wrapperEl) {
    new MutationObserver(() => {
      micLevelRaw = parseFloat(wrapperEl.style.getPropertyValue('--mic-level')) || 0;
    }).observe(wrapperEl, { attributes: true, attributeFilter: ['style'] });
  }

  function draw() {
    const wrapper = wrapperEl;
    if (wrapper) {
      const sens = state.coreSensitivity || 1.0;
      micLevel = Math.max(micLevel * 0.88, micLevelRaw * sens);
      isListening = wrapper.classList.contains('listening');
    }
    isPlaying = state.isPlaying || false;
    t += 0.016;
    const spd = state.coreSpeed || 1.0;
    const active = (isListening && micLevel > 0.02) || isPlaying;
    const activeFactor = active ? 1 : 0;

    ctx.clearRect(0, 0, SZ, SZ);

    // Cached accent colors (re-read only on theme change via MutationObserver)
    const accentR = cssCache.accentR;
    const accentG = cssCache.accentG;
    const accentB = cssCache.accentB;
    const baseHue = rgbToHue(accentR, accentG, accentB);
    const orbHues = [baseHue, (baseHue + 60) % 360, (baseHue + 300) % 360, (baseHue + 30) % 360];

    // 1. Background glow
    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 75);
    const bgIntensity = active ? 0.12 : 0.04;
    bgGlow.addColorStop(0, `rgba(${accentR}, ${accentG}, ${accentB}, ${bgIntensity})`);
    bgGlow.addColorStop(0.5, `rgba(${Math.floor(accentR * 0.4)}, ${Math.floor(accentG * 0.3)}, ${Math.floor(accentB * 0.8)}, ${bgIntensity * 0.5})`);
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, SZ, SZ);

    // 2. Energy pulses (expanding rings) — composite glow
    const pulseCount = active ? 2 + Math.floor(micLevel * 3) : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pulseCount; i++) {
      const pulsePhase = (t * 0.8 + i * 1.5) % 1;
      const pulseRadius = 15 + pulsePhase * 65;
      const pulseAlpha = (1 - pulsePhase) * (active ? 0.3 + micLevel * 0.3 : 0.1);
      
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${pulseAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = `rgba(${accentR}, ${accentG}, ${accentB}, ${pulseAlpha * 0.6})`;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // 3. Orbiting segmented rings with trails + per-segment flicker
    const hueShift = isPlaying ? 0 : (isListening ? 20 : 0);
    const glowL = activeFactor ? 75 : 50;
    const glowA = activeFactor ? 0.3 : 0.1;
    const glowSA = activeFactor ? 0.4 : 0.1;
    const coreL = activeFactor ? 85 : 60;
    const coreA = activeFactor ? 0.9 : 0.4;
    // Random roll for trail particles — deterministic stepping avoids Math.random() per segment
    const trailRoll = (t * 4) % 1;

    const orbTime = t * 2;
    for (let orbIdx = 0; orbIdx < orbits.length; orbIdx++) {
      const orb = orbits[orbIdx];
      const angle = t * orb.speed * spd;
      const segAngle = (Math.PI * 2) / orb.segments;
      const gapAngle = segAngle * orb.gapSize;
      const fillAngle = segAngle - gapAngle;

      for (let i = 0; i < orb.segments; i++) {
        const startAngle = angle + i * segAngle + gapAngle / 2;
        const endAngle = startAngle + fillAngle;
        // Per-segment flicker: subtle alpha oscillation per segment
        const flicker = 0.7 + 0.3 * Math.sin(orbTime * (0.6 + orbIdx * 0.2) + i * 1.7);

        // Glow layer
        ctx.beginPath();
        ctx.arc(cx, cy, orb.radius, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${orbHues[orbIdx] + hueShift}, 100%, ${glowL}%, ${glowA * flicker})`;
        ctx.lineWidth = orb.width + 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsla(${orbHues[orbIdx] + hueShift}, 100%, 60%, ${glowSA * flicker})`;
        ctx.stroke();

        // Core layer
        ctx.beginPath();
        ctx.arc(cx, cy, orb.radius, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${orbHues[orbIdx] + hueShift}, 100%, ${coreL}%, ${coreA * flicker})`;
        ctx.lineWidth = orb.width;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Add trail particles at segment tips (deterministic stepping)
        if (activeFactor) {
          const si = (orbIdx * 7 + i * 3);
          if (((trailRoll * 100 + si) % 10) < 3) {
            const tipAngle = endAngle;
            const tx = cx + Math.cos(tipAngle) * orb.radius;
            const ty = cy + Math.sin(tipAngle) * orb.radius;
            trailParticles.push({
              x: tx, y: ty,
              vx: -Math.sin(tipAngle) * 0.5,
              vy: Math.cos(tipAngle) * 0.5,
              life: 1,
              hue: orbHues[orbIdx],
              size: orb.width * 0.8,
              seed: (orbIdx * 13 + i * 7) % 360,
            });
          }
        }
      }
    }

    // 4. Update and draw trail particles — eased decay with micro hue shift
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= 0.025;
      p.size *= 0.97;

      if (p.life <= 0 || p.size < 0.1) {
        trailParticles.splice(i, 1);
        continue;
      }

      const easeLife = p.life * p.life; // ease-out quad
      const hueShift = Math.sin(p.life * 20 + p.seed) * 15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `hsla(${p.hue + hueShift}, 100%, 80%, ${easeLife * 0.5})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${easeLife * 0.3})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // Cap trail particles
    while (trailParticles.length > MAX_TRAIL) trailParticles.shift();

    // 4b. Click burst particles — with gravity and rotation
    for (let i = burstParticles.length - 1; i >= 0; i--) {
      const p = burstParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.vy += 0.01; // micro gravity
      p.rot += p.vx * 0.02;
      p.life -= 0.02;
      p.size *= 0.985;
      if (p.life <= 0 || p.size < 0.1) { burstParticles.splice(i, 1); continue; }
      const easeLife = p.life * p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${easeLife * 0.6})`;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${easeLife * 0.3})`;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // 5. Interference patterns (bright spots at ring intersections) — composite glow
    if (active) {
      const spotR = Math.min(255, accentR + 100);
      const spotG = Math.min(255, accentG + 100);
      const spotB = Math.min(255, accentB + 100);
      const spotA = 0.2 + micLevel * 0.3;
      const spotSz = 1.5 + micLevel * 2;
      const oscA = micLevel * 0.5;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < orbits.length; i++) {
        const oi = orbits[i];
        for (let j = i + 1; j < orbits.length; j++) {
          const oj = orbits[j];
          const angle_i = t * oi.speed * spd;
          const angle_j = t * oj.speed * spd;
          const avgAngle = (angle_i + angle_j) * 0.5;
          const avgRadius = oi.radius * 0.7 + oj.radius * 0.3;
          for (let k = 0; k < 4; k += 2) {
            const intAngle = avgAngle + k;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(intAngle) * avgRadius, cy + Math.sin(intAngle) * avgRadius, spotSz, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${spotR},${spotG},${spotB},${spotA})`;
            ctx.shadowBlur = 12;
            ctx.shadowColor = `rgba(${accentR},${accentG},${accentB},${oscA})`;
            ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
    }

    // 6. Radar scan line — composite glow
    const scanAngle = t * 0.5 * spd;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 75, scanAngle - 0.4, scanAngle);
    ctx.closePath();
    ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${active ? 0.06 : 0.02})`;
    ctx.fill();

    // Scan line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(scanAngle) * 75, cy + Math.sin(scanAngle) * 75);
    ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${active ? 0.2 : 0.07})`;
    ctx.shadowBlur = 6;
    ctx.shadowColor = `rgba(${accentR}, ${accentG}, ${accentB}, ${active ? 0.15 : 0.05})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // 7. Central core orb — breathing + composite glow
    const breathe = 1 + Math.sin(t * 0.5) * 0.03;
    const coreSize = (16 + (active ? micLevel * 10 : 0)) * breathe;
    const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 1.6);
    
    if (isPlaying) {
      coreGlow.addColorStop(0, `rgba(${accentR}, ${accentG}, ${accentB}, 0.95)`);
      coreGlow.addColorStop(0.3, `rgba(${accentR}, ${Math.floor(accentG * 0.8)}, ${accentB}, 0.7)`);
      coreGlow.addColorStop(0.6, `rgba(${Math.floor(accentR * 0.4)}, ${Math.floor(accentG * 0.4)}, ${Math.floor(accentB * 0.8)}, 0.3)`);
      coreGlow.addColorStop(1, `rgba(${Math.floor(accentR * 0.2)}, ${Math.floor(accentG * 0.2)}, ${Math.floor(accentB * 0.4)}, 0)`);
    } else if (isListening && micLevel > 0.02) {
      const micBoost = 0.6 + micLevel * 0.4;
      coreGlow.addColorStop(0, `rgba(${accentR}, ${Math.floor(accentG * 0.5)}, ${accentB}, ${micBoost})`);
      coreGlow.addColorStop(0.3, `rgba(${Math.floor(accentR * 0.8)}, ${Math.floor(accentG * 0.3)}, ${Math.floor(accentB * 0.8)}, ${micBoost * 0.8})`);
      coreGlow.addColorStop(0.6, `rgba(${Math.floor(accentR * 0.4)}, 0, ${Math.floor(accentB * 0.4)}, ${micBoost * 0.4})`);
      coreGlow.addColorStop(1, `rgba(${Math.floor(accentR * 0.2)}, 0, ${Math.floor(accentB * 0.2)}, 0)`);
    } else {
      coreGlow.addColorStop(0, `rgba(${accentR}, ${accentG}, ${accentB}, ${0.2 + Math.sin(t * 0.3) * 0.05})`);
      coreGlow.addColorStop(0.4, `rgba(${Math.floor(accentR * 0.6)}, ${Math.floor(accentG * 0.6)}, ${Math.floor(accentB * 0.8)}, ${0.1 + Math.sin(t * 0.4) * 0.03})`);
      coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.shadowBlur = active ? 30 : 10;
    ctx.shadowColor = isPlaying
      ? `rgba(${accentR}, ${accentG}, ${accentB}, ${0.4 + micLevel * 0.5})`
      : `rgba(${Math.floor(accentR * 0.8)}, 0, ${Math.floor(accentB * 0.7)}, ${0.15 + micLevel * 0.4})`;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fillStyle = coreGlow;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Core inner bright spot
    ctx.beginPath();
    ctx.arc(cx - 3 + Math.sin(t * 0.7) * 1.5, cy - 3 + Math.cos(t * 0.5) * 1, coreSize * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${active ? 0.35 : 0.12})`;
    ctx.fill();

    // 8. Circular spectrogram waveform — position-weighted opacity, composite glow
    const waveRadius = 72;
    const barMaxH = 20;
    const barW = (Math.PI * 2 * waveRadius) / NUM_BARS * 0.55;

    // Smooth frequency update (using LUT to avoid sin() per bar per frame)
    const waveT1 = Math.sin(t * 1.8) * 0.3;
    const waveT2 = Math.sin(t * 3.2) * 0.3;
    const waveT3 = Math.sin(t * 0.9) * 0.3;
    const micScale = Math.min(1, micLevel * 3.5);
    const lerpFactor = 0.12 + micLevel * 0.08;
    if (micLevel > 0.01) {
      for (let i = 0; i < NUM_BARS; i++) {
        const target = (freqLUT1[i] + waveT1) * 0.6 +
                       (freqLUT2[i] + waveT2) * 0.3 +
                       (freqLUT3[i] + waveT3) * 0.1;
        const targetVal = target * micScale;
        freqData[i] += (targetVal - freqData[i]) * lerpFactor;
      }
    } else {
      for (let i = 0; i < NUM_BARS; i++) freqData[i] *= 0.9;
    }

    const barStartAngle = -Math.PI / 2;
    const halfBars = NUM_BARS / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NUM_BARS; i++) {
      const barH = freqData[i] * barMaxH;
      if (barH < 0.15) continue;
      const angle = barStartAngle + (i / NUM_BARS) * Math.PI * 2;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const x1 = cx + cosA * waveRadius;
      const y1 = cy + sinA * waveRadius;
      const x2 = cx + cosA * (waveRadius + barH);
      const y2 = cy + sinA * (waveRadius + barH);
      // Weight bars: center bars (bottom) brighter, top bars dimmer
      const posWeight = 0.6 + 0.4 * (1 - Math.abs(i - halfBars) / halfBars);
      const alpha = Math.min(0.9, (micLevel * 1.5 + 0.15) * posWeight);

      // Glow layer
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${alpha * 0.4})`;
      ctx.lineWidth = barW + 4;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `rgba(${accentR}, ${accentG}, ${accentB}, ${alpha * 0.25})`;
      ctx.stroke();

      // Core layer
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${alpha * 0.95})`;
      ctx.lineWidth = barW;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 9. Orbiting dots with trailing glow — position-sized
    const dotCount = 4 + Math.floor(micLevel * 8);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dotCount; i++) {
      const dotPhase = (t * 0.15 + i * 0.1) % 1;
      const dotAngle = t * (0.2 + i * 0.03) * spd + i * (Math.PI * 2 / dotCount);
      const orbitRadius = 28 + Math.sin(dotPhase * Math.PI * 2) * 22;
      const dx = cx + Math.cos(dotAngle) * orbitRadius;
      const dy = cy + Math.sin(dotAngle) * orbitRadius;
      const distFromCenter = Math.hypot(dx - cx, dy - cy) / 50;
      const dotSize = (0.8 + micLevel * 2.5 + (1 - dotPhase) * 0.5) * (1 + distFromCenter * 0.4);
      const hue = (baseHue + i * 30 + t * 10) % 360;
      const alpha = 0.1 + micLevel * 0.3 + distFromCenter * 0.1;
      // Velocity direction for trail offset
      const vAngle = dotAngle + Math.PI / 2;
      const trailOff = 3 + micLevel * 4;

      // Glow trail (drawn slightly behind)
      ctx.beginPath();
      ctx.arc(dx + Math.cos(vAngle) * trailOff, dy + Math.sin(vAngle) * trailOff, dotSize + 3, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${alpha * 0.3})`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${hue}, 80%, 60%, ${alpha * 0.5})`;
      ctx.fill();

      // Core glow
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize + 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 75%, ${alpha * 0.6})`;
      ctx.fill();

      // Core bright center
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 90%, ${0.4 + micLevel * 0.6})`;
      ctx.shadowBlur = 0;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // Update HUD — only on state transitions
    const newHudState = isPlaying ? 'p' : (isListening && micLevel > 0.02) ? 'l' : state.isSessionActive ? 's' : 'i';
    if (newHudState !== prevHudState) {
      prevHudState = newHudState;
      const hudDot = document.getElementById('hudDot');
      if (hudDot) {
        const hudStatus = document.getElementById('hudStatus');
        const hudService = document.getElementById('hudService');
        if (isPlaying) {
          hudDot.className = 'hud-dot connected';
          hudStatus.textContent = 'SPEAKING';
          hudService.textContent = 'audio output';
        } else if (isListening && micLevel > 0.02) {
          hudDot.className = 'hud-dot listening';
          hudStatus.textContent = 'LISTENING';
          hudService.textContent = 'mic ' + (micLevel * 100).toFixed(0) + '%';
        } else if (state.isSessionActive) {
          hudDot.className = 'hud-dot connected';
          hudStatus.textContent = 'STANDBY';
          hudService.textContent = 'voice ready';
        } else {
          hudDot.className = 'hud-dot';
          hudStatus.textContent = 'INITIALIZING';
          hudService.textContent = 'connecting…';
        }
      }
    }

    if (animActive) requestAnimationFrame(draw);
  }

  // Click burst — holographic ripple (capped)
  document.getElementById('nucleusWrapper').addEventListener('click', () => {
    if (burstParticles.length >= MAX_BURST) return;
    const hue = rgbToHue(cssCache.accentR, cssCache.accentG, cssCache.accentB);
    const maxToAdd = Math.min(28, MAX_BURST - burstParticles.length);
    for (let i = 0; i < maxToAdd; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 2.8;
      burstParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 3.5,
        hue: (hue + Math.random() * 80 - 40 + 360) % 360,
        rot: Math.random() * Math.PI * 2,
      });
    }
  });

  let animActive = true;
  document.addEventListener('visibilitychange', () => {
    animActive = !document.hidden;
    if (!document.hidden) draw();
  });
  draw();
}
