// ---- element refs ----
const grid = document.getElementById('grid');
const continueSection = document.getElementById('continue-section');
const continueRow = document.getElementById('continue-row');
const gear = document.getElementById('gear');
const panel = document.getElementById('panel');
const scrim = document.getElementById('scrim');
const closePanel = document.getElementById('close-panel');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');
const weatherEl = document.getElementById('weather');
const themeOptions = document.getElementById('theme-options');
const appList = document.getElementById('app-list');
const qrImg = document.getElementById('qr');
const remoteUrlEl = document.getElementById('remote-url');
const stremioStatus = document.getElementById('stremio-status');
const ambientToggle = document.getElementById('ambient-toggle');

// ambient refs
const ambient = document.getElementById('ambient');
const ambientBg = document.getElementById('ambient-bg');
const ambientClock = document.getElementById('ambient-clock');
const ambientDate = document.getElementById('ambient-date');
const ambientWeather = document.getElementById('ambient-weather');
const ambientMeals = document.getElementById('ambient-meals');
const ambientWatching = document.getElementById('ambient-watching');
const ambientWatchingCard = document.getElementById('ambient-watching-card');

let config = null;
let watching = [];           // continue-watching items
let weekMeals = [];          // [{day, date, meals:[...]}] for the week
let section = 'grid';        // 'continue' | 'grid'
let continueIndex = 0;
let gridIndex = 0;
const GRID_COLS = 5;

const THEMES = [
  { id: 'shore', color: '#2aa98a' },
  { id: 'dusk', color: '#8b3fae' },
  { id: 'minimal', color: '#1a1a1a' },
];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ======================================================================
// Clock + weather
// ======================================================================
function pad(n) { return String(n).padStart(2, '0'); }
function timeStr(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function dateStr(d) { return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }

function tick() {
  const now = new Date();
  const t = timeStr(now);
  clockEl.textContent = (config && config.clock === false) ? '' : t;
  dateEl.textContent = (config && config.clock === false) ? '' : dateStr(now);
  ambientClock.textContent = t;
  ambientDate.textContent = dateStr(now);
}
setInterval(tick, 1000);

async function loadWeather() {
  try {
    const w = await (await fetch('/api/weather')).json();
    if (w.temperature === null || w.temperature === undefined) {
      weatherEl.innerHTML = ''; ambientWeather.textContent = ''; return;
    }
    weatherEl.innerHTML = `<span class="w-ico">${w.icon || ''}</span><span>${w.temperature}&deg; &middot; ${w.location}</span>`;
    ambientWeather.textContent = `${w.icon || ''} ${w.temperature}° · ${w.label || ''}`;
  } catch (e) { /* leave as-is */ }
}
setInterval(loadWeather, 10 * 60 * 1000);

// ======================================================================
// App grid
// ======================================================================
function visibleApps() {
  return config.visible.map(id => config.apps.find(a => a.id === id)).filter(Boolean);
}
function faviconUrl(app) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(app.url).hostname}&sz=128`; }
  catch (e) { return ''; }
}
function openUrl(url) { window.location.href = url; }

function renderGrid() {
  grid.innerHTML = '';
  visibleApps().forEach((app) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.setProperty('--tile-color', app.color || '#888');

    const glow = document.createElement('div');
    glow.className = 'tile-glow';

    const icon = document.createElement('img');
    icon.className = 'tile-icon';
    icon.src = faviconUrl(app);
    icon.alt = '';
    icon.onerror = () => { el.classList.add('no-icon'); icon.remove(); };

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = app.name;

    el.append(glow, icon, label);
    el.addEventListener('click', () => openUrl(app.url));
    grid.appendChild(el);
  });
  gridIndex = Math.min(gridIndex, Math.max(0, visibleApps().length - 1));
  updateFocus();
}

// ======================================================================
// Continue Watching (Stremio)
// ======================================================================
async function loadContinue() {
  try {
    const data = await (await fetch('/api/continue')).json();
    renderStremioStatus(data);
    if (!data.enabled || !data.items || data.items.length === 0) {
      watching = [];
      continueSection.classList.add('hidden');
      renderAmbientWatching();
      return;
    }
    watching = data.items;
    continueSection.classList.remove('hidden');
    renderContinueRow();
    renderAmbientWatching();
  } catch (e) {
    continueSection.classList.add('hidden');
  }
}


function renderContinueRow() {
  continueRow.innerHTML = '';
  watching.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'poster';

    if (item.poster) {
      const img = document.createElement('img');
      img.src = item.poster; img.alt = '';
      img.onerror = () => {
        img.remove();
        const fb = document.createElement('div');
        fb.className = 'fallback'; fb.textContent = item.name;
        el.prepend(fb);
      };
      el.appendChild(img);
    } else {
      const fb = document.createElement('div');
      fb.className = 'fallback'; fb.textContent = item.name;
      el.appendChild(fb);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.textContent = item.name;
    meta.appendChild(title);
    if (item.label) {
      const ep = document.createElement('div');
      ep.className = 'ep'; ep.textContent = item.label;
      meta.appendChild(ep);
    }
    if (item.progress) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = item.progress + '%';
      bar.appendChild(fill);
      meta.appendChild(bar);
    }
    el.appendChild(meta);
    el.addEventListener('click', () => openUrl(item.link));
    continueRow.appendChild(el);
  });
  continueIndex = Math.min(continueIndex, Math.max(0, watching.length - 1));
  updateFocus();
}

function renderStremioStatus(data) {
  if (!data.enabled) { stremioStatus.textContent = 'Turned off in config.'; stremioStatus.className = 'status-line'; return; }
  if (data.connected === false) {
    stremioStatus.innerHTML = 'Not connected yet. On the server run:<br><code>python3 scripts/stremio_login.py</code>';
    stremioStatus.className = 'status-line warn';
    return;
  }
  if (data.error) { stremioStatus.textContent = 'Stremio error: ' + data.error; stremioStatus.className = 'status-line warn'; return; }
  const n = (data.items || []).length;
  stremioStatus.textContent = n ? `Connected — showing ${n} recent item${n === 1 ? '' : 's'}.` : 'Connected, but nothing in progress yet.';
  stremioStatus.className = 'status-line ok';
}

// ======================================================================
// Remote / keyboard focus navigation
// ======================================================================
function focusables(zone) {
  return zone === 'continue' ? [...continueRow.children] : [...grid.children];
}
function updateFocus() {
  focusables('continue').forEach((el, i) => el.classList.toggle('focused', section === 'continue' && i === continueIndex));
  focusables('grid').forEach((el, i) => el.classList.toggle('focused', section === 'grid' && i === gridIndex));
  const active = section === 'continue' ? focusables('continue')[continueIndex] : focusables('grid')[gridIndex];
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function hasContinue() { return watching.length > 0 && !continueSection.classList.contains('hidden'); }

function moveFocus(dir) {
  if (section === 'continue') {
    if (dir === 'left') continueIndex = Math.max(0, continueIndex - 1);
    else if (dir === 'right') continueIndex = Math.min(watching.length - 1, continueIndex + 1);
    else if (dir === 'down') { section = 'grid'; gridIndex = Math.min(gridIndex, visibleApps().length - 1); }
    // up: stay
  } else { // grid
    const n = visibleApps().length;
    if (dir === 'left') gridIndex = Math.max(0, gridIndex - 1);
    else if (dir === 'right') gridIndex = Math.min(n - 1, gridIndex + 1);
    else if (dir === 'down') gridIndex = Math.min(n - 1, gridIndex + GRID_COLS);
    else if (dir === 'up') {
      if (gridIndex < GRID_COLS && hasContinue()) { section = 'continue'; }
      else gridIndex = Math.max(0, gridIndex - GRID_COLS);
    }
  }
  updateFocus();
}

function activateFocused() {
  if (section === 'continue') {
    const item = watching[continueIndex];
    if (item) openUrl(item.link);
  } else {
    const app = visibleApps()[gridIndex];
    if (app) openUrl(app.url);
  }
}

function panelOpen() { return !panel.classList.contains('hidden'); }

function handleKey(key) {
  // Any input wakes the ambient screen and is otherwise swallowed.
  if (!ambient.classList.contains('hidden')) { exitAmbient(); return; }
  bumpIdle();

  if (panelOpen()) {
    if (key === 'back' || key === 'settings') closeSettings();
    return;
  }
  if (['up', 'down', 'left', 'right'].includes(key)) moveFocus(key);
  else if (key === 'ok') activateFocused();
  else if (key === 'settings') openSettings();
  else if (key === 'back') { /* already home */ }
}

window.addEventListener('keydown', (e) => {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back' };
  if (map[e.key]) { e.preventDefault(); handleKey(map[e.key]); }
});

// ======================================================================
// Settings panel
// ======================================================================
function openSettings() { panel.classList.remove('hidden'); scrim.classList.remove('hidden'); loadContinue(); }
function closeSettings() { panel.classList.add('hidden'); scrim.classList.add('hidden'); }
gear.addEventListener('click', openSettings);
closePanel.addEventListener('click', closeSettings);
scrim.addEventListener('click', closeSettings);

function applyTheme(theme) {
  document.body.classList.remove('theme-shore', 'theme-dusk', 'theme-minimal');
  document.body.classList.add('theme-' + theme);
}
function renderThemePicker() {
  themeOptions.innerHTML = '';
  THEMES.forEach(t => {
    const dot = document.createElement('div');
    dot.className = 'theme-dot' + (config.theme === t.id ? ' active' : '');
    dot.style.background = t.color;
    dot.addEventListener('click', () => {
      config.theme = t.id; applyTheme(t.id); renderThemePicker(); saveConfig();
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
      if (cb.checked) { if (!config.visible.includes(app.id)) config.visible.push(app.id); }
      else config.visible = config.visible.filter(id => id !== app.id);
      renderGrid(); saveConfig();
    });
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = app.name;
    const up = document.createElement('button'); up.textContent = '↑';
    up.addEventListener('click', () => reorder(app.id, -1));
    const down = document.createElement('button'); down.textContent = '↓';
    down.addEventListener('click', () => reorder(app.id, 1));
    row.append(cb, name, up, down);
    appList.appendChild(row);
  });
}
function reorder(id, delta) {
  const idx = config.visible.indexOf(id);
  if (idx === -1) return;
  const j = idx + delta;
  if (j < 0 || j >= config.visible.length) return;
  [config.visible[idx], config.visible[j]] = [config.visible[j], config.visible[idx]];
  renderGrid(); renderAppList(); saveConfig();
}
ambientToggle.addEventListener('change', () => {
  config.ambient = config.ambient || {};
  config.ambient.enabled = ambientToggle.checked;
  saveConfig();
});

async function saveConfig() {
  await fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
  });
}

// ======================================================================
// Ambient (idle) dashboard
// ======================================================================
let idleTimer = null;
let ambientInterval = null;
let ambientBgIdx = 0;
let photos = [];             // Google shared-album image URLs for the background
let photoIntervalMs = 12000;

function idleMs() {
  const s = (config && config.ambient && config.ambient.idle_seconds) || 120;
  return Math.max(15, s) * 1000;
}
function ambientEnabled() { return !(config && config.ambient && config.ambient.enabled === false); }

function bumpIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!ambientEnabled()) return;
  idleTimer = setTimeout(enterAmbient, idleMs());
}
function enterAmbient() {
  if (panelOpen() || !ambientEnabled()) return;
  renderAmbientMeals();
  renderAmbientWatching();
  setAmbientBg();
  ambient.classList.remove('hidden');
  if (ambientInterval) clearInterval(ambientInterval);
  ambientInterval = setInterval(setAmbientBg, photos.length ? photoIntervalMs : 12000);
}
function exitAmbient() {
  ambient.classList.add('hidden');
  if (ambientInterval) { clearInterval(ambientInterval); ambientInterval = null; }
  bumpIdle();
}
function ambientBgImages() {
  if (photos.length) return photos;
  return watching.filter(w => w.poster).map(w => w.poster);
}
function setAmbientBg() {
  const imgs = ambientBgImages();
  ambient.classList.toggle('photo-mode', photos.length > 0);
  if (imgs.length === 0) { ambientBg.style.backgroundImage = ''; return; }
  ambientBgIdx = (ambientBgIdx + 1) % imgs.length;
  ambientBg.style.opacity = '0';
  setTimeout(() => {
    ambientBg.style.backgroundImage = `url("${imgs[ambientBgIdx]}")`;
    ambientBg.style.opacity = '1';
  }, 400);
}
async function loadPhotos() {
  try {
    const d = await (await fetch('/api/photos')).json();
    photos = (d && d.urls) || [];
    photoIntervalMs = ((d && d.interval) || 12) * 1000;
  } catch (e) {
    photos = [];
  }
}
async function loadMeals() {
  try {
    const data = await (await fetch('/api/meals')).json();
    weekMeals = (data && data.days) || [];
  } catch (e) {
    weekMeals = [];
  }
  renderAmbientMeals();
}

function renderAmbientMeals() {
  const days = weekMeals.length
    ? weekMeals
    : (config && config.meals || []).map(m => ({ day: m.day, meals: m.meal ? [m.meal] : [] }));
  const todayIdx = (new Date().getDay() + 6) % 7; // 0 = Mon
  ambientMeals.innerHTML = '';
  days.forEach((m, i) => {
    const li = document.createElement('li');
    if (i === todayIdx) li.classList.add('today');
    const d = document.createElement('span'); d.className = 'mday'; d.textContent = m.day;
    const text = (m.meals && m.meals.length) ? m.meals.join(', ') : '';
    const meal = document.createElement('span');
    meal.className = 'mmeal' + (text ? '' : ' empty');
    meal.textContent = text || 'Not planned';
    li.append(d, meal);
    ambientMeals.appendChild(li);
  });
}
function renderAmbientWatching() {
  const withPoster = watching.filter(w => w.poster).slice(0, 5);
  if (withPoster.length === 0) { ambientWatchingCard.style.display = 'none'; return; }
  ambientWatchingCard.style.display = '';
  ambientWatching.innerHTML = '';
  withPoster.forEach(w => {
    const d = document.createElement('div'); d.className = 'mini';
    const img = document.createElement('img'); img.src = w.poster; img.alt = '';
    d.appendChild(img); ambientWatching.appendChild(d);
  });
}
['mousemove', 'click', 'wheel', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => {
    if (!ambient.classList.contains('hidden')) exitAmbient(); else bumpIdle();
  }, { passive: true })
);

// ======================================================================
// Info / websocket / boot
// ======================================================================
async function loadInfo() {
  try {
    const info = await (await fetch('/api/info')).json();
    qrImg.src = '/api/qr?' + Date.now();
    remoteUrlEl.textContent = info.remote_url;
  } catch (e) { /* ignore */ }
}
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=tv`);
  ws.onmessage = (ev) => {
    try { const msg = JSON.parse(ev.data); if (msg.key) handleKey(msg.key); } catch (e) { /* ignore */ }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

async function init() {
  config = await (await fetch('/api/config')).json();
  applyTheme(config.theme);
  ambientToggle.checked = ambientEnabled();
  tick();
  renderGrid();
  renderThemePicker();
  renderAppList();
  loadInfo();
  loadWeather();
  loadContinue();
  setInterval(loadContinue, CONTINUE_REFRESH);
  loadMeals();
  setInterval(loadMeals, CONTINUE_REFRESH);
  loadPhotos();
  setInterval(loadPhotos, 30 * 60 * 1000);
  connectWS();
  bumpIdle();
  grid.focus();
}
const CONTINUE_REFRESH = 5 * 60 * 1000;
init();
