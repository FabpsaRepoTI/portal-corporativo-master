const clients = new Map(); // Map<login, res>

function addClient(login, res) {
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': ping\n\n');
  clients.set(login, res);
  res.on('close', () => clients.delete(login));
}

function emitir(login, payload) {
  const res = clients.get(login);
  if (res) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// keepalive ccada 25 s para que IIS no corte la conexión
setInterval(() => {
  clients.forEach(res => res.write(': ping\n\n'));
}, 25_000);

module.exports = { addClient, emitir };