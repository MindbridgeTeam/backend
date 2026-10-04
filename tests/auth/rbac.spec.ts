import { expect } from "chai";
import { requireRole, requireOwnerOrRole } from "../../functions/src/middleware/auth";
import { AuthedContext } from "../../functions/src/middleware/auth";

function ctx(uid: string, role: AuthedContext["role"]): AuthedContext {
  return { uid, role, email: null };
}

describe("RBAC middleware", () => {
  describe("requireRole", () => {
    it("allows a matching role", () => {
      expect(() => requireRole(ctx("u1", "admin"), ["admin"])).to.not.throw();
    });

    it("rejects a non-matching role", () => {
      expect(() => requireRole(ctx("u1", "student"), ["admin", "professional"])).to.throw();
    });

    it("rejects an NGO from student-only actions", () => {
      expect(() => requireRole(ctx("u1", "ngo"), ["student"])).to.throw();
    });
  });

  describe("requireOwnerOrRole", () => {
    it("allows the resource owner", () => {
      expect(() => requireOwnerOrRole(ctx("student-a", "student"), "student-a")).to.not.throw();
    });

    it("rejects a different student (cross-student access)", () => {
      expect(() => requireOwnerOrRole(ctx("student-a", "student"), "student-b")).to.throw();
    });

    it("allows an admin override by default", () => {
      expect(() => requireOwnerOrRole(ctx("admin-a", "admin"), "student-b")).to.not.throw();
    });

    it("rejects a professional without an explicit override role", () => {
      expect(() =>
        requireOwnerOrRole(ctx("professional-a", "professional"), "student-b")
      ).to.throw();
    });

    it("allows a role explicitly included in the override list", () => {
      expect(() =>
        requireOwnerOrRole(ctx("professional-a", "professional"), "student-b", [
          "admin",
          "professional",
        ])
      ).to.not.throw();
    });
  });
});
