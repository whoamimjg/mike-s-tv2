const statusEl = document.getElementById('status');
let ws;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?role=remote`);
  ws.onopen = () => { statusEl.textContent = 'Connected'; };
  ws.onclose = () => {
    statusEl.textContent = 'Reconnecting…';
    setTimeout(connect, 1500);
  };
}
connect();

document.querySelectorAll('[data-key]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ key: btn.dataset.key }));
    }
  });
});
