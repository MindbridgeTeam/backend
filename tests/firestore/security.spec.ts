import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { expect } from "chai";
import { getTestEnv, teardownTestEnv, authedContext } from "./testEnv";
import { setDoc, doc, getDoc, getDocs, collection, updateDoc } from "firebase/firestore";

const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const PROFESSIONAL = "professional-a";
const UNRELATED_PROFESSIONAL = "professional-b";
const NGO = "ngo-a";
const ADMIN = "admin-a";

describe("Firestore security rules", function () {
  this.timeout(20000);

  before(async () => {
    const testEnv = await getTestEnv();

    // Seed data bypassing rules entirely (admin SDK equivalent in tests).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      await setDoc(doc(db, "checkIns/checkin-b1"), {
        userId: STUDENT_B,
        mood: 3,
        createdAt: new Date(),
      });

      await setDoc(doc(db, "reflections/reflection-b1"), {
        userId: STUDENT_B,
        content: "private thoughts",
        createdAt: new Date(),
      });

      await setDoc(doc(db, "selfHelpPlans/plan-b1"), {
        userId: STUDENT_B,
        title: "Plan B",
        status: "active",
        createdAt: new Date(),
      });

      await setDoc(doc(db, "chatSessions/session-b1"), {
        userId: STUDENT_B,
        title: "Private chat",
        createdAt: new Date(),
      });
      await setDoc(doc(db, "chatSessions/session-b1/chatMessages/msg-1"), {
        sessionId: "session-b1",
        senderType: "user",
        content: "hello",
        createdAt: new Date(),
      });

      await setDoc(doc(db, "consultationRequests/req-b1"), {
        studentId: STUDENT_B,
        professionalId: PROFESSIONAL,
        status: "PENDING_REVIEW",
        reason: "anxiety support",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await setDoc(doc(db, "consultations/consult-b1"), {
        requestId: "req-b1",
        studentId: STUDENT_B,
        professionalId: PROFESSIONAL,
        status: "SCHEDULED",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  });

  after(async () => {
    await teardownTestEnv();
  });

  // --------------------------------------------------------------------
  // Student A cannot access Student B's data
  // --------------------------------------------------------------------
  it("blocks Student A from reading Student B's check-ins", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(getDoc(doc(ctx.firestore(), "checkIns/checkin-b1")));
  });

  it("blocks Student A from reading Student B's reflections", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(getDoc(doc(ctx.firestore(), "reflections/reflection-b1")));
  });

  it("blocks Student A from reading Student B's self-help plans", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(getDoc(doc(ctx.firestore(), "selfHelpPlans/plan-b1")));
  });

  it("blocks Student A from reading Student B's chat session and messages", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(getDoc(doc(ctx.firestore(), "chatSessions/session-b1")));
    await assertFails(
      getDoc(doc(ctx.firestore(), "chatSessions/session-b1/chatMessages/msg-1"))
    );
  });

  it("blocks Student A from reading Student B's consultation information", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(getDoc(doc(ctx.firestore(), "consultationRequests/req-b1")));
    await assertFails(getDoc(doc(ctx.firestore(), "consultations/consult-b1")));
  });

  it("allows Student B to read their own data", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_B, "student");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "checkIns/checkin-b1")));
    await assertSucceeds(getDoc(doc(ctx.firestore(), "reflections/reflection-b1")));
    await assertSucceeds(getDoc(doc(ctx.firestore(), "consultationRequests/req-b1")));
  });

  // --------------------------------------------------------------------
  // NGO cannot access private conversations
  // --------------------------------------------------------------------
  it("blocks an NGO from reading any private chat session or messages", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, NGO, "ngo");
    await assertFails(getDoc(doc(ctx.firestore(), "chatSessions/session-b1")));
    await assertFails(
      getDoc(doc(ctx.firestore(), "chatSessions/session-b1/chatMessages/msg-1"))
    );
  });

  it("blocks an NGO from reading sponsorship allocations directly (aggregate-only access)", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, NGO, "ngo");
    await assertFails(getDocs(collection(ctx.firestore(), "sponsorshipAllocations")));
  });

  // --------------------------------------------------------------------
  // Professional cannot access unrelated student information
  // --------------------------------------------------------------------
  it("blocks a professional not assigned to the consultation from reading it", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, UNRELATED_PROFESSIONAL, "professional");
    await assertFails(getDoc(doc(ctx.firestore(), "consultationRequests/req-b1")));
    await assertFails(getDoc(doc(ctx.firestore(), "consultations/consult-b1")));
  });

  it("blocks any professional from reading a student's check-ins/reflections", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, PROFESSIONAL, "professional");
    await assertFails(getDoc(doc(ctx.firestore(), "checkIns/checkin-b1")));
    await assertFails(getDoc(doc(ctx.firestore(), "reflections/reflection-b1")));
  });

  it("allows the assigned professional to read the consultation they're assigned to", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, PROFESSIONAL, "professional");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "consultationRequests/req-b1")));
    await assertSucceeds(getDoc(doc(ctx.firestore(), "consultations/consult-b1")));
  });

  // --------------------------------------------------------------------
  // Users cannot arbitrarily change consultation status directly
  // --------------------------------------------------------------------
  it("denies any direct client write to a consultationRequest's status, even by its own student", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_B, "student");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "consultationRequests/req-b1"), {
        status: "APPROVED",
      })
    );
  });

  it("denies any direct client write to a consultationRequest's status by the assigned professional", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, PROFESSIONAL, "professional");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "consultationRequests/req-b1"), {
        status: "APPROVED",
      })
    );
  });

  it("denies any direct client write to a consultationRequest's status by an admin (must go through the audited callable)", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, ADMIN, "admin");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "consultationRequests/req-b1"), {
        status: "APPROVED",
      })
    );
  });

  // --------------------------------------------------------------------
  // Unauthorized users cannot approve or decline consultations
  // --------------------------------------------------------------------
  it("denies a student creating a consultationRequest for another student", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(
      setDoc(doc(ctx.firestore(), "consultationRequests/req-fake"), {
        studentId: STUDENT_B,
        status: "SUBMITTED",
        reason: "test",
        createdAt: new Date(),
      })
    );
  });

  it("denies a student creating a consultationRequest with a non-SUBMITTED status", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(
      setDoc(doc(ctx.firestore(), "consultationRequests/req-fake2"), {
        studentId: STUDENT_A,
        status: "APPROVED",
        reason: "test",
        createdAt: new Date(),
      })
    );
  });

  it("allows a student to create their own SUBMITTED consultation request", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "consultationRequests/req-a-valid"), {
        studentId: STUDENT_A,
        status: "SUBMITTED",
        reason: "test",
        createdAt: new Date(),
      })
    );
  });

  // --------------------------------------------------------------------
  // Users collection: role field is never client-writable
  // --------------------------------------------------------------------
  it("denies a student from writing their own role on the users collection", async () => {
    const testEnv = await getTestEnv();
    const ctx = authedContext(testEnv, STUDENT_A, "student");
    await assertFails(
      setDoc(doc(ctx.firestore(), "users/" + STUDENT_A), {
        uid: STUDENT_A,
        role: "admin",
      })
    );
  });

  it("sanity check: rules module compiled and loaded (no-op assertion)", () => {
    expect(true).to.equal(true);
  });
});
