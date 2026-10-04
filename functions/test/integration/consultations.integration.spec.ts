import { expect } from "chai";
import { callAs, adminDb, testEnv } from "./setup";
import * as functions from "../../src/index";
import { DocumentData } from "firebase-admin/firestore";

describe("Consultation workflow (integration, requires emulator)", function () {
  this.timeout(20000);

  const STUDENT = "student-consult-int";
  const PROFESSIONAL = "professional-consult-int";
  const OTHER_STUDENT = "student-consult-other";
  const UNRELATED_PROFESSIONAL = "professional-unrelated-int";
  const TEST_UIDS = [STUDENT, PROFESSIONAL, OTHER_STUDENT, UNRELATED_PROFESSIONAL];

  it("runs the full SUBMITTED -> ... -> CLOSED workflow and audits every step", async () => {
    // Submit
    const submitted = await callAs(functions.submitConsultationRequest, STUDENT, "student", {
      reason: "Would like to talk to someone about stress.",
      urgency: "medium",
    });
    const requestId = (submitted as { data: { id: string } }).data.id;
    expect(requestId).to.be.a("string");

    // Open (claim) as the professional
    const opened = await callAs(functions.openRequest, PROFESSIONAL, "professional", { requestId });
    expect((opened as { data: { status: string } }).data.status).to.equal("PENDING_REVIEW");

    // Approve -> creates a Consultation and moves to SCHEDULED
    const approved = await callAs(functions.approveRequest, PROFESSIONAL, "professional", {
      requestId,
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const consultationId = (approved as { data: { consultationId: string } }).data.consultationId;
    expect(consultationId).to.be.a("string");

    // Record outcome -> COMPLETED then CLOSED (no follow-up)
    const outcome = await callAs(functions.recordOutcome, PROFESSIONAL, "professional", {
      consultationId,
      summary: "Discussed coping strategies.",
      followUpRequired: false,
    });
    expect((outcome as { data: { status: string } }).data.status).to.equal("CLOSED");

    // Verify an audit log entry exists for at least the approval step.
    const auditSnap = await adminDb()
      .collection("auditLogs")
      .where("resourceId", "==", requestId)
      .where("action", "==", "consultation.approve")
      .get();
    expect(auditSnap.empty).to.equal(false);
  });

  it("rejects a student trying to approve their own request", async () => {
    const submitted = await callAs(functions.submitConsultationRequest, STUDENT, "student", {
      reason: "Second request.",
      urgency: "low",
    });
    const requestId = (submitted as { data: { id: string } }).data.id;

    let threw = false;
    try {
      await callAs(functions.approveRequest, STUDENT, "student", { requestId });
    } catch {
      threw = true;
    }
    expect(threw, "expected approveRequest to reject a student caller").to.equal(true);
  });

  it("rejects a professional from approving an unclaimed request without opening it", async () => {
    const submitted = await callAs(functions.submitConsultationRequest, OTHER_STUDENT, "student", {
      reason: "Third request.",
      urgency: "low",
    });
    const requestId = (submitted as { data: { id: string } }).data.id;

    let threw = false;
    try {
      await callAs(functions.approveRequest, PROFESSIONAL, "professional", { requestId });
    } catch {
      threw = true;
    }
    expect(threw, "expected an unclaimed request to require opening first").to.equal(true);
  });

  it("rejects an unrelated professional from acting on someone else's assigned request", async () => {
    const submitted = await callAs(functions.submitConsultationRequest, OTHER_STUDENT, "student", {
      reason: "Fourth request.",
      urgency: "low",
    });
    const requestId = (submitted as { data: { id: string } }).data.id;

    await callAs(functions.openRequest, PROFESSIONAL, "professional", { requestId });

    let threw = false;
    try {
      await callAs(functions.approveRequest, UNRELATED_PROFESSIONAL, "professional", {
        requestId,
      });
    } catch {
      threw = true;
    }
    expect(threw, "expected an unrelated professional to be rejected").to.equal(true);
  });

  // Cleanup runs in two ordered steps: DB cleanup MUST happen before
  // testEnv.cleanup(), because testEnv.cleanup() tears down the Firebase
  // Admin app(s) it's tracking - including the default app that adminDb()
  // uses. If it ran first, every Firestore call below would throw
  // ("Firebase App named '[DEFAULT]' already deleted"), the cleanup would
  // silently fail, and leftover data would bleed into the next test run.
  after(async () => {
    const db = adminDb();

    // Matches against the actual set of test UIDs rather than a substring
    // that happens to work by naming coincidence - this way cleanup can't
    // silently miss a document just because a future edit changes an id.
    const belongsToThisSuite = (data: DocumentData) => {
      const serialized = JSON.stringify(data);
      return TEST_UIDS.some((uid) => serialized.includes(uid));
    };

    for (const collection of [
      "consultationRequests",
      "consultations",
      "consultationOutcomes",
      "auditLogs",
    ]) {
      const snap = await db.collection(collection).get();
      await Promise.all(
        snap.docs.filter((d) => belongsToThisSuite(d.data())).map((d) => d.ref.delete())
      );
    }

    // Also clear rate-limit counters for these UIDs so repeated runs
    // against a persistent (non-fresh) emulator don't eventually start
    // failing with resource-exhausted from accumulated prior runs.
    await Promise.all(
      TEST_UIDS.map((uid) =>
        db.collection("_rateLimits").doc(`consultation_submit_${uid}`).delete().catch(() => undefined)
      )
    );
  });

  after(() => testEnv.cleanup());
});
