import { expect } from "chai";
import { assertValidTransition } from "../../functions/src/consultations/stateMachine";

describe("Consultation state machine", () => {
  it("allows the full happy-path sequence", () => {
    expect(() => assertValidTransition("SUBMITTED", "PENDING_REVIEW", "professional")).to.not.throw();
    expect(() => assertValidTransition("PENDING_REVIEW", "APPROVED", "professional")).to.not.throw();
    expect(() => assertValidTransition("APPROVED", "SCHEDULED", "professional")).to.not.throw();
    expect(() => assertValidTransition("SCHEDULED", "COMPLETED", "professional")).to.not.throw();
    expect(() => assertValidTransition("COMPLETED", "FOLLOW_UP", "professional")).to.not.throw();
    expect(() => assertValidTransition("FOLLOW_UP", "CLOSED", "professional")).to.not.throw();
  });

  it("allows the MORE_INFORMATION detour", () => {
    expect(() => assertValidTransition("PENDING_REVIEW", "MORE_INFORMATION", "professional")).to.not.throw();
    expect(() => assertValidTransition("MORE_INFORMATION", "PENDING_REVIEW", "student")).to.not.throw();
  });

  it("allows a professional to decline from PENDING_REVIEW", () => {
    expect(() => assertValidTransition("PENDING_REVIEW", "DECLINED", "professional")).to.not.throw();
  });

  it("rejects a student trying to approve their own request", () => {
    expect(() => assertValidTransition("PENDING_REVIEW", "APPROVED", "student")).to.throw();
  });

  it("rejects a student trying to decline a request", () => {
    expect(() => assertValidTransition("PENDING_REVIEW", "DECLINED", "student")).to.throw();
  });

  it("rejects an NGO acting on any consultation transition", () => {
    expect(() => assertValidTransition("SUBMITTED", "PENDING_REVIEW", "ngo")).to.throw();
    expect(() => assertValidTransition("PENDING_REVIEW", "APPROVED", "ngo")).to.throw();
  });

  it("rejects skipping states (SUBMITTED directly to APPROVED)", () => {
    expect(() => assertValidTransition("SUBMITTED", "APPROVED", "professional")).to.throw();
  });

  it("rejects moving a terminal state (DECLINED, CLOSED) anywhere", () => {
    expect(() => assertValidTransition("DECLINED", "PENDING_REVIEW", "admin")).to.throw();
    expect(() => assertValidTransition("CLOSED", "FOLLOW_UP", "admin")).to.throw();
  });

  it("rejects reopening a COMPLETED consultation back to SCHEDULED", () => {
    expect(() => assertValidTransition("COMPLETED", "SCHEDULED", "professional")).to.throw();
  });

  it("always permits admin to perform any transition a professional can", () => {
    expect(() => assertValidTransition("PENDING_REVIEW", "APPROVED", "admin")).to.not.throw();
    expect(() => assertValidTransition("SCHEDULED", "COMPLETED", "admin")).to.not.throw();
  });
});
