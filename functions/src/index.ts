import { setGlobalOptions } from "firebase-functions/v2";

// Sensible defaults for every function in this codebase unless overridden
// per-function. Keeping region/memory centralized avoids drift between
// modules and makes cost/latency predictable.
setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 20,
});

// --- Auth --------------------------------------------------------------
export { onUserCreate, onUserSignIn, onUserDocDeleted } from "./auth/triggers";
export { setUserRole } from "./auth/callable";

// --- Users ---------------------------------------------------------------
export { getProfile, updateProfile } from "./users";
export { onAvatarUploaded, onAvatarDeleted } from "./users/storageTriggers";

// --- Check-ins -----------------------------------------------------------
export { createCheckIn, getMyCheckIns, getCheckInTrends } from "./checkins";

// --- Reflections ---------------------------------------------------------
export { createReflection, getMyReflections, deleteReflection } from "./reflections";

// --- Self-help plans -------------------------------------------------------
export { createPlan, getMyPlans, updateTask, completeTask } from "./plans";

// --- Resources -------------------------------------------------------------
export {
  getResources,
  getResourceDetails,
  createResource,
  updateResource,
  setResourcePublished,
  deleteResource,
} from "./resources";

// --- Chat --------------------------------------------------------------------
export { createConversation, sendMessage, getConversation } from "./chat";

// --- Consultations -----------------------------------------------------------
export {
  submitConsultationRequest,
  getRequestStatus,
  getProfessionalRequestQueue,
  openRequest,
  approveRequest,
  declineRequest,
  requestMoreInformation,
  provideAdditionalInformation,
  recordOutcome,
} from "./consultations";

// --- Professionals -------------------------------------------------------------
export {
  listProfessionals,
  submitProfessionalReview,
  getMyReviews,
  verifyProfessional,
} from "./professionals";

// --- Notifications -------------------------------------------------------------
export {
  registerDeviceToken,
  listNotifications,
  markNotificationRead,
  followUpReminderJob,
} from "./notifications";

// --- Sponsors --------------------------------------------------------------------
export {
  createSponsor,
  createSponsorshipAllocation,
  updateAllocationStatus,
  getSponsorshipReport,
} from "./sponsors";
