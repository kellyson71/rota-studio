import { DatabaseSync } from 'node:sqlite';

export class Journal {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, claim TEXT NOT NULL, status TEXT NOT NULL, remote_id TEXT, error TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER DEFAULT 0, done INTEGER DEFAULT 0);
    `);
    // Banco criado antes da espera crescente: acrescenta a coluna uma única vez.
    if (!this.db.prepare('PRAGMA table_info(agent_tasks)').all().some(c => c.name === 'next_at')) this.db.exec('ALTER TABLE agent_tasks ADD COLUMN next_at INTEGER DEFAULT 0');
    // Linhas sem identificador (de uma versão anterior) travariam a fila inteira.
    this.db.exec('DELETE FROM replies WHERE id IS NULL; DELETE FROM agent_tasks WHERE id IS NULL');
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
  agentEnqueue(data) { if (!data.id || !data.phone) return; this.db.prepare('INSERT OR IGNORE INTO agent_tasks(id,payload) VALUES(?,?)').run(data.id, JSON.stringify(data)); }
  agentNext() { return this.db.prepare('SELECT rowid, * FROM agent_tasks WHERE done=0 AND attempts<5 AND next_at<=? ORDER BY rowid LIMIT 1').get(Math.floor(Date.now() / 1000)); }
  // delay > 0: espera crescente (modelo inacessível); sem delay: tenta de novo no próximo ciclo.
  agentFail(id, delay = 0) { this.db.prepare('UPDATE agent_tasks SET attempts=attempts+1, next_at=? WHERE id=?').run(delay ? Math.floor(Date.now() / 1000) + delay : 0, id); }
  agentPending() { return this.db.prepare('SELECT rowid, * FROM agent_tasks WHERE done=0 AND attempts<5').all(); }
  agentSeen(id) { return Boolean(this.db.prepare('SELECT 1 FROM agent_tasks WHERE id=?').get(id)); }
  agentDone(id) { this.db.prepare('UPDATE agent_tasks SET done=1 WHERE id=?').run(id); }
  close() { this.db.close(); }
}
