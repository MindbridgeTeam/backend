import { expect } from "chai";
import { callAs, adminDb, testEnv } from "./setup";
import * as functions from "../../src/index";

describe("Check-ins (integration, requires emulator)", function () {
  this.timeout(20000);

  after(() => testEnv.cleanup());

  it("lets a student create and read back their own check-in", async () => {
    const created = await callAs(functions.createCheckIn, "student-int-a", "student", {
      mood: 4,
      notes: "feeling okay",
    });
    expect((created as { success: boolean }).success).to.equal(true);

    const mine = await callAs(functions.getMyCheckIns, "student-int-a", "student", {});
    const data = (mine as { data: Array<{ userId: string }> }).data;
    expect(data.some((c) => c.userId === "student-int-a")).to.equal(true);
  });

  it("never returns another student's check-ins from getMyCheckIns", async () => {
    await callAs(functions.createCheckIn, "student-int-owner", "student", { mood: 3 });

    const asOtherStudent = await callAs(functions.getMyCheckIns, "student-int-other", "student", {});
    const data = (asOtherStudent as { data: Array<{ userId: string }> }).data;
    expect(data.some((c) => c.userId === "student-int-owner")).to.equal(false);
  });

  it("rate-limits check-in creation after the configured threshold", async () => {
    const uid = "student-int-ratelimit";
    let lastError: unknown = null;

    for (let i = 0; i < 15; i++) {
      try {
        await callAs(functions.createCheckIn, uid, "student", { mood: 3 });
      } catch (err) {
        lastError = err;
        break;
      }
    }

    expect(lastError, "expected rate limiting to eventually reject a request").to.not.equal(null);
  });

  after(async () => {
    // Best-effort cleanup of documents created by this suite.
    const db = adminDb();
    const snap = await db
      .collection("checkIns")
      .where("userId", "in", [
        "student-int-a",
        "student-int-owner",
        "student-int-other",
        "student-int-ratelimit",
      ])
      .get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  });
});
