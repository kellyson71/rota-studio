/* Agendamentos no Supabase; execução exclusivamente no computador vinculado. */
(() => {
  let state = { devices: [], messages: [], replies: [], blocks: [], drafts: [] };
  let pendingCount = 0, badgeTimer;
  let timer, loading = false, draft = {}, filter = 'all', requestId = null;
  const labels = { offline: 'PC desconectado', starting: 'Abrindo WhatsApp', qr: 'Escaneie o QR', authenticated: 'Carregando conversas', ready: 'Conectado', error: 'Precisa de atenção', queued: 'Agendada', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou antes do envio', uncertain: 'Conferir no WhatsApp', cancelled: 'Cancelada' };
  const date = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }) : 'Ainda não conectado';
  const phone = value => {
    let n = String(value || '').replace(/\D/g, '');
    if ((n.length === 10 || n.length === 11) && !String(value).trim().startsWith('+')) n = '55' + n;
    return /^[1-9]\d{9,14}$/.test(n) ? n : '';
  };
  const phoneKey = value => value.startsWith('55') && value.length === 13 && value[4] === '9' ? value.slice(0,4) + value.slice(5) : value;
  const defaultDate = () => new Date(Date.now() + 10 * 60000 - 3 * 3600000).toISOString().slice(0, 16);
  const eligible = () => Store.contacts.filter(c => c.kind !== 'government' && phone(c.phone)).sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
  const contactOption = c => `<option value="${esc(c.id)}">${esc(c.name)}${['Sem interesse', 'Não compensa'].includes(c.status) ? ' · sem interesse' : c.status === 'Aguardando resposta' ? ' · retorno' : ''}</option>`;
  const contactOptions = () => {
    const all = eligible(), first = all.filter(c => c.status === 'A enviar'), rest = all.filter(c => c.status !== 'A enviar');
    return `<optgroup label="Primeiro contato (${first.length})">${first.map(contactOption).join('')}</optgroup>${rest.length ? `<optgroup label="Retorno e outros">${rest.map(contactOption).join('')}</optgroup>` : ''}`;
  };
  const badge = (status, text) => `<span class="wa-badge ${esc(status)}">${esc(text || labels[status] || status)}</span>`;
  const alive = d => d.heartbeat_at && Date.now() - new Date(d.heartbeat_at).getTime() < 45000;
  const messageFor = c => (c?.status === 'Aguardando resposta' && c.followupMessage?.trim()) || c?.message?.trim() || `Oi${c?.person ? ', ' + c.person : ''}, tudo bem? Sou o Kellyson, desenvolvedor aqui de Pau dos Ferros. Como vocês cuidam disso hoje no dia a dia?`;
  const remember = () => { const f = document.querySelector('#wa-compose'); if (f) draft = Object.fromEntries(new FormData(f)); };

  function page() {
    remember();
    return `<section class="page-head"><div><span class="kicker">Indexa · WhatsApp</span><h1>Uma conversa de cada vez.</h1><p>Agende por aqui. Seu computador cuida do envio no horário escolhido.</p></div><button class="btn" id="wa-refresh" type="button">↻ Atualizar</button></section>
    <div id="wa-error" class="wa-setup" role="alert" hidden></div>
        <section class="wa-card wa-drafts" id="wa-drafts" hidden></section>
    <div class="wa-layout">
      <section class="wa-card"><span class="kicker">01 · preparar</span><h2>Agendar mensagem</h2>
        <form id="wa-compose" class="form">
          <div class="field"><label for="wa-contact">Contato da sua base</label><select data-native id="wa-contact" name="contact" required><option value="">Selecione um contato</option>${contactOptions()}</select></div>
          <div class="wa-grid"><div class="field"><label for="wa-phone">WhatsApp com DDD e país</label><input id="wa-phone" name="phone" inputmode="tel" placeholder="5584999999999" required maxlength="30"></div><div class="field"><label for="wa-device">Enviar pelo computador</label><select data-native id="wa-device" name="device" required><option value="">Conecte um computador</option></select></div></div>
          <div class="field"><label for="wa-body">Mensagem que será enviada</label><textarea id="wa-body" name="body" required maxlength="4000" placeholder="Escolha um contato para preparar a abordagem."></textarea><p class="hint">Abordagem inicial: entender confirmação de consultas e faltas. Edite antes de enviar.</p></div>
          <div class="field"><label for="wa-time">Data e hora · Fortaleza (UTC−3)</label><input id="wa-time" name="time" type="datetime-local" required value="${defaultDate()}"></div>
          <div class="wa-note">Se o contato responder, os envios pendentes dele serão cancelados. O PC precisa estar ligado e conectado; atrasos acima de uma hora serão cancelados para você reagendar.</div>
          <button class="btn primary" type="submit" id="wa-review">Revisar agendamento →</button>
        </form>
      </section>
      <section class="wa-card"><span class="kicker">02 · conexão</span><h2>Seu computador</h2><div id="wa-devices"><p class="wa-empty">Carregando conexão…</p></div><button class="btn small" id="wa-add-device" type="button">＋ Vincular computador</button><p class="hint">O QR aparece aqui quando o executor local estiver rodando. A sessão do WhatsApp fica no seu PC.</p></section>
    </div>
    <div class="wa-section-head"><div><span class="kicker">03 · acompanhar</span><h2>Fila e histórico</h2></div><select data-native id="wa-filter" aria-label="Filtrar envios"><option value="all">Todos os estados</option><option value="queued">Agendadas</option><option value="sent">Enviadas</option><option value="attention">Precisam de atenção</option><option value="cancelled">Canceladas</option></select></div>
    <section class="wa-card" id="wa-jobs"><p class="wa-empty">Carregando os últimos 100 envios…</p></section>
    <div class="wa-section-head"><h2>Respostas recebidas</h2></div><section class="wa-card wa-replies" id="wa-replies"><p class="wa-empty">As respostas aparecerão aqui.</p></section>
    <details class="wa-card" style="margin-top:20px"><summary>Lista de não contatar</summary><div id="wa-blocks"></div></details>`;
  }

  function errorText(error) {
    if (/wa_|schema cache|does not exist|Could not find/i.test(error.message || '')) return 'A estrutura de agendamentos ainda não está instalada no banco. Aplique a migração supabase/migrations/20261023_whatsapp.sql no Supabase deste projeto.';
    return error.message || String(error);
  }
  function showError(error) {
    const box = document.querySelector('#wa-error');
    if (box) { box.hidden = false; box.textContent = errorText(error); }
  }
  async function refresh() {
    if (loading || !document.querySelector('#wa-compose')) return;
    loading = true;
    try {
      state = await Store.waLoad();
      if (!document.querySelector('#wa-compose')) return;
      document.querySelector('#wa-error').hidden = true;
      draw();
    } catch (error) { showError(error); }
    finally { loading = false; }
  }
  const chip = (text, cls = '') => `<span class="wa-badge ${cls}">${esc(text)}</span>`;
  function drawDrafts() {
    const box = document.querySelector('#wa-drafts');
    if (!box) return;
    pendingCount = state.drafts.length;
    box.hidden = !state.drafts.length;
    if (!state.drafts.length) return;
    const active = document.activeElement?.closest?.('.wa-draft')?.dataset.id;
    const typed = Object.fromEntries([...box.querySelectorAll('textarea[data-draft]')].map(t => [t.dataset.draft, t.value]));
    box.innerHTML = `<span class="kicker">agente · modo sombra</span><h2>Respostas para aprovar (${state.drafts.length})</h2><p class="hint">Nada sai sem você. Edite o texto e aprove, ou descarte e responda pelo seu celular.</p>` + state.drafts.map(r => {
      const c = Store.contacts.find(c => c.id === r.contact_id), d = r.decision || {};
      const text = typed[r.id] ?? r.suggestion;
      return `<article class="wa-job wa-draft" data-id="${esc(r.id)}"><div class="wa-job-head"><div><strong>${esc(c?.name || '+' + r.phone)}</strong><small> · +${esc(r.phone)} · ${date(r.created_at)}</small></div><div>${d.urgencia ? chip('Urgente', 'failed') : ''}${d.temperatura ? chip(d.temperatura) : ''}${d.intencao ? chip(d.intencao) : ''}</div></div>
        <p class="wa-quote">“${esc(r.inbound_body)}”</p>
        <label for="draft-${esc(r.id)}">Sua resposta${r.suggestion ? ' (sugerida pelo agente)' : ' (sem sugestão: escreva você)'}</label>
        <textarea id="draft-${esc(r.id)}" data-draft="${esc(r.id)}" maxlength="4000" rows="4">${esc(text)}</textarea>
        <p class="hint">Por que chegou aqui: ${esc(d.why || '—')}${(d.issues || []).length ? ' · bloqueado pelo validador: ' + esc(d.issues.join('; ')) : ''}</p>
        <div class="form-actions"><button class="btn primary small" type="button" data-wa="draft-approve" data-id="${esc(r.id)}">Aprovar e enviar</button><button class="btn small" type="button" data-wa="draft-reject" data-id="${esc(r.id)}">Descartar</button><a class="btn ghost small" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}">Abrir no WhatsApp ↗</a></div></article>`;
    }).join('');
    if (active) box.querySelector(`.wa-draft[data-id="${active}"] textarea`)?.focus();
  }
  function draw() {
    drawDrafts();
    const devSelect = document.querySelector('#wa-device');
    const desired = devSelect.value || draft.device;
    const choices = state.devices.filter(d => d.enabled);
    devSelect.innerHTML = choices.length ? choices.map(d => `<option value="${esc(d.id)}">${esc(d.name)}${alive(d) && d.status === 'ready' ? '' : ' · desconectado'}</option>`).join('') : '<option value="">Vincule um computador</option>';
    if (choices.some(d => d.id === desired)) devSelect.value = desired;
    document.querySelector('#wa-devices').innerHTML = state.devices.filter(d => d.enabled).map(d => `<div class="wa-device"><div class="wa-device-head"><strong>${esc(d.name)}</strong>${badge(alive(d) ? d.status : 'offline', d.paused ? 'Fila pausada' : null)}</div><p class="hint">Último sinal: ${date(d.heartbeat_at)} · intervalo de ${d.interval_seconds}s entre envios</p>${d.last_error ? `<p class="wa-error">${esc(d.last_error)}</p>` : ''}${alive(d) && d.status === 'qr' && /^data:image\/png;base64,/.test(d.qr || '') ? `<img class="wa-qr" alt="QR Code para conectar seu WhatsApp" src="${esc(d.qr)}"><p class="hint">WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>` : ''}<div class="form-actions"><button class="btn small" type="button" data-wa="pause" data-id="${esc(d.id)}">${d.paused ? 'Retomar fila' : 'Pausar fila'}</button><button class="btn ghost small" type="button" data-wa="revoke" data-id="${esc(d.id)}">Revogar acesso</button></div></div>`).join('') || '<p class="wa-empty">Vincule este PC para começar. Ele buscará os agendamentos pela internet.</p>';
    const jobs = state.messages.filter(m => filter === 'all' || (filter === 'attention' ? ['failed','uncertain'].includes(m.status) : m.status === filter));
    document.querySelector('#wa-jobs').innerHTML = jobs.map(m => `<article class="wa-job"><div class="wa-job-head"><div><strong>${esc(m.name)}</strong><small> · +${esc(m.phone)}</small></div>${badge(m.status)}</div><small>Agendado: ${date(m.scheduled_at)}${m.sent_at ? ' · enviado: ' + date(m.sent_at) : ''}</small><p>${esc(m.body)}</p>${m.last_error ? `<p class="hint">${esc(m.last_error)}</p>` : ''}${m.status === 'queued' ? `<button class="btn small" type="button" data-wa="cancel" data-id="${esc(m.id)}">Cancelar envio</button>` : ''}${['failed','uncertain','cancelled'].includes(m.status) ? `<button class="btn small" type="button" data-wa="reuse" data-id="${esc(m.id)}">${m.status === 'uncertain' ? 'Conferi no WhatsApp · preparar novo envio' : 'Preparar novo agendamento'}</button>` : ''} <button class="btn ghost small" type="button" data-wa="block" data-phone="${esc(m.phone)}">Não contatar</button></article>`).join('') || '<p class="wa-empty">Nenhum envio neste filtro. Prepare a primeira mensagem acima.</p>';
    document.querySelector('#wa-replies').innerHTML = state.replies.map(r => `<article class="wa-job"><div class="wa-job-head"><strong>+${esc(r.phone)}</strong><small>${date(r.received_at)}</small></div><p>${esc(r.body)}</p><a class="btn small" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}">Continuar no WhatsApp ↗</a></article>`).join('') || '<p class="wa-empty">Quando um contato agendado responder, a mensagem aparece aqui e os próximos envios dele são cancelados.</p>';
    document.querySelector('#wa-blocks').innerHTML = state.blocks.map(b => `<div class="wa-job-head wa-job"><span>+${esc(b.phone)} · ${esc(b.reason)}</span><button class="btn small" type="button" data-wa="unblock" data-phone="${esc(b.phone)}">Liberar contato</button></div>`).join('') || '<p class="wa-empty">Nenhum contato bloqueado.</p>';
  }
  async function action(button) {
    const { wa, id } = button.dataset;
    if (wa === 'draft-approve' || wa === 'draft-reject') {
      const approve = wa === 'draft-approve', text = document.querySelector(`textarea[data-draft="${id}"]`)?.value || '';
      if (approve && /\{[^}]+\}/.test(text)) return showError(new Error('Substitua os campos entre chaves antes de aprovar.'));
      button.disabled = true;
      try { await Store.waRpc('wa_draft_decide', { p_id: id, p_action: approve ? 'approve' : 'reject', p_text: approve ? text : null }); toast(approve ? 'Resposta na fila: sai em até 1 minuto' : 'Rascunho descartado'); await refresh(); }
      catch (error) { showError(error); button.disabled = false; }
      return;
    }
    if (wa === 'reuse') {
      const m = state.messages.find(m => m.id === id);
      document.querySelector('#wa-contact').value = m.contact_id || '';
      document.querySelector('#wa-phone').value = m.phone;
      document.querySelector('#wa-body').value = m.body;
      document.querySelector('#wa-time').value = defaultDate();
      remember(); requestId = null;
      document.querySelector('#wa-compose').scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    if (wa === 'revoke') {
      modal('<h2>Revogar este computador?</h2><p>Os agendamentos pendentes dele serão cancelados. Para usá-lo novamente, será necessário gerar um novo vínculo.</p><button class="btn danger" id="wa-confirm-revoke">Revogar computador</button>');
      document.querySelector('#wa-confirm-revoke').onclick = async e => { await control(id, false, e.currentTarget); document.querySelector('#modal').close(); }; return;
    }
    button.disabled = true;
    try {
      if (wa === 'pause') await control(id, true, button, true);
      if (wa === 'cancel') await Store.waRpc('wa_cancel', { p_id: id });
      if (wa === 'block' || wa === 'unblock') await Store.waRpc('wa_block', { p_phone: button.dataset.phone, p_blocked: wa === 'block' });
      await refresh();
    } catch (error) { showError(error); }
    finally { button.disabled = false; }
  }
  async function control(id, enabled, button, toggle = false) {
    const d = state.devices.find(d => d.id === id);
    button.disabled = true;
    try { await Store.waRpc('wa_control_device', { p_id: id, p_paused: toggle ? !d.paused : d.paused, p_interval: d.interval_seconds, p_enabled: enabled }); await refresh(); }
    catch (error) { showError(error); }
    finally { button.disabled = false; }
  }
  function addDevice() {
    modal('<h2>Vincular computador</h2><p>Crie uma chave exclusiva para o executor local. O login do site continua sendo o da equipe.</p><form id="wa-device-form" class="form"><div class="field"><label for="wa-device-name">Nome do computador</label><input id="wa-device-name" name="name" required maxlength="80" value="PC de Kellyson"></div><p id="wa-device-error" class="wa-error"></p><button class="btn primary" type="submit">Gerar conexão</button></form>');
    document.querySelector('#wa-device-form').onsubmit = async e => {
      e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
      try {
        const result = await Store.waRpc('wa_create_device', { p_name: e.target.elements.name.value.trim() });
        const connection = JSON.stringify({ supabaseUrl: ROTA_CONFIG.supabaseUrl, supabaseKey: ROTA_CONFIG.supabaseKey, token: result.token }, null, 2);
        modal('<div class="wa-connection"><h2>Conecte o executor no seu PC</h2><p>Esta chave é exibida uma vez. Cole a conexão na tela local do executor ou baixe o arquivo.</p><textarea id="wa-connection" readonly aria-label="Conexão do computador"></textarea><div class="form-actions"><button class="btn primary" id="wa-download" type="button">Baixar conexão</button><button class="btn" id="wa-copy" type="button">Copiar</button></div><p class="hint">No PC, abra o atalho “Indexa WhatsApp local”. Depois de vincular, escaneie o QR Code no WhatsApp.</p></div>');
        document.querySelector('#wa-connection').value = connection;
        document.querySelector('#wa-copy').onclick = async () => { try { await navigator.clipboard.writeText(connection); toast('Conexão copiada'); } catch { document.querySelector('#wa-connection').select(); } };
        document.querySelector('#wa-download').onclick = () => { const url = URL.createObjectURL(new Blob([connection], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'indexa-conexao.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
        await refresh();
      } catch (error) { document.querySelector('#wa-device-error').textContent = errorText(error); button.disabled = false; }
    };
  }
  function review(e) {
    e.preventDefault(); remember();
    const c = Store.contacts.find(c => c.id === draft.contact), n = phone(draft.phone), d = state.devices.find(d => d.id === draft.device && d.enabled);
    if (!c || !n || !d) return showError(new Error('Escolha um contato, um telefone válido e um computador.'));
    if (['Sem interesse', 'Não compensa'].includes(c.status) || state.blocks.some(b => phoneKey(b.phone) === phoneKey(n))) return showError(new Error('Este contato está marcado para não receber mensagens.'));
    if (!draft.body?.trim() || /\{[^}]+\}/.test(draft.body)) return showError(new Error('Complete a mensagem e substitua os campos entre chaves.'));
    const when = new Date(draft.time + ':00-03:00');
    if (!Number.isFinite(when.getTime()) || when <= new Date()) return showError(new Error('Escolha uma data e hora futura.'));
    const args = { p_id: requestId || crypto.randomUUID(), p_device_id: d.id, p_contact_id: c.id, p_phone: n, p_name: c.name, p_body: draft.body.trim(), p_scheduled_at: when.toISOString() };
    requestId = args.p_id;
    modal(`<h2>Revisar antes de agendar</h2><p><strong>${esc(c.name)}</strong> · +${esc(n)}<br>${date(when)} · ${esc(d.name)}</p><div class="wa-review">${esc(args.p_body)}</div>${!alive(d) || d.status !== 'ready' ? '<p class="wa-note">O PC está desconectado. O envio só ocorrerá se ele estiver pronto até uma hora depois do horário agendado.</p>' : ''}<p id="wa-save-error" class="wa-error"></p><div class="form-actions"><button class="btn primary" id="wa-confirm" type="button">Confirmar agendamento</button></div>`);
    document.querySelector('#wa-confirm').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try { await Store.waRpc('wa_schedule', args); document.querySelector('#modal').close(); draft = {}; requestId = null; document.querySelector('#wa-compose')?.reset(); const time = document.querySelector('#wa-time'); if (time) time.value = defaultDate(); toast('Mensagem agendada'); await refresh(); }
      catch (error) { const box = document.querySelector('#wa-save-error'); if (box) box.textContent = errorText(error); else toast(errorText(error)); button.disabled = false; }
    };
  }
  const DAILY_FIRST_CONTACTS = 5;
  const today = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const canStart = c => Boolean(c && c.kind !== 'government' && c.status === 'A enviar' && phone(c.phone));
  // Iniciar direto: revisão em um passo e envio imediato pela fila do computador vinculado.
  async function quickStart(c) {
    try {
      const data = await Store.waLoad();
      const n = phone(c.phone), d = data.devices.find(d => d.enabled && alive(d) && d.status === 'ready');
      if (!d) return toast('Seu PC não está conectado ao WhatsApp. Abra a aba WhatsApp para ver o estado.');
      if (['Sem interesse', 'Não compensa'].includes(c.status) || data.blocks.some(b => phoneKey(b.phone) === phoneKey(n))) return toast('Este contato está marcado para não receber mensagens.');
      const body = messageFor(c).trim();
      if (!body || /\{[^}]+\}/.test(body)) return toast('Complete a mensagem do contato antes de iniciar (há campos entre chaves).');
      const already = data.messages.filter(m => m.phone && phoneKey(m.phone) === phoneKey(n) && ['queued', 'sending', 'sent', 'uncertain'].includes(m.status));
      if (already.length) return toast('Este contato já tem mensagem agendada ou enviada. Veja a aba WhatsApp.');
      const todayCount = data.messages.filter(m => ['queued', 'sending', 'sent', 'uncertain'].includes(m.status) && today(m.created_at) === today(Date.now())).length;
      const args = { p_id: crypto.randomUUID(), p_device_id: d.id, p_contact_id: c.id, p_phone: n, p_name: c.name, p_body: body, p_scheduled_at: new Date().toISOString() };
      modal(`<h2>Iniciar conversa agora</h2><p><strong>${esc(c.name)}</strong> · +${esc(n)}<br>Sai em até 1 minuto, pelo ${esc(d.name)}.</p><div class="wa-review">${esc(body)}</div>${todayCount >= DAILY_FIRST_CONTACTS ? `<p class="wa-note">Hoje já são ${todayCount} envios na fila ou enviados (meta segura: ${DAILY_FIRST_CONTACTS} por dia). Considere deixar este para amanhã.</p>` : `<p class="hint">Hoje: ${todayCount} de ${DAILY_FIRST_CONTACTS} primeiros contatos.</p>`}<p id="wa-save-error" class="wa-error"></p><div class="form-actions"><button class="btn primary" id="wa-confirm" type="button">Enviar agora</button></div>`);
      document.querySelector('#wa-confirm').onclick = async event => {
        const button = event.currentTarget; button.disabled = true;
        try { await Store.waRpc('wa_schedule', args); document.querySelector('#modal').close(); toast('Na fila: sai em até 1 minuto'); }
        catch (error) { document.querySelector('#wa-save-error').textContent = errorText(error); button.disabled = false; }
      };
    } catch (error) { toast(errorText(error)); }
  }
  function bind() {
    clearInterval(timer);
    const form = document.querySelector('#wa-compose');
    for (const [key,value] of Object.entries(draft)) if (form.elements[key]) form.elements[key].value = value;
    form.addEventListener('input', () => { remember(); requestId = null; });
    document.querySelector('#wa-contact').onchange = e => {
      const c = Store.contacts.find(c => c.id === e.target.value);
      document.querySelector('#wa-phone').value = phone(c?.phone);
      document.querySelector('#wa-body').value = messageFor(c);
      remember(); requestId = null;
    };
    form.onsubmit = review;
    document.querySelector('#wa-refresh').onclick = refresh;
    document.querySelector('#wa-add-device').onclick = addDevice;
    document.querySelector('#wa-filter').value = filter;
    document.querySelector('#wa-filter').onchange = e => { filter = e.target.value; draw(); };
    document.querySelector('#app').onclick = e => { const b = e.target.closest('[data-wa]'); if (b && !b.disabled) void action(b); };
    void refresh();
    timer = setInterval(() => { if (!document.querySelector('#wa-compose')) return clearInterval(timer); if (!document.hidden) void refresh(); }, 10000);
  }
  window.addEventListener('hashchange', remember);
  Store.onChange(reason => { if (reason === 'auth' && !Store.user) { draft = {}; state = { devices: [], messages: [], replies: [], blocks: [], drafts: [] }; pendingCount = 0; clearInterval(timer); clearInterval(badgeTimer); } });
  // Contador do menu: consulta leve a cada 30s enquanto a equipe está logada.
  async function updateBadge() {
    if (document.hidden) return;
    try { const n = await Store.waDraftCount(); if (n !== pendingCount) { pendingCount = n; if (typeof renderChrome === 'function') renderChrome(); } } catch {}
  }
  Store.onChange(reason => { if (reason === 'load' && Store.mode === 'cloud') { clearInterval(badgeTimer); void updateBadge(); badgeTimer = setInterval(updateBadge, 30000); } });
  window.WhatsApp = { pending: () => pendingCount, page, bind, canStart, quickStart, compose(c) { draft = { contact: c.id, phone: phone(c.phone), body: messageFor(c), time: defaultDate() }; requestId = null; } };
})();
