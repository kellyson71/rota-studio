import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync,readFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

test('executor exige chave local e recusa vínculos inválidos',async t=> {
  const dir=mkdtempSync(join(tmpdir(),'indexa-http-'));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../src/server.js',import.meta.url))],{env:{...process.env,INDEXA_DATA_DIR:dir,PORT:'0'},stdio:'ignore'});
  t.after(async()=> { child.kill('SIGTERM'); await new Promise(r=>child.on('exit',r));rmSync(dir,{recursive:true,force:true}); });
  const access=join(dir,'acesso-local.txt');
  for(let i=0;i<100&&!existsSync(access);i++) await new Promise(r=>setTimeout(r,50));
  const url=new URL(readFileSync(access,'utf8').trim());const key=url.hash.slice(1),base=url.origin;
  assert.equal((await fetch(base+'/api/status')).status,401);
  assert.equal((await fetch(base+'/api/test')).status,401);
  assert.equal((await fetch(base+'/api/test/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'whatsapp'})})).status,401);
  const hostileHost=await new Promise((resolve,reject)=> { const req=http.get(base+'/api/status',{headers:{Host:'malicious.example','X-Indexa-Key':key}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject); });
  assert.equal(hostileHost,403);
  const state=await (await fetch(base+'/api/status',{headers:{'X-Indexa-Key':key}})).json();
  assert.equal(state.configured,false);assert.equal(state.status,'offline');assert.equal(JSON.stringify(state).includes(key),false);
  const testState=await(await fetch(base+'/api/test',{headers:{'X-Indexa-Key':key}})).json();
  assert.equal(testState.session,null);
  assert.equal((await fetch(base+'/api/test/start',{method:'POST',headers:{'Content-Type':'application/json','X-Indexa-Key':key},body:JSON.stringify({mode:'whatsapp'})})).status,409);
  const invalid=await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json','X-Indexa-Key':key},body:JSON.stringify({supabaseUrl:'http://attacker.example',token:'x',supabaseKey:'x'})});
  assert.equal(invalid.status,400);assert.equal(existsSync(join(dir,'connection.json')),false);
});
