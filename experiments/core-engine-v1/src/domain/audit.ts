/** Append-only audit trail and transactional outbox. Both are written inside the caller's transaction. */

import type { PoolClient } from '../db/pool.ts';

export interface AuditEntry {
  readonly actorUserId?: string | null;
  readonly actorRole?: string | null;
  readonly organizationId?: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly correlationId?: string | null;
  readonly payload?: Record<string, unknown>;
}

export async function writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `insert into audit_log
       (actor_user_id, actor_role, organization_id, action, entity_type, entity_id, correlation_id, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.organizationId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.correlationId ?? null,
      JSON.stringify(entry.payload ?? {}),
    ],
  );
}

export async function emitEvent(
  client: PoolClient,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query('insert into outbox_events (topic, payload) values ($1, $2::jsonb)', [
    topic,
    JSON.stringify(payload),
  ]);
}