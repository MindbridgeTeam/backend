import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireRole } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import {
  parse,
  GetResourcesSchema,
  CreateResourceSchema,
  UpdateResourceSchema,
  SetResourcePublishedSchema,
  DeleteResourceSchema,
} from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Query } from "firebase-admin/firestore";
import { recordAuditLog } from "../audit";

/**
 * Note: as noted in the API design doc, most `resources` reads can also
 * happen directly via the Firestore SDK (see firestore.rules: any signed-in
 * user may read published resources). These callables exist for clients
 * that prefer a single consistent API surface, and for admins who need to
 * see unpublished drafts through the same shape.
 */
export const getResources = onCall(async (request) => {
  return withErrorHandling("getResources", async () => {
    const ctx = requireAuth(request);
    const { category, tag, pageSize, cursor } = parse(GetResourcesSchema, request.data);

    let query: Query = db.collection(COLLECTIONS.resources);

    if (ctx.role !== "admin") {
      query = query.where("published", "==", true);
    }
    if (category) {
      query = query.where("category", "==", category);
    }
    if (tag) {
      query = query.where("tags", "array-contains", tag);
    }

    query = query.orderBy("createdAt", "desc").limit(pageSize);

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.resources).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null;

    return ok({ items, nextCursor });
  });
});

export const getResourceDetails = onCall(async (request) => {
  return withErrorHandling("getResourceDetails", async () => {
    const ctx = requireAuth(request);
    const resourceId = String(request.data?.resourceId ?? "");
    if (!resourceId) throw Errors.invalidArgument("resourceId is required.");

    const snap = await db.collection(COLLECTIONS.resources).doc(resourceId).get();
    if (!snap.exists) throw Errors.notFound("Resource not found.");

    const data = snap.data()!;
    if (data.published !== true && ctx.role !== "admin") {
      throw Errors.notFound("Resource not found.");
    }

    return ok({ id: snap.id, ...data });
  });
});

// ---------------------------------------------------------------------------
// Admin-only management. These are the only supported way to create/modify
// resources - firestore.rules also allows a direct admin SDK/console write,
// but going through these callables gets validation and an audit trail for
// free, so treat them as the canonical path even for admin tooling.
// ---------------------------------------------------------------------------

export const createResource = onCall(async (request) => {
  return withErrorHandling("createResource", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const input = parse(CreateResourceSchema, request.data);

    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(COLLECTIONS.resources).add({
      title: input.title,
      description: input.description,
      category: input.category,
      content: input.content ?? null,
      url: input.url ?? null,
      tags: input.tags,
      published: input.published,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "resource.create",
      resourceType: "resource",
      resourceId: ref.id,
      metadata: { published: input.published },
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

export const updateResource = onCall(async (request) => {
  return withErrorHandling("updateResource", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { resourceId, ...fields } = parse(UpdateResourceSchema, request.data);

    const ref = db.collection(COLLECTIONS.resources).doc(resourceId);
    const snap = await ref.get();
    if (!snap.exists) throw Errors.notFound("Resource not found.");

    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(updates).length === 0) {
      throw Errors.invalidArgument("No updatable fields were provided.");
    }

    await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "resource.update",
      resourceType: "resource",
      resourceId,
      metadata: { fields: Object.keys(updates) },
    });

    const updated = await ref.get();
    return ok({ id: resourceId, ...updated.data() });
  });
});

export const setResourcePublished = onCall(async (request) => {
  return withErrorHandling("setResourcePublished", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { resourceId, published } = parse(SetResourcePublishedSchema, request.data);

    const ref = db.collection(COLLECTIONS.resources).doc(resourceId);
    const snap = await ref.get();
    if (!snap.exists) throw Errors.notFound("Resource not found.");

    await ref.update({ published, updatedAt: FieldValue.serverTimestamp() });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: published ? "resource.publish" : "resource.unpublish",
      resourceType: "resource",
      resourceId,
    });

    return ok({ id: resourceId, published });
  });
});

export const deleteResource = onCall(async (request) => {
  return withErrorHandling("deleteResource", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { resourceId } = parse(DeleteResourceSchema, request.data);

    const ref = db.collection(COLLECTIONS.resources).doc(resourceId);
    const snap = await ref.get();
    if (!snap.exists) throw Errors.notFound("Resource not found.");

    await ref.delete();

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "resource.delete",
      resourceType: "resource",
      resourceId,
    });

    return ok({ id: resourceId, deleted: true });
  });
});
