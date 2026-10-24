import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for(const mode of ['terminal','whatsapp'])test(`CLI ${mode}: inicia conversa, acompanha eventos e encerra sem expor chave`,async t=>{
 const dir=mkdtempSync(join(tmpdir(),'indexa-terminal-')),key='private-fixture-key',calls=[];
 const state={id:'fixture-session',mode,phone:'5584999990000',closed:false};
 const server=http.createServer(async(req,res)=>{
  assert.equal(req.headers['x-indexa-key'],key);
  let body='';for await(const chunk of req)body+=chunk;
  calls.push({path:req.url,body:body?JSON.parse(body):null});
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/test')res.end(JSON.stringify({adminPhone:state.phone,status:'ready',session:null}));
  else if(req.url==='/api/test/start')res.end(JSON.stringify({session:state,events:[]}));
  else if(req.url.includes('/events'))res.end(JSON.stringify({session:state,events:[{seq:1,at:new Date().toISOString(),type:'agente',text:'Olá pelo terminal.'}]}));
  else res.end(JSON.stringify({ok:true}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 writeFileSync(join(dir,'local-key'),key);writeFileSync(join(dir,'acesso-local.txt'),`http://127.0.0.1:${server.address().port}/#${key}`);
 const child=spawn(process.execPath,[fileURLToPath(new URL('../src/test-terminal.js',import.meta.url)),'--modo',mode],{env:{...process.env,INDEXA_DATA_DIR:dir},stdio:['pipe','pipe','pipe']});
 t.after(()=>{child.kill();server.close();rmSync(dir,{recursive:true,force:true});});
 let out='',err='',started=false,finished=false;
 child.stdout.on('data',chunk=>{
  out+=chunk;
  if(!started&&out.includes('/sair encerra')){started=true;child.stdin.write(mode==='terminal'?'Quero conhecer o sistema.\n':'status\n');}
  if(!finished&&out.includes('Olá pelo terminal.')){finished=true;child.stdin.write('/sair\n');}
 });
 child.stderr.on('data',chunk=>{err+=chunk;});
 const code=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('CLI não concluiu: '+out+' '+err));},8000);child.on('exit',code=>{clearTimeout(timeout);resolve(code);});});
 assert.equal(code,0,err);assert.equal(out.includes(key),false);
 if(mode==='terminal'){
  assert.ok(calls.some(c=>c.path.endsWith('/input')&&c.body.kind==='client'&&c.body.text==='Quero conhecer o sistema.'));
  assert.equal(calls.some(c=>c.body?.kind==='opening'),false);
 }else{
  assert.ok(calls.some(c=>c.path.endsWith('/input')&&c.body.kind==='opening'&&c.body.text.includes('Como vocês fazem hoje a confirmação das consultas?')));
  assert.ok(calls.some(c=>c.body?.kind==='admin'&&c.body.text==='status'));
 }
 assert.ok(calls.some(c=>c.path.endsWith('/stop')));
});
