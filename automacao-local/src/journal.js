import { DatabaseSync } from 'node:sqlite';

export class Journal {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, claim TEXT NOT NULL, status TEXT NOT NULL, remote_id TEXT, error TEXT, synced INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    `);
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
  reply(data) { this.db.prepare('INSERT OR IGNORE INTO replies VALUES(?,?)').run(data.p_id, JSON.stringify(data)); }
  replies() { return this.db.prepare('SELECT * FROM replies').all(); }
  replyDone(id) { this.db.prepare('DELETE FROM replies WHERE id=?').run(id); }
  close() { this.db.close(); }
}
