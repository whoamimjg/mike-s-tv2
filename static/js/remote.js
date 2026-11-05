const statusEl = document.getElementById('status');
const tabs = { remote: document.getElementById('tab-remote'), meals: document.getElementById('tab-meals'), photos: document.getElementById('tab-photos') };
const panes = { remote: document.getElementById('pane-remote'), meals: document.getElementById('pane-meals'), photos: document.getElementById('pane-photos') };

// meals els
const mealsEditor = document.getElementById('meals-editor');
const saveMeals = document.getElementById('save-meals');
const mealsSaved = document.getElementById('meals-saved');
const gcalOn = document.getElementById('gcal-on');
const gcalBox = document.getElementById('gcal-box');
const manualBox = document.getElementById('manual-box');
const gcalUrl = document.getElementById('gcal-url');
const gcalFilter = document.getElementById('gcal-filter');
const saveGcal = document.getElementById('save-gcal');
const gcalPreview = document.getElementById('gcal-preview');

// photos els
const photosOn = document.getElementById('photos-on');
const photosBox = document.getElementById('photos-box');
const photosUrl = document.getElementById('photos-url');
const photosInterval = document.getElementById('photos-interval');
const savePhotos = document.getElementById('save-photos');
const photosStatus = document.getElementById('photos-status');
const photosSaved = document.getElementById('photos-saved');

let ws;
let config = null;
let mealsLoaded = false;
let photosLoaded = false;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?role=remote`);
  ws.onopen = () => { statusEl.textContent = 'Connected'; };
  ws.onclose = () => { statusEl.textContent = 'Reconnecting…'; setTimeout(connect, 1500); };
}
connect();

document.querySelectorAll('[data-key]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ key: btn.dataset.key }));
    if (navigator.vibrate) navigator.vibrate(10);
  });
});

function showTab(which) {
  Object.keys(tabs).forEach(k => {
    tabs[k].classList.toggle('active', k === which);
    panes[k].classList.toggle('hidden', k !== which);
  });
  if (which === 'meals' && !mealsLoaded) { mealsLoaded = true; loadMeals(); }
  if (which === 'photos' && !photosLoaded) { photosLoaded = true; loadPhotos(); }
}
tabs.remote.addEventListener('click', () => showTab('remote'));
tabs.meals.addEventListener('click', () => showTab('meals'));
tabs.photos.addEventListener('click', () => showTab('photos'));

function flash(el, msg) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 2000); }

// ---- meals ----
async function loadMeals() {
  config = await (await fetch('/api/config')).json();
  const settings = await (await fetch('/api/meals/settings')).json();
  const meals = config.meals || [];
  mealsEditor.innerHTML = '';
  meals.forEach((m, i) => {
    const row = document.createElement('div'); row.className = 'meal-row';
    const label = document.createElement('label'); label.textContent = m.day;
    const input = document.createElement('input');
    input.type = 'text'; input.value = m.meal || ''; input.placeholder = 'e.g. Taco night'; input.dataset.idx = i;
    row.append(label, input); mealsEditor.appendChild(row);
  });
  const gcal = settings.source === 'gcal';
  gcalOn.checked = gcal;
  gcalBox.classList.toggle('hidden', !gcal);
  manualBox.classList.toggle('hidden', gcal);
  if (settings.has_url) gcalUrl.placeholder = 'Saved ✓  (paste again to replace)';
  if (settings.filter) gcalFilter.value = settings.filter;
  if (gcal) loadGcalPreview();
}
async function loadGcalPreview() {
  gcalPreview.textContent = 'Loading this week…';
  try {
    const data = await (await fetch('/api/meals')).json();
    if (data.connected === false) { gcalPreview.innerHTML = '<span class="warn">Not connected yet — paste the iCal URL above and save.</span>'; return; }
    gcalPreview.innerHTML = '';
    (data.days || []).forEach(d => {
      const row = document.createElement('div'); row.className = 'preview-row';
      const day = document.createElement('span'); day.className = 'pday'; day.textContent = d.day;
      const meal = document.createElement('span');
      const txt = (d.meals && d.meals.length) ? d.meals.join(', ') : 'Not planned';
      meal.className = 'pmeal' + (d.meals && d.meals.length ? '' : ' empty'); meal.textContent = txt;
      row.append(day, meal); gcalPreview.appendChild(row);
    });
  } catch (e) { gcalPreview.innerHTML = '<span class="warn">Could not read the calendar.</span>'; }
}
gcalOn.addEventListener('change', async () => {
  await fetch('/api/meals/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: gcalOn.checked ? 'gcal' : 'manual' }) });
  gcalBox.classList.toggle('hidden', !gcalOn.checked);
  manualBox.classList.toggle('hidden', gcalOn.checked);
  if (gcalOn.checked) loadGcalPreview();
  flash(mealsSaved, 'Saved ✓');
});
saveGcal.addEventListener('click', async () => {
  const body = { source: 'gcal', filter: gcalFilter.value.trim() };
  if (gcalUrl.value.trim()) body.ical_url = gcalUrl.value.trim();
  const out = await (await fetch('/api/meals/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (!out.ok) { flash(mealsSaved, out.error || 'Error'); return; }
  gcalUrl.value = ''; gcalUrl.placeholder = 'Saved ✓  (paste again to replace)';
  flash(mealsSaved, 'Saved ✓'); loadGcalPreview();
});
saveMeals.addEventListener('click', async () => {
  if (!config) return;
  mealsEditor.querySelectorAll('input').forEach(inp => { config.meals[inp.dataset.idx].meal = inp.value.trim(); });
  await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meals: config.meals }) });
  flash(mealsSaved, 'Saved ✓');
});

// ---- photos ----
async function loadPhotos() {
  const s = await (await fetch('/api/photos/settings')).json();
  photosOn.checked = !!s.enabled;
  photosBox.classList.toggle('hidden', !s.enabled);
  photosInterval.value = s.interval || 12;
  if (s.has_url) photosUrl.placeholder = 'Saved ✓  (paste again to replace)';
  if (s.enabled) refreshPhotoStatus();
}
async function refreshPhotoStatus() {
  photosStatus.textContent = 'Checking album…'; photosStatus.className = 'status-line';
  try {
    const d = await (await fetch('/api/photos')).json();
    if (d.connected === false) { photosStatus.textContent = 'Not connected yet — paste the album link and save.'; photosStatus.className = 'status-line warn'; return; }
    photosStatus.textContent = `Found ${d.count} photo${d.count === 1 ? '' : 's'}.`;
    photosStatus.className = 'status-line ok';
  } catch (e) { photosStatus.textContent = 'Could not read the album.'; photosStatus.className = 'status-line warn'; }
}
photosOn.addEventListener('change', async () => {
  await fetch('/api/photos/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: photosOn.checked }) });
  photosBox.classList.toggle('hidden', !photosOn.checked);
  if (photosOn.checked) refreshPhotoStatus();
  flash(photosSaved, 'Saved ✓');
});
savePhotos.addEventListener('click', async () => {
  const body = { enabled: true, interval: parseInt(photosInterval.value, 10) || 12 };
  if (photosUrl.value.trim()) body.album_url = photosUrl.value.trim();
  const out = await (await fetch('/api/photos/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (!out.ok) { flash(photosSaved, out.error || 'Error'); return; }
  photosOn.checked = true; photosUrl.value = ''; photosUrl.placeholder = 'Saved ✓  (paste again to replace)';
  flash(photosSaved, 'Saved ✓'); refreshPhotoStatus();
});
