const grid = document.getElementById('grid');
const gear = document.getElementById('gear');
const panel = document.getElementById('panel');
const closePanel = document.getElementById('close-panel');
const clockEl = document.getElementById('clock');
const themeOptions = document.getElementById('theme-options');
const appList = document.getElementById('app-list');
const qrImg = document.getElementById('qr');
const remoteUrlEl = document.getElementById('remote-url');

let config = null;
let focusIndex = 0;

const THEMES = [
  { id: 'shore', color: '#2aa98a' },
  { id: 'dusk', color: '#8b3fae' },
  { id: 'minimal', color: '#1a1a1a' },
];

function applyTheme(theme) {
  document.body.classList.remove('theme-shore', 'theme-dusk', 'theme-minimal');
  document.body.classList.add('theme-' + theme);
}

function tickClock() {
  if (!config || config.clock === false) { clockEl.textContent = ''; return; }
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickClock, 1000);

function visibleApps() {
  return config.visible
    .map(id => config.apps.find(a => a.id === id))
    .filter(Boolean);
}

function renderGrid() {
  grid.innerHTML = '';
  visibleApps().forEach((app) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.background = `linear-gradient(135deg, ${app.color}, ${app.color}aa)`;
    el.textContent = app.name;
    el.addEventListener('click', () => openApp(app));
    grid.appendChild(el);
  });
  focusIndex = Math.min(focusIndex, Math.max(0, visibleApps().length - 1));
  updateFocus();
}

function updateFocus() {
  [...grid.children].forEach((el, i) => el.classList.toggle('focused', i === focusIndex));
}

function openApp(app) {
  window.location.href = app.url;
}

function moveFocus(dir) {
  const apps = visibleApps();
  const cols = 4;
  if (dir === 'left') focusIndex = Math.max(0, focusIndex - 1);
  if (dir === 'right') focusIndex = Math.min(apps.length - 1, focusIndex + 1);
  if (dir === 'up') focusIndex = Math.max(0, focusIndex - cols);
  if (dir === 'down') focusIndex = Math.min(apps.length - 1, focusIndex + cols);
  updateFocus();
}

function handleKey(key) {
  if (['up', 'down', 'left', 'right'].includes(key)) {
    moveFocus(key);
  } else if (key === 'ok') {
    const apps = visibleApps();
    if (apps[focusIndex]) openApp(apps[focusIndex]);
  } else if (key === 'back') {
    panel.classList.add('hidden');
  } else if (key === 'settings') {
    panel.classList.toggle('hidden');
  }
}

window.addEventListener('keydown', (e) => {
  const map = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'ok', Escape: 'back',
  };
  if (map[e.key]) {
    e.preventDefault();
    handleKey(map[e.key]);
  }
});

gear.addEventListener('click', () => panel.classList.toggle('hidden'));
closePanel.addEventListener('click', () => panel.classList.add('hidden'));

function renderThemePicker() {
  themeOptions.innerHTML = '';
  THEMES.forEach(t => {
    const dot = document.createElement('div');
    dot.className = 'theme-dot' + (config.theme === t.id ? ' active' : '');
    dot.style.background = t.color;
    dot.addEventListener('click', () => {
      config.theme = t.id;
      applyTheme(t.id);
      renderThemePicker();
      saveConfig();
    });
    themeOptions.appendChild(dot);
  });
}

function renderAppList() {
  appList.innerHTML = '';
  config.apps.forEach(app => {
    const row = document.createElement('div');
    row.className = 'app-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = config.visible.includes(app.id);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!config.visible.includes(app.id)) config.visible.push(app.id);
      } else {
        config.visible = config.visible.filter(id => id !== app.id);
      }
      renderGrid();
      saveConfig();
    });

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = app.name;

    const up = document.createElement('button');
    up.textContent = '↑';
    up.addEventListener('click', () => reorder(app.id, -1));

    const down = document.createElement('button');
    down.textContent = '↓';
    down.addEventListener('click', () => reorder(app.id, 1));

    row.append(cb, name, up, down);
    appList.appendChild(row);
  });
}

function reorder(id, delta) {
  const idx = config.visible.indexOf(id);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= config.visible.length) return;
  [config.visible[idx], config.visible[newIdx]] = [config.visible[newIdx], config.visible[idx]];
  renderGrid();
  renderAppList();
  saveConfig();
}

async function saveConfig() {
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

async function loadInfo() {
  const res = await fetch('/api/info');
  const info = await res.json();
  qrImg.src = '/api/qr?' + Date.now();
  remoteUrlEl.textContent = info.remote_url;
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=tv`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.key) handleKey(msg.key);
    } catch (e) { /* ignore */ }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

async function init() {
  const res = await fetch('/api/config');
  config = await res.json();
  applyTheme(config.theme);
  tickClock();
  renderGrid();
  renderThemePicker();
  renderAppList();
  loadInfo();
  connectWS();
  grid.focus();
}

init();
