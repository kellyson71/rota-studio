import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';

export const DEFAULT_OPENING='Oi! Sou o Kellyson, da Indexa. Como vocês fazem hoje a confirmação das consultas?';
export const openingFor=options=>options.mode==='whatsapp'&&!options.noOpening?(options.opening??DEFAULT_OPENING):null;

const HELP = `Teste interativo Indexa

npm run testar
npm run testar -- --modo whatsapp --numero 5584999990000
npm run testar -- --modo terminal

whatsapp: cliente conversa no WhatsApp; você autoriza neste terminal.
terminal: você escreve como cliente aqui; autoriza no WhatsApp do admin.
O número padrão é o admin. Cada execução começa uma conversa nova.
No modo whatsapp, a primeira abordagem é enviada ao iniciar.
Use --abertura "TEXTO" para trocar ou --sem-abertura para aguardar o cliente.

/enviar TEXTO   envia uma abertura ao cliente no modo whatsapp
/admin COMANDO  comando de autorização no modo whatsapp (ou escreva sem /admin)
/status         estado deste teste
/ajuda          mostra esta ajuda
/sair           encerra e libera a automação normal

No modo terminal, texto sem / é uma mensagem do cliente.
No modo whatsapp: ok CODIGO, não CODIGO, edita CODIGO TEXTO,
orcar TELEFONE agenda aquisicao | agendamento,recepcao,
pausar TELEFONE e retomar TELEFONE.
Os horários comerciais são ignorados SOMENTE na simulação.
Mensagens no canal WhatsApp são reais. O histórico fica apenas neste PC.`;

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--help', '-h'].includes(arg)) { options.help = true; continue; }
    if(arg==='--sem-abertura'){options.noOpening=true;continue;}
    const key = { '--modo': 'mode', '--numero': 'phone', '--abertura': 'opening' }[arg];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Opção inválida ou sem valor: ${arg}`);
    options[key] = args[++i];
  }
  if (options.mode && !['whatsapp', 'terminal'].includes(options.mode)) throw new Error('--modo aceita whatsapp ou terminal.');
  if(options.noOpening&&options.opening!==undefined)throw new Error('Use --abertura ou --sem-abertura, escolha apenas uma opção.');
  if(options.mode==='terminal'&&options.opening!==undefined)throw new Error('--abertura é usada no modo whatsapp.');
  return options;
}
const clean = text => String(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');

export async function runTerminal(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = process.env.INDEXA_DATA_DIR || path.join(root, 'data');
  let base, key;
  try {
    base = new URL(fs.readFileSync(path.join(dataDir, 'acesso-local.txt'), 'utf8').trim()); base.hash = '';
    if (base.hostname !== '127.0.0.1') throw new Error('Endereço local inválido.');
    key = fs.readFileSync(path.join(dataDir, 'local-key'), 'utf8').trim();
  } catch { throw new Error('Executor não configurado. Inicie o serviço indexa-whatsapp primeiro.'); }
  const api = async (route, body) => {
    const response = await fetch(new URL('/api/test' + route, base), { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Indexa-Key': key, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
  };
  const defaults = await api('');
  if (defaults.session) throw new Error('Já existe um teste ativo. Feche o terminal anterior com /sair ou aguarde 90 segundos após ele desconectar.');
  if (defaults.status !== 'ready') throw new Error(`WhatsApp está ${defaults.status}. Aguarde a conexão e execute novamente.`);
  let rl;
  if (process.stdin.isTTY) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('1 — Cliente no WhatsApp / autorizações aqui (padrão)\n2 — Cliente aqui / autorizações no WhatsApp');
    if (!options.mode) {
      const choice = (await rl.question('Modo [1]: ')).trim();
      if (choice && !['1', '2'].includes(choice)) { rl.close(); throw new Error('Escolha 1 ou 2.'); }
      options.mode = choice === '2' ? 'terminal' : 'whatsapp';
    }
    if (!options.phone) options.phone = (await rl.question(`Número do cliente [${defaults.adminPhone || 'não configurado'}]: `)).trim() || defaults.adminPhone;
  }
  options.mode ||= 'whatsapp'; options.phone ||= defaults.adminPhone;
  let initial;
  try { initial = await api('/start', { mode: options.mode, phone: options.phone }); }
  catch (error) { rl?.close(); throw error; }
  rl ||= createInterface({ input: process.stdin, output: process.stdout });
  const lines=rl[Symbol.asyncIterator]();
  const id = initial.session.id;
  let cursor = 0, ended = false, timer, polling = false;
  const show = data => {
    if(!data.events?.length&&!data.session?.closed)return;
    if (process.stdout.isTTY) { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); }
    for (const e of data.events || []) {
      cursor = Math.max(cursor, e.seq);
      console.log(clean(`\n[${new Date(e.at).toLocaleTimeString('pt-BR')}] ${e.type.toUpperCase()}${e.channel ? ' · ' + e.channel : ''}\n${e.text}`));
      if(e.type==='agente'&&e.channel==='whatsapp')console.log(clean(`Aguardando sua resposta no WhatsApp de +${initial.session.phone}. As autorizações aparecerão aqui.`));
    }
    if (data.session?.closed) { ended = true; rl.close(); }
    if (!ended && process.stdout.isTTY) rl.prompt(true);
  };
  const poll = async () => {
    if (ended || polling) return;
    polling = true;
    try { show(await api(`/${id}/events?after=${cursor}`)); }
    catch (error) { console.log(clean('\nFalha ao acompanhar teste: ' + error.message)); }
    finally { polling = false; if (!ended) timer = setTimeout(poll, 1000); }
  };
  const stop = async () => {
    if (ended) return;
    ended = true; clearTimeout(timer); rl.close();
    try { await api(`/${id}/stop`, {}); console.log('\nTeste encerrado. Automação normal liberada após concluir a operação em andamento.'); }
    catch { console.log('\nNão consegui encerrar pelo serviço. A sessão expira em até 90 segundos sem este terminal.'); }
  };
  const onSignal = () => { void stop(); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal); rl.on('SIGINT', onSignal);
  console.log(clean(`\nSessão ${id.slice(0, 8)} · cliente +${initial.session.phone}\n${options.mode === 'whatsapp' ? 'Converse pelo WhatsApp. Digite as autorizações aqui.'+(options.noOpening?' Use /enviar TEXTO para iniciar a abordagem.':' Vou enviar a primeira abordagem agora.') : 'Escreva abaixo como cliente. Os códigos de autorização chegam ao WhatsApp do admin.'}\n/ajuda mostra os comandos; /sair encerra.\n`));
  rl.setPrompt(options.mode === 'whatsapp' ? 'admin> ' : 'cliente> '); show(initial);
  timer = setTimeout(poll, 500);
  try {
    const opening=openingFor(options);
    if(opening)await api(`/${id}/input`,{kind:'opening',text:opening});
    for await (const input of lines) {
      const line = input.trim(); if (!line) { rl.prompt(); continue; }
      if (line === '/sair') break;
      try {
        if (line === '/ajuda') console.log(HELP);
        else if (line === '/status') console.log(clean(JSON.stringify((await api(`/${id}/events?after=${cursor}`)).session, null, 2)));
        else {
          let kind = options.mode === 'terminal' ? 'client' : 'admin', text = line;
          if (line.startsWith('/enviar ')) { kind = 'opening'; text = line.slice(8); }
          else if (line.startsWith('/admin ')) { kind = 'admin'; text = line.slice(7); }
          else if (line.startsWith('/')) throw new Error('Comando desconhecido. Use /ajuda.');
          await api(`/${id}/input`, { kind, text });
        }
      } catch (error) { console.log(clean('Não executei: ' + error.message)); }
      if (process.stdout.isTTY) rl.prompt();
    }
  } finally {
    await stop(); clearTimeout(timer);
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runTerminal().catch(error => { console.error(clean(error.message)); process.exitCode = 1; });
}
