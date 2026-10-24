import { DatabaseSync } from 'node:sqlite';

export class Journal {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, claim TEXT NOT NULL, status TEXT NOT NULL, remote_id TEXT, error TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, body TEXT NOT NULL, attempts INTEGER DEFAULT 0, sent INTEGER DEFAULT 0);
          CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS reminders(draft_id TEXT PRIMARY KEY, last_at INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER DEFAULT 0, done INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS manual_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS parts(job_id TEXT NOT NULL,part_index INTEGER NOT NULL,claim TEXT NOT NULL,phone TEXT NOT NULL,body TEXT NOT NULL,started_at INTEGER NOT NULL,remote_id TEXT,synced INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(job_id,part_index));
      CREATE TABLE IF NOT EXISTS automation_ids(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS internal_outputs(id TEXT PRIMARY KEY,phone TEXT NOT NULL,body TEXT NOT NULL,started_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS admin_events(id TEXT PRIMARY KEY,sender TEXT NOT NULL,command TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS test_inputs(id TEXT PRIMARY KEY);
    `);
    // Banco criado antes da espera crescente: acrescenta a coluna uma única vez.
    if (!this.db.prepare('PRAGMA table_info(agent_tasks)').all().some(c => c.name === 'next_at')) this.db.exec('ALTER TABLE agent_tasks ADD COLUMN next_at INTEGER DEFAULT 0');
    if (!this.db.prepare('PRAGMA table_info(agent_tasks)').all().some(c => c.name === 'queued_at')) this.db.exec('ALTER TABLE agent_tasks ADD COLUMN queued_at INTEGER NOT NULL DEFAULT 0');
    // Linhas sem identificador (de uma versão anterior) travariam a fila inteira.
    this.db.exec('DELETE FROM replies WHERE id IS NULL; DELETE FROM agent_tasks WHERE id IS NULL');
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('manualCaptureSince',?)").run(String(Date.now()));
    // Nunca repete uma chamada que possa ter sido aceita pelo WhatsApp.
    this.db.prepare("UPDATE jobs SET status='uncertain',error='Executor reiniciou durante o envio; confira o WhatsApp',synced=0 WHERE status='started'").run();
  }
  begin(job) {
    return this.db.prepare("INSERT OR IGNORE INTO jobs(id,claim,status) VALUES(?,?,'started')").run(job.id, job.claim_token).changes === 1;
  }
  finish(id, status, remoteId = null, error = null) {
    this.db.prepare('UPDATE jobs SET status=?,remote_id=?,error=?,synced=0 WHERE id=?').run(status, remoteId, error, id);
  }
  pending() { return this.db.prepare("SELECT * FROM jobs WHERE synced=0 AND status IN ('sent','failed','uncertain')").all(); }
  synced(id) { this.db.prepare('UPDATE jobs SET synced=1 WHERE id=?').run(id); }
  reply(data) { if (!data.p_id) return; this.db.prepare('INSERT OR IGNORE INTO replies VALUES(?,?)').run(data.p_id, JSON.stringify(data)); }
  replies() { return this.db.prepare('SELECT * FROM replies').all(); }
  replyDone(id) { this.db.prepare('DELETE FROM replies WHERE id=?').run(id); }
  manual(data) { if (data.p_id) this.db.prepare('INSERT OR IGNORE INTO manual_outbox VALUES(?,?)').run(data.p_id,JSON.stringify(data)); }
  manuals() { return this.db.prepare('SELECT * FROM manual_outbox').all(); }
  manualDone(id) { this.db.prepare('DELETE FROM manual_outbox WHERE id=?').run(id); }
  partBegin(job,index,text) { this.db.prepare('INSERT OR IGNORE INTO parts(job_id,part_index,claim,phone,body,started_at) VALUES(?,?,?,?,?,?)').run(job.id,index,job.claim_token,job.phone,text,Date.now()); }
  partFinish(id,index,remoteId) { this.db.prepare('UPDATE parts SET remote_id=? WHERE job_id=? AND part_index=?').run(remoteId,id,index); this.automationSeen(remoteId); }
  partsPending() { return this.db.prepare('SELECT * FROM parts WHERE remote_id IS NOT NULL AND synced=0 ORDER BY started_at,part_index').all(); }
  partSynced(id,index) { this.db.prepare('UPDATE parts SET synced=1 WHERE job_id=? AND part_index=?').run(id,index); }
  automationSeen(id) { if (id) this.db.prepare('INSERT OR IGNORE INTO automation_ids VALUES(?)').run(id); }
  testInputSeen(id) {return Boolean(id&&this.db.prepare('SELECT 1 FROM test_inputs WHERE id=?').get(id));}
  testInputRemember(id) {if(id)this.db.prepare('INSERT OR IGNORE INTO test_inputs VALUES(?)').run(id);}
  manualCaptureSince() { return Number(this.db.prepare("SELECT value FROM meta WHERE key='manualCaptureSince'").get().value); }
  internalStart(id,phone,body) { this.db.prepare('INSERT INTO internal_outputs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at').run(id,phone,body,Date.now()); }
  isAutomation(id,phone,body,at=Date.now()) {
    if (id && (this.db.prepare('SELECT 1 FROM automation_ids WHERE id=?').get(id) || this.db.prepare('SELECT 1 FROM jobs WHERE remote_id=?').get(id))) return true;
    // Le message_create peut précéder le retour de sendMessage. Même corps, destinataire et courte fenêtre.
    const candidates=this.db.prepare('SELECT phone FROM parts WHERE body=? AND started_at BETWEEN ? AND ? UNION ALL SELECT phone FROM internal_outputs WHERE body=? AND started_at BETWEEN ? AND ?').all(body,at-10000,at+5000,body,at-10000,at+5000);
    const key=p=>p.startsWith('55')&&p.length===13&&p[4]==='9'?p.slice(0,4)+p.slice(5):p;
    if (candidates.some(p=>key(p.phone)===key(phone))) { this.automationSeen(id);return true; }
    return false;
  }
  agentEnqueue(data) { if (!data.id || !data.phone) return; this.db.prepare('INSERT OR IGNORE INTO agent_tasks(id,payload,queued_at) VALUES(?,?,?)').run(data.id, JSON.stringify(data),Date.now()); }
  agentNext() { return this.db.prepare('SELECT rowid, * FROM agent_tasks WHERE done=0 AND attempts<5 AND next_at<=? ORDER BY rowid LIMIT 1').get(Math.floor(Date.now() / 1000)); }
  // delay > 0: espera crescente (modelo inacessível); sem delay: tenta de novo no próximo ciclo.
  agentFail(id, delay = 0) { this.db.prepare('UPDATE agent_tasks SET attempts=attempts+1, next_at=? WHERE id=?').run(delay ? Math.floor(Date.now() / 1000) + delay : 0, id); }
  agentPending() { return this.db.prepare('SELECT rowid, * FROM agent_tasks WHERE done=0 AND attempts<5').all(); }
  agentSeen(id) { return Boolean(this.db.prepare('SELECT 1 FROM agent_tasks WHERE id=?').get(id)); }
  agentDone(id) { this.db.prepare('UPDATE agent_tasks SET done=1 WHERE id=?').run(id); }
  agentReopen(id) { this.db.prepare('UPDATE agent_tasks SET done=0,attempts=0,next_at=0,queued_at=? WHERE id=?').run(Date.now(),id); }
  noticeEnqueue(id, body) { this.db.prepare('INSERT OR IGNORE INTO notices(id,body) VALUES(?,?)').run(id, body); }
  noticesPending() { return this.db.prepare('SELECT * FROM notices WHERE sent=0 AND attempts<5 ORDER BY rowid').all(); }
  noticeSent(id) { this.db.prepare('UPDATE notices SET sent=1 WHERE id=?').run(id); }
  noticeFail(id) { this.db.prepare('UPDATE notices SET attempts=attempts+1 WHERE id=?').run(id); }
  // Marca e informa se é a primeira vez: o mesmo comando chega pelo tempo real e pela varredura.
  commandFirst(id) { return this.db.prepare('INSERT OR IGNORE INTO commands(id) VALUES(?)').run(id).changes === 1; }
  adminEvent(id,sender,command,response) {this.db.prepare('INSERT OR IGNORE INTO admin_events VALUES(?,?,?,?,?)').run(id,sender,command,response,Date.now());}
  reminderLast(draftId) { return this.db.prepare('SELECT last_at FROM reminders WHERE draft_id=?').get(draftId)?.last_at ?? null; }
  reminderSet(draftId, at) { this.db.prepare('INSERT INTO reminders(draft_id,last_at) VALUES(?,?) ON CONFLICT(draft_id) DO UPDATE SET last_at=excluded.last_at').run(draftId, at); }
  close() { this.db.close(); }
}
