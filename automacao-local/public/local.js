const key = location.hash.slice(1) || sessionStorage.getItem('indexa-local-key') || '';
if (key) sessionStorage.setItem('indexa-local-key', key);
history.replaceState(null, '', location.pathname);
const labels = { offline: 'Desconectado', starting: 'Iniciando', qr: 'Escaneie o QR', authenticated: 'Carregando', ready: 'WhatsApp conectado', error: 'Precisa de atenção' };
const feedback = document.querySelector('#feedback');
async function api(url, body) {
  const response = await fetch('/api/' + url, { method: body ? 'POST' : 'GET', headers: { 'X-Indexa-Key': key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha na conexão');
  return result;
}
async function refresh() {
  try {
    const state = await api('status');
    document.querySelector('#status').textContent = labels[state.status] || state.status;
    document.querySelector('#setup').hidden = state.configured;
    document.querySelector('#connected').hidden = !state.configured;
    const qr = document.querySelector('#qr');
    qr.hidden = !state.qr; if (state.qr) qr.src = state.qr; else qr.removeAttribute('src');
    document.querySelector('#reconnect').disabled = ['starting', 'ready', 'qr', 'authenticated'].includes(state.status);
    feedback.textContent = [state.error, state.cloudError].filter(Boolean).join(' · ');
  } catch (error) { feedback.textContent = error.message; }
}
document.querySelector('#setup').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { await api('config', JSON.parse(document.querySelector('#connection').value)); document.querySelector('#connection').value = ''; await refresh(); }
  catch (error) { feedback.textContent = error.message; }
  finally { button.disabled = false; }
};
document.querySelector('#file').onchange = async e => { if (e.target.files[0]) document.querySelector('#connection').value = await e.target.files[0].text(); };
document.querySelector('#reconnect').onclick = async e => { e.target.disabled = true; try { await api('connect', {}); await refresh(); } catch (error) { feedback.textContent = error.message; e.target.disabled = false; } };
void refresh(); setInterval(refresh, 5000);
