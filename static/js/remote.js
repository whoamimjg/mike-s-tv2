const statusEl = document.getElementById('status');
const tabRemote = document.getElementById('tab-remote');
const tabMeals = document.getElementById('tab-meals');
const paneRemote = document.getElementById('pane-remote');
const paneMeals = document.getElementById('pane-meals');
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

let ws;
let config = null;

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

// ---- tabs ----
function showTab(which) {
  const meals = which === 'meals';
  tabMeals.classList.toggle('active', meals);
  tabRemote.classList.toggle('active', !meals);
  paneMeals.classList.toggle('hidden', !meals);
  paneRemote.classList.toggle('hidden', meals);
  if (meals && !config) loadMeals();
}
tabRemote.addEventListener('click', () => showTab('remote'));
tabMeals.addEventListener('click', () => showTab('meals'));

// ---- meals tab ----
function flash(msg) { mealsSaved.textContent = msg; setTimeout(() => { mealsSaved.textContent = ''; }, 2000); }

function applyMode(source, hasUrl, filter) {
  const gcal = source === 'gcal';
  gcalOn.checked = gcal;
  gcalBox.classList.toggle('hidden', !gcal);
  manualBox.classList.toggle('hidden', gcal);
  if (hasUrl && !gcalUrl.value) gcalUrl.placeholder = 'Saved ✓  (paste again to replace)';
  if (filter) gcalFilter.value = filter;
  if (gcal) loadGcalPreview();
}

async function loadMeals() {
  config = await (await fetch('/api/config')).json();
  const settings = await (await fetch('/api/meals/settings')).json();

  // manual editor rows
  const meals = config.meals || [];
  mealsEditor.innerHTML = '';
  meals.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'meal-row';
    const label = document.createElement('label');
    label.textContent = m.day;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = m.meal || '';
    input.placeholder = 'e.g. Taco night';
    input.dataset.idx = i;
    row.append(label, input);
    mealsEditor.appendChild(row);
  });

  applyMode(settings.source, settings.has_url, settings.filter);
}

async function loadGcalPreview() {
  gcalPreview.textContent = 'Loading this week…';
  try {
    const data = await (await fetch('/api/meals')).json();
    if (data.connected === false) {
      gcalPreview.innerHTML = '<span class="warn">Not connected yet — paste the iCal URL above and save.</span>';
      return;
    }
    gcalPreview.innerHTML = '';
    (data.days || []).forEach(d => {
      const row = document.createElement('div');
      row.className = 'preview-row';
      const day = document.createElement('span'); day.className = 'pday'; day.textContent = d.day;
      const meal = document.createElement('span');
      const txt = (d.meals && d.meals.length) ? d.meals.join(', ') : 'Not planned';
      meal.className = 'pmeal' + (d.meals && d.meals.length ? '' : ' empty');
      meal.textContent = txt;
      row.append(day, meal);
      gcalPreview.appendChild(row);
    });
  } catch (e) {
    gcalPreview.innerHTML = '<span class="warn">Could not read the calendar.</span>';
  }
}

gcalOn.addEventListener('change', async () => {
  const source = gcalOn.checked ? 'gcal' : 'manual';
  await fetch('/api/meals/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  gcalBox.classList.toggle('hidden', !gcalOn.checked);
  manualBox.classList.toggle('hidden', gcalOn.checked);
  if (gcalOn.checked) loadGcalPreview();
  flash('Saved ✓');
});

saveGcal.addEventListener('click', async () => {
  const body = { source: 'gcal', filter: gcalFilter.value.trim() };
  if (gcalUrl.value.trim()) body.ical_url = gcalUrl.value.trim();
  const res = await fetch('/api/meals/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!out.ok) { flash(out.error || 'Error'); return; }
  gcalUrl.value = '';
  gcalUrl.placeholder = 'Saved ✓  (paste again to replace)';
  flash('Saved ✓');
  loadGcalPreview();
});

saveMeals.addEventListener('click', async () => {
  if (!config) return;
  mealsEditor.querySelectorAll('input').forEach(inp => {
    config.meals[inp.dataset.idx].meal = inp.value.trim();
  });
  await fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meals: config.meals }),
  });
  flash('Saved ✓');
});
