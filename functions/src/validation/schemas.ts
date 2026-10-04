import { z } from "zod";
import { Errors } from "../utils/errors";

/** Parses `data` against `schema`, throwing a safe invalid-argument error on failure. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path?.join(".") || "input";
    throw Errors.invalidArgument(`Invalid ${path}: ${firstIssue?.message ?? "unknown error"}`);
  }
  return result.data;
}

// --- Users -----------------------------------------------------------------
export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().url().optional(),
  preferences: z.record(z.unknown()).optional(),
});

// --- Check-ins ---------------------------------------------------------------
export const CreateCheckInSchema = z.object({
  mood: z.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export const GetCheckInTrendsSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

// --- Reflections -------------------------------------------------------------
export const CreateReflectionSchema = z.object({
  content: z.string().min(1).max(5000),
  mood: z.string().max(40).optional(),
});

export const DeleteReflectionSchema = z.object({
  reflectionId: z.string().min(1),
});

// --- Self-help plans -----------------------------------------------------------
export const CreatePlanSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        dueDate: z.string().datetime().optional(),
      })
    )
    .max(50)
    .optional(),
});

export const UpdateTaskSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
});

export const CompleteTaskSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  completed: z.boolean().default(true),
});

// --- Resources ---------------------------------------------------------------
export const GetResourcesSchema = z.object({
  category: z.string().max(60).optional(),
  tag: z.string().max(60).optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const CreateResourceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.string().min(1).max(60),
  content: z.string().max(20000).optional(),
  url: z.string().url().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  published: z.boolean().default(false),
});

export const UpdateResourceSchema = z.object({
  resourceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  category: z.string().min(1).max(60).optional(),
  content: z.string().max(20000).optional(),
  url: z.string().url().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const SetResourcePublishedSchema = z.object({
  resourceId: z.string().min(1),
  published: z.boolean(),
});

export const DeleteResourceSchema = z.object({
  resourceId: z.string().min(1),
});

// --- Chat ----------------------------------------------------------------------
export const CreateConversationSchema = z.object({
  title: z.string().max(120).optional(),
});

export const SendMessageSchema = z.object({
  sessionId: z.string().min(1),
  content: z.string().min(1).max(4000),
});

export const GetConversationSchema = z.object({
  sessionId: z.string().min(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// --- Consultations -----------------------------------------------------------
export const SubmitConsultationSchema = z.object({
  reason: z.string().min(1).max(2000),
  urgency: z.enum(["low", "medium", "high"]).default("medium"),
});

export const OpenRequestSchema = z.object({
  requestId: z.string().min(1),
});

export const ApproveRequestSchema = z.object({
  requestId: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  note: z.string().max(1000).optional(),
});

export const DeclineRequestSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().max(1000),
});

export const RequestMoreInfoSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().min(1).max(1000),
});

export const ProvideAdditionalInfoSchema = z.object({
  requestId: z.string().min(1),
  additionalInfo: z.string().min(1).max(2000),
});

export const RecordOutcomeSchema = z.object({
  consultationId: z.string().min(1),
  summary: z.string().min(1).max(4000),
  recommendations: z.string().max(2000).optional(),
  followUpRequired: z.boolean().default(false),
});

// --- Professionals -------------------------------------------------------------
export const SubmitReviewSchema = z.object({
  consultationId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const VerifyProfessionalSchema = z.object({
  professionalId: z.string().min(1),
  verified: z.boolean().default(true),
  specialties: z.array(z.string().max(60)).max(20).optional(),
});

// --- Admin ---------------------------------------------------------------------
export const SetUserRoleSchema = z.object({
  targetUid: z.string().min(1),
  role: z.enum(["student", "professional", "admin", "ngo"]),
});

export const CreateSponsorSchema = z.object({
  name: z.string().min(1).max(120),
  organization: z.string().max(120).optional(),
  contactEmail: z.string().email().optional(),
});

export const CreateAllocationSchema = z.object({
  sponsorId: z.string().min(1),
  studentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
});

export const UpdateAllocationStatusSchema = z.object({
  allocationId: z.string().min(1),
  status: z.enum(["active", "completed", "cancelled"]),
});
