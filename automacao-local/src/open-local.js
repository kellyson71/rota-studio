import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const url = readFileSync(new URL('../data/acesso-local.txt', import.meta.url), 'utf8').trim();
spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
