const statusEl = document.getElementById('status');
const tabRemote = document.getElementById('tab-remote');
const tabMeals = document.getElementById('tab-meals');
const paneRemote = document.getElementById('pane-remote');
const paneMeals = document.getElementById('pane-meals');
const mealsEditor = document.getElementById('meals-editor');
const saveMeals = document.getElementById('save-meals');
const mealsSaved = document.getElementById('meals-saved');

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

// ---- meals editor ----
async function loadMeals() {
  config = await (await fetch('/api/config')).json();
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
}

saveMeals.addEventListener('click', async () => {
  if (!config) return;
  mealsEditor.querySelectorAll('input').forEach(inp => {
    config.meals[inp.dataset.idx].meal = inp.value.trim();
  });
  await fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meals: config.meals }),
  });
  mealsSaved.textContent = 'Saved ✓';
  setTimeout(() => { mealsSaved.textContent = ''; }, 2000);
});
