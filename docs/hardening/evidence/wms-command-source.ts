/** Contract for a future authenticated warehouse gateway.
 * This module is pure and does not connect to the database or authorize a user.
 * The caller's org/account/actor IDs must always come from a trusted server session.
 */
import type { WarehouseEventKind } from "./warehouse-audit";

export type WarehouseCommand = {
  orderId: string;
  kind: WarehouseEventKind;
  operationKey: string;
  evidenceReference?: string;
};
export type TrustedWarehouseScope = {
  organizationId: string;
  channelId: string;
  actorUserId: string;
  role: "admin" | "warehouse" | "viewer";
};
export type CommandDecision = { allowed: true; record: {
  organization_id: string; channel_id: string; order_id: string;
  actor_user_id: string; event_kind: WarehouseEventKind;
  operation_key: string; evidence_reference: string | null;
}} | { allowed: false; reason: string };

export function validateWarehouseCommand(command: WarehouseCommand, trusted: TrustedWarehouseScope): CommandDecision {
  if (trusted.role !== "admin" && trusted.role !== "warehouse") return { allowed: false, reason: "ROLE_DENIED" };
  if (!trusted.organizationId || !trusted.channelId || !trusted.actorUserId) return { allowed: false, reason: "UNVERIFIED_SCOPE" };
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(command.orderId)) return { allowed: false, reason: "INVALID_ORDER_ID" };
  if (!/^[A-Za-z0-9:_-]{12,128}$/.test(command.operationKey)) return { allowed: false, reason: "INVALID_OPERATION_KEY" };
  const kinds: WarehouseEventKind[] = ["PICK_LIST_PRINTED","PICKING_STARTED","PICKING_COMPLETED","PACKING_CHECKED","CARRIER_LABEL_VERIFIED","HANDOFF_RECORDED"];
  if (!kinds.includes(command.kind)) return { allowed: false, reason: "UNKNOWN_COMMAND" };
  if (command.kind === "HANDOFF_RECORDED") return { allowed: false, reason: "HANDOFF_REQUIRES_SERVER_VERIFICATION" };
  if (command.kind === "CARRIER_LABEL_VERIFIED") return { allowed: false, reason: "LABEL_VERIFICATION_REQUIRES_PROVIDER_READBACK" };
  if (command.evidenceReference && command.evidenceReference.length > 512) return { allowed: false, reason: "EVIDENCE_TOO_LONG" };
  return { allowed: true, record: {
    organization_id: trusted.organizationId, channel_id: trusted.channelId, actor_user_id: trusted.actorUserId,
    order_id: command.orderId, event_kind: command.kind, operation_key: command.operationKey,
    evidence_reference: command.evidenceReference?.trim() || null
  } };
}
