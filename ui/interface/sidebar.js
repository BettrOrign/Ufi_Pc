import { dom } from './dom.js';
import { state } from '../backend/state.js';

let servicesCache = {};

export function initSidebar() {
  if (!dom.sidebarToggle) return;
  
  dom.sidebarToggle.addEventListener('click', toggleSidebar);
  
  const headerToggle = document.getElementById('sidebarToggleBtn');
  if (headerToggle) {
    headerToggle.addEventListener('click', toggleSidebar);
  }
  
  dom.sidebarActions?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sidebar-action');
    if (!btn) return;
    handleQuickAction(btn.dataset.action);
  });

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', toggleSidebar);

  loadServices();
}

export function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebarOverlay')?.classList.toggle('visible');
}

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
    const labels = { connected: 'Connected', disconnected: 'Offline', error: 'Error' };
    text.textContent = labels[status] || status;
  }
}

export function updateAuthService(serviceId, connected) {
  const card = document.querySelector(`.service-card[data-service="${serviceId}"]`);
  if (card) {
    card.classList.toggle('connected', connected);
    const dot = card.querySelector('.service-dot');
    if (dot) {
      dot.className = 'service-dot';
      if (connected) dot.classList.add('connected');
    }
  }
}

async function loadServices() {
  try {
    const resp = await fetch('/api/auth/services');
    const data = await resp.json();
    servicesCache = data.services || {};
    renderServices();
  } catch (err) {
    console.error('[Sidebar] Failed to load services:', err);
  }
}

function renderServices() {
  const container = document.getElementById('servicesList');
  if (!container) return;

  const entries = Object.entries(servicesCache);
  if (entries.length === 0) {
    container.innerHTML = '<div class="service-card-empty">No services configured</div>';
    return;
  }

  container.innerHTML = entries.map(([id, svc]) => {
    const connected = svc.connected;
    return `
      <div class="service-card ${connected ? 'connected' : ''}" data-service="${id}">
        <div class="service-card-header">
          <span class="service-card-icon">${svc.icon}</span>
          <div class="service-card-info">
            <span class="service-card-name">${svc.name}</span>
            <span class="service-card-desc">${svc.description}</span>
          </div>
          <span class="service-dot ${connected ? 'connected' : ''}"></span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => openServiceConnect(card.dataset.service));
  });
}

function openServiceConnect(serviceId) {
  const svc = servicesCache[serviceId];
  if (!svc) return;

  if (svc.connected) {
    disconnectService(serviceId);
    return;
  }

  if (svc.authType === 'oauth') {
    connectOAuth(serviceId, svc);
  } else {
    showApiKeyModal(serviceId, svc);
  }
}

async function disconnectService(serviceId) {
  try {
    const resp = await fetch('/api/auth/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: serviceId }),
    });
    const data = await resp.json();
    if (data.success) {
      updateAuthService(serviceId, false);
    }
  } catch (err) {
    console.error('[Sidebar] Disconnect error:', err);
  }
}

async function connectOAuth(serviceId, svc) {
  try {
    const resp = await fetch(`/api/auth/connect/${serviceId}`);
    const data = await resp.json();
    
    if (data.needSetup) {
      showOAuthSetupModal(serviceId, svc, data);
    } else if (data.authUrl) {
      // Open OAuth URL in new window
      const width = 600, height = 700;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;
      window.open(data.authUrl, 'oauth', `width=${width},height=${height},left=${left},top=${top}`);
    }
  } catch (err) {
    console.error('[Sidebar] OAuth error:', err);
  }
}

function showOAuthSetupModal(serviceId, svc, data) {
  const modal = document.getElementById('connectModal');
  const title = document.getElementById('connectModalTitle');
  const body = document.getElementById('connectModalBody');
  const saveBtn = document.getElementById('connectSaveBtn');

  title.textContent = `Connect ${svc.name}`;
  body.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary);white-space:pre-line;line-height:1.6;">${data.message}</div>
    <div style="font-size:12px;color:var(--neon-cyan);margin-bottom:16px;background:rgba(0,240,255,0.05);padding:12px;border-radius:8px;border:1px solid rgba(0,240,255,0.1);white-space:pre-line;line-height:1.6;">${data.instructions}</div>
    <div class="form-group">
      <label>Client ID</label>
      <input id="oauthClientId" class="form-select" type="text" placeholder="Paste Google OAuth Client ID here">
    </div>
    <div class="form-group">
      <label>Client Secret</label>
      <input id="oauthClientSecret" class="form-select" type="text" placeholder="Paste Google OAuth Client Secret here">
    </div>
  `;

  modal.style.display = 'flex';
  
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', async () => {
    const clientId = document.getElementById('oauthClientId')?.value?.trim();
    const clientSecret = document.getElementById('oauthClientSecret')?.value?.trim();
    if (!clientId || !clientSecret) return;
    
    // Save credentials and start OAuth
    await fetch('/api/auth/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'google', credentials: { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } }),
    });
    
    modal.style.display = 'none';
    connectOAuth(serviceId, svc);
  });
}

function showApiKeyModal(serviceId, svc) {
  const modal = document.getElementById('connectModal');
  const title = document.getElementById('connectModalTitle');
  const body = document.getElementById('connectModalBody');
  const saveBtn = document.getElementById('connectSaveBtn');

  title.textContent = `Connect ${svc.name}`;
  
  let fieldsHtml = '';
  const signupLinks = {
    groq: '<a href="https://console.groq.com/keys" target="_blank" style="color:var(--neon-cyan);">Get Groq API Key</a>',
    openrouter: '<a href="https://openrouter.ai/keys" target="_blank" style="color:var(--neon-cyan);">Get OpenRouter API Key</a>',
    opencode: '<a href="https://opencode.ai" target="_blank" style="color:var(--neon-cyan);">Get OpenCode API Key</a>',
    telegram: '<a href="https://my.telegram.org/apps" target="_blank" style="color:var(--neon-cyan);">Get Telegram API credentials</a>',
  };

  if (svc.fields) {
    fieldsHtml = svc.fields.map((f, i) => `
      <div class="form-group">
        <label>${f.label}</label>
        <input id="keyField_${i}" class="form-select" type="text" placeholder="${f.placeholder || ''}">
      </div>
    `).join('');
  }

  body.innerHTML = `
    ${signupLinks[serviceId] ? `<div style="margin-bottom:16px;font-size:13px;">${signupLinks[serviceId]}</div>` : ''}
    ${fieldsHtml}
  `;

  modal.style.display = 'flex';
  
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', async () => {
    const credentials = {};
    if (svc.fields) {
      svc.fields.forEach((f, i) => {
        const el = document.getElementById(`keyField_${i}`);
        if (el && el.value.trim()) {
          credentials[f.key] = el.value.trim();
        }
      });
    }
    
    if (Object.keys(credentials).length === 0) return;
    
    try {
      const resp = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceId, credentials }),
      });
      const data = await resp.json();
      if (data.success) {
        updateAuthService(serviceId, true);
        modal.style.display = 'none';
      }
    } catch (err) {
      console.error('[Sidebar] Connect error:', err);
    }
  });
}

function handleQuickAction(action) {
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
    import('./chat.js').then(({ sendTextMessage }) => sendTextMessage(text));
  }
}
