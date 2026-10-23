import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
const dir = join(homedir(), '.config/systemd/user');
const desktopDir = join(homedir(), '.local/share/applications');
mkdirSync(dir, { recursive: true }); mkdirSync(desktopDir, { recursive: true });
// O systemd não herda o PATH do shell: inclui node e opencode para o agente funcionar em segundo plano.
const binDirs = [dirname(process.execPath), join(homedir(), '.npm-global/bin'), join(homedir(), '.local/bin'), '/usr/local/bin', '/usr/bin', '/bin'];
try { binDirs.unshift(dirname(execFileSync('which', ['opencode'], { encoding: 'utf8' }).trim())); } catch {}
const servicePath = [...new Set(binDirs)].join(':');
const quote = value => '"' + value.replace(/[%"\\]/g, c => c === '%' ? '%%' : '\\' + c) + '"';
writeFileSync(join(dir, 'indexa-whatsapp.service'), `[Unit]\nDescription=Indexa WhatsApp local\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${root.replaceAll("%", "%%")}\nExecStart=${quote(process.execPath)} ${quote(join(root, 'src/server.js'))}\nRestart=always\nRestartSec=10\nTimeoutStopSec=15\nUMask=0077\nEnvironment=NODE_ENV=production\nEnvironment=PATH=${servicePath.replace(/%/g, '%%')}\n\n[Install]\nWantedBy=default.target\n`);
writeFileSync(join(desktopDir, 'indexa-whatsapp.desktop'), `[Desktop Entry]\nType=Application\nName=Indexa WhatsApp local\nComment=Conectar o WhatsApp ao painel Indexa\nExec=${quote(process.execPath)} ${quote(join(root, 'src/open-local.js'))}\nIcon=${join(root, '../assets/indexa-mark.svg')}\nTerminal=false\nCategories=Network;Office;\n`);
execFileSync('systemctl', ['--user','daemon-reload']);
execFileSync('systemctl', ['--user','enable','--now','indexa-whatsapp.service']);
console.log('Serviço instalado. Abra “Indexa WhatsApp local” no menu de aplicativos.');
