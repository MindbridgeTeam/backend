import { FieldValue } from "firebase-admin/firestore";
import { db, COLLECTIONS } from "../config/firebase";
import { Role } from "../types/models";
import { logger } from "../utils/logger";

interface RecordAuditParams {
  actorId: string;
  actorRole: Role;
  action: string; // e.g. "consultation.approve", "user.role_change"
  resourceType: string; // e.g. "consultationRequest"
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an AuditLog entry. This is only ever called from within Cloud
 * Functions (server-side, Admin SDK) - clients cannot write to auditLogs
 * directly (see firestore.rules). Never include full sensitive payloads in
 * `metadata` - only what's needed to explain the action (status transitions,
 * ids, booleans), never message content or personal notes.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<void> {
  try {
    await db.collection(COLLECTIONS.auditLogs).add({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ?? {},
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Audit logging failures should never crash the primary operation, but
    // they must be loud in the logs since they indicate a compliance gap.
    logger.error("Failed to write audit log", {
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
