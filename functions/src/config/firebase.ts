import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

// Firestore settings: ignore undefined properties so partial update objects
// built conditionally in TS don't throw at write time.
db.settings({ ignoreUndefinedProperties: true });

export const COLLECTIONS = {
  users: "users",
  profiles: "profiles",
  checkIns: "checkIns",
  reflections: "reflections",
  selfHelpPlans: "selfHelpPlans",
  selfHelpTasks: "selfHelpTasks", // subcollection name under selfHelpPlans
  resources: "resources",
  chatSessions: "chatSessions",
  chatMessages: "chatMessages", // subcollection name under chatSessions
  consultationRequests: "consultationRequests",
  consultations: "consultations",
  consultationOutcomes: "consultationOutcomes",
  professionals: "professionals",
  professionalReviews: "professionalReviews",
  notifications: "notifications",
  sponsors: "sponsors",
  sponsorshipAllocations: "sponsorshipAllocations",
  auditLogs: "auditLogs",
} as const;
