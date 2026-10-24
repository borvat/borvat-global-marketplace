/** Server-only command metadata. No inventory, invoice, points or monetary balance tables. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw Error('Command must contain finite JSON values');
}
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw Error('Invalid command identity');
  return value;
};

/** authorize() MUST re-read trusted server identity/scope; request JSON is never authority. */
export class CommandJournal {
  constructor({ path, authorize, now = Date.now, leaseMs = 30_000, maxDispatches = 3 }) {
    if (typeof authorize !== 'function') throw Error('A current server authorizer is required');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 60_000 ||
        !Number.isSafeInteger(maxDispatches) || maxDispatches < 1 || maxDispatches > 10) throw Error('Invalid retry policy');
    this.authorize = authorize; this.now = now; this.leaseMs = leaseMs; this.maxDispatches = maxDispatches;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS channel_commands (
        id TEXT PRIMARY KEY, company TEXT NOT NULL, source TEXT NOT NULL, operation TEXT NOT NULL,
        external_key TEXT NOT NULL, payload_hash TEXT NOT NULL, envelope TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','dispatching','unknown','completed','rejected')),
        dispatches INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
        result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(company, source, operation, external_key));`);
  }
  close() { this.db.close(); }
  scope(principal, company, operation) {
    identifier(company); identifier(operation);
    if (this.authorize(principal, company, operation) !== true) throw Error('Current company/operation scope denied');
  }
  tx(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  enqueue(principal, { company, source, operation, externalKey, payload }) {
    this.scope(principal, company, operation); identifier(source); identifier(externalKey);
    const body = canonical(payload);
    if (body.length > 100_000) throw Error('Command is too large');
    const id = digest(canonical([company, source, operation, externalKey]));
    const hash = digest(body);
    return this.tx(() => {
      const old = this.row(id);
      if (old) {
        if (old.payload_hash !== hash) throw Error('Idempotency payload conflict');
        return this.view(old);
      }
      const at = this.now();
      const envelope = { schema_version: 1, mode: 'test', command_id: id,
        correlation_id: id, company_id: company, source, operation,
        idempotency_key: id, external_key: externalKey, payload: JSON.parse(body) };
      this.db.prepare(`INSERT INTO channel_commands
        (id,company,source,operation,external_key,payload_hash,envelope,state,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'pending',?,?)`).run(id,company,source,operation,externalKey,hash,JSON.stringify(envelope),at,at);
      return this.view(this.row(id));
    });
  }
  row(id) { return this.db.prepare('SELECT * FROM channel_commands WHERE id=?').get(id); }
  view(row) {
    return { id: row.id, company: row.company, operation: row.operation, state: row.state,
      dispatches: row.dispatches, result: row.result ? JSON.parse(row.result) : null };
  }
  get(principal, company, id) {
    const row = this.row(id);
    // No foreign-company metadata is returned, including when the command ID is known.
    if (!row || row.company !== company) throw Error('Command not found');
    this.scope(principal, company, row.operation);
    return this.view(row);
  }
  async run(principal, company, id, receiver) {
    const row = this.row(id);
    if (!row || row.company !== company) throw Error('Command not found');
    this.scope(principal, company, row.operation);
    if (receiver?.mode !== 'test' || receiver.durableIdempotency !== true ||
        typeof receiver.lookup !== 'function' || typeof receiver.execute !== 'function')
      throw Error('An explicit test receiver with durable lookup/idempotency is required');
    const lease = randomUUID();
    const claimed = this.tx(() => {
      const current = this.row(id);
      if (['completed','rejected'].includes(current.state) || current.lease_until > this.now()) return null;
      this.db.prepare(`UPDATE channel_commands SET state='dispatching',lease=?,lease_until=?,updated_at=? WHERE id=?`)
        .run(lease,this.now()+this.leaseMs,this.now(),id);
      return current;
    });
    if (!claimed) return this.get(principal, company, id);
    const envelope = JSON.parse(claimed.envelope);
    const finish = (state, result = null) => {
      this.tx(() => {
        this.db.prepare(`UPDATE channel_commands SET state=?,result=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND lease=?`)
          .run(state,result === null ? null : canonical(result),this.now(),id,lease);
      });
      return this.get(principal, company, id);
    };
    const accept = evidence => {
      if (!evidence || evidence.commandId !== id || evidence.company !== company ||
          !['completed','rejected'].includes(evidence.status) || !Array.isArray(evidence.references) ||
          (evidence.status === 'completed' && evidence.references.length === 0) ||
          evidence.references.some(ref => typeof ref !== 'string' || !ref || ref.length > 200))
        throw Error('Unverified receiver result');
      return finish(evidence.status, evidence);
    };
    try {
      // Lookup BEFORE every dispatch, including recovery after process death/lost response.
      // No local DB transaction spans either remote call.
      const found = await receiver.lookup(envelope);
      if (found?.kind === 'found') return accept(found.evidence);
      if (found?.kind !== 'absent' || found.authoritative !== true) return finish('unknown');
      this.scope(principal, company, row.operation);
      const allowed = this.tx(() => {
        const current = this.row(id);
        if (current.lease !== lease || current.dispatches >= this.maxDispatches) return false;
        this.db.prepare('UPDATE channel_commands SET dispatches=dispatches+1 WHERE id=? AND lease=?').run(id,lease);
        return true;
      });
      if (!allowed) return finish('unknown');
      return accept(await receiver.execute(envelope));
    } catch {
      // Transport failure, malformed evidence and local post-call failure NEVER mean rejection.
      // Keep the durable identity; a later run reads the receiver before any possible resend.
      return finish('unknown');
    }
  }
}
