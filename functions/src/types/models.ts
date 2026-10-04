import { Timestamp } from "firebase-admin/firestore";

export type Role = "student" | "professional" | "admin" | "ngo";

export interface UserDoc {
  uid: string;
  email: string | null;
  role: Role;
  disabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProfileDoc {
  uid: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CheckInDoc {
  id: string;
  userId: string;
  mood: number; // e.g. 1-5 scale
  notes: string | null;
  tags: string[];
  createdAt: Timestamp;
}

export interface ReflectionDoc {
  id: string;
  userId: string;
  content: string;
  mood: string | null;
  createdAt: Timestamp;
}

export type PlanStatus = "active" | "completed" | "archived";

export interface SelfHelpPlanDoc {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SelfHelpTaskDoc {
  id: string;
  planId: string;
  title: string;
  notes: string | null;
  completed: boolean;
  dueDate: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ResourceDoc {
  id: string;
  title: string;
  description: string;
  category: string;
  content: string | null;
  url: string | null;
  tags: string[];
  published: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatSessionDoc {
  id: string;
  userId: string;
  title: string;
  lastMessageAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChatSenderType = "user" | "assistant" | "system";

export interface ChatMessageDoc {
  id: string;
  sessionId: string;
  senderType: ChatSenderType;
  content: string;
  createdAt: Timestamp;
}

export type ConsultationStatus =
  | "SUBMITTED"
  | "PENDING_REVIEW"
  | "MORE_INFORMATION"
  | "APPROVED"
  | "SCHEDULED"
  | "COMPLETED"
  | "FOLLOW_UP"
  | "CLOSED"
  | "DECLINED";

export interface ConsultationRequestDoc {
  id: string;
  studentId: string;
  professionalId: string | null;
  status: ConsultationStatus;
  reason: string;
  urgency: "low" | "medium" | "high";
  statusHistory: Array<{
    from: ConsultationStatus | null;
    to: ConsultationStatus;
    actorId: string;
    actorRole: Role;
    note: string | null;
    at: Timestamp;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConsultationDoc {
  id: string;
  requestId: string;
  studentId: string;
  professionalId: string;
  status: ConsultationStatus;
  scheduledAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConsultationOutcomeDoc {
  id: string;
  consultationId: string;
  studentId: string;
  professionalId: string;
  summary: string;
  recommendations: string | null;
  followUpRequired: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

export interface ProfessionalDoc {
  uid: string;
  displayName: string;
  bio: string | null;
  specialties: string[];
  verified: boolean;
  availability: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProfessionalReviewDoc {
  id: string;
  professionalId: string;
  studentId: string;
  consultationId: string;
  rating: number; // 1-5
  comment: string | null;
  createdAt: Timestamp;
}

export type NotificationType =
  | "consultation_status_change"
  | "professional_assigned"
  | "appointment_update"
  | "follow_up_reminder"
  | "system";

export interface NotificationDoc {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface SponsorDoc {
  id: string;
  name: string;
  organization: string | null;
  contactEmail: string | null;
  createdAt: Timestamp;
}

export interface SponsorshipAllocationDoc {
  id: string;
  sponsorId: string;
  studentId: string;
  amount: number;
  currency: string;
  status: "active" | "completed" | "cancelled";
  allocatedAt: Timestamp;
}

export interface AuditLogDoc {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: Timestamp;
  metadata: Record<string, unknown>;
}
