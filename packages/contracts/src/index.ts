import { z } from "zod";

const isoDatetimeSchema = z.string().datetime({ offset: true });

export const impactTypeSchema = z.enum([
  "OPPORTUNITY",
  "COMPETITIVE_THREAT",
  "REPLACEMENT_PRESSURE",
  "PROVIDER_OPPORTUNITY",
  "DEPENDENCY_RISK",
  "MARKET_VALIDATION",
  "STRATEGIC_WATCH",
  "IRRELEVANT",
]);

export const healthStateSchema = z.enum([
  "HEALTHY",
  "DEGRADED_INGESTION",
  "DEGRADED_AI_BUDGET",
  "DEGRADED_AI_PROVIDER",
  "DEGRADED_EMAIL",
  "DEGRADED_SEARCH",
  "SOURCE_ONLY",
  "REPLAY_MODE",
  "BLOCKED_SECURITY",
  "BLOCKED_COST",
]);

export const scoreSchema = z.number().min(0).max(1);

export const evidenceSchema = z.object({
  excerpt: z.string().min(1).max(1_200),
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(140),
  publishedAt: isoDatetimeSchema.nullable(),
  sourceKind: z.enum(["PROJECT", "HN_STORY", "HN_COMMENT", "ARTICLE", "OFFICIAL"]),
  sourceUrl: z.url().nullable(),
});

export const projectProfileSchema = z.object({
  capabilities: z.array(z.string().min(1).max(160)).max(20),
  completeness: scoreSchema,
  constraints: z.array(z.string().min(1).max(240)).max(20),
  dependencies: z.array(z.string().min(1).max(160)).max(30),
  differentiators: z.array(z.string().min(1).max(240)).max(20),
  monitoredTopics: z.array(z.string().min(1).max(120)).max(30),
  projectId: z.string().uuid(),
  providers: z.array(z.string().min(1).max(160)).max(20),
  summary: z.string().min(1).max(1_200),
  targetUsers: z.array(z.string().min(1).max(160)).max(20),
  version: z.number().int().positive(),
});

export const projectSchema = z.object({
  activeProfile: projectProfileSchema.nullable(),
  alertsEnabled: z.boolean(),
  createdAt: isoDatetimeSchema,
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  profileState: z.enum(["EMPTY", "EXTRACTING", "REVIEW", "ACTIVE", "FAILED"]),
  updatedAt: isoDatetimeSchema,
  version: z.number().int().positive(),
});

export const projectProfileDraftSchema = z.object({
  evidence: evidenceSchema,
  profile: projectProfileSchema,
  projectVersion: z.number().int().positive(),
});

export const signalSchema = z.object({
  deepAnalysisCount: z.number().int().nonnegative(),
  discoveredAt: isoDatetimeSchema,
  discussionUrl: z.url(),
  id: z.string().min(1).max(120),
  points: z.number().int().nonnegative(),
  sourceUrl: z.url().nullable(),
  state: z.enum(["INGESTED", "SUPPRESSED", "CANDIDATE", "ANALYZED", "QUARANTINED"]),
  title: z.string().min(1).max(300),
  topic: z.string().min(1).max(120),
});

export const scoreContributionSchema = z.object({
  component: z.string().min(1).max(80),
  explanation: z.string().min(1).max(600),
  rawValue: scoreSchema,
  weight: z.number().min(-1).max(1),
  weightedValue: z.number().min(-1).max(1),
});

export const verdictSchema = z.object({
  alertWorthiness: scoreSchema,
  confidence: scoreSchema,
  contributions: z.array(scoreContributionSchema).min(1).max(20),
  createdAt: isoDatetimeSchema,
  evidence: z.array(evidenceSchema).min(1).max(20),
  headline: z.string().min(1).max(220),
  id: z.string().uuid(),
  impactPeak: scoreSchema,
  impactType: impactTypeSchema,
  opportunity: scoreSchema,
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(100),
  protectiveFactors: z.array(z.string().min(1).max(600)).max(5),
  publishedAt: isoDatetimeSchema,
  recommendations: z.array(z.string().min(1).max(600)).min(1).max(5),
  relevance: scoreSchema,
  replacementPressure: scoreSchema,
  signalId: z.string().min(1).max(120),
  summary: z.string().min(1).max(2_000),
  threat: scoreSchema,
  uncertainty: z.string().min(1).max(1_200),
  urgency: scoreSchema,
});

export const suppressionReasonSchema = z.enum([
  "LOW_RELEVANCE",
  "LOW_IMPACT",
  "LOW_CONFIDENCE",
  "LOW_EVIDENCE_QUALITY",
  "NO_ACTIONABLE_STEP",
  "DUPLICATE",
  "COOLDOWN",
  "STALE_PROFILE",
  "STALE_SIGNAL",
  "ALERTS_DISABLED",
  "NO_VERIFIED_EMAIL",
  "DAILY_CAP_REACHED",
  "SYSTEM_DEGRADED",
  "AUDIT_BLOCK",
]);

export const alertSchema = z.object({
  createdAt: isoDatetimeSchema,
  deliveryState: z.enum([
    "QUEUED",
    "SENDING",
    "SENT",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
    "DELIVERY_UNKNOWN",
    "SUPPRESSED",
  ]),
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(100),
  suppressionReason: suppressionReasonSchema.nullable(),
  verdictHeadline: z.string().min(1).max(220),
  verdictId: z.string().uuid(),
  verdictType: impactTypeSchema,
});

export const activitySchema = z.object({
  detail: z.string().min(1).max(300),
  id: z.string().min(1).max(120),
  occurredAt: isoDatetimeSchema,
  state: z.enum(["SUCCESS", "RUNNING", "SUPPRESSED", "WARNING", "FAILED"]),
  title: z.string().min(1).max(160),
});

export const dashboardSchema = z.object({
  activities: z.array(activitySchema).max(20),
  alertsSent: z.number().int().nonnegative(),
  analyzedDeeply: z.number().int().nonnegative(),
  credits: z.object({
    consumed: z.number().nonnegative(),
    reserve: z.number().nonnegative(),
    totalEnvelope: z.number().positive(),
  }),
  health: healthStateSchema,
  latestIngestionAt: isoDatetimeSchema.nullable(),
  projects: z.array(projectSchema),
  signalsReviewed: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  topVerdicts: z.array(verdictSchema).max(5),
});

export const askRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  projectIds: z.array(z.string().uuid()).min(1).max(10),
  question: z.string().trim().min(4).max(1_000),
});

export const askResponseSchema = z.object({
  answer: z.string().min(1).max(8_000),
  citations: z.array(evidenceSchema).max(8),
  confidence: scoreSchema,
  limitations: z.array(z.string().min(1).max(400)).max(8),
  projects: z.array(z.object({ id: z.string().uuid(), name: z.string() })).min(1),
  quotaRemaining: z.number().int().nonnegative(),
  suggestedAction: z.string().min(1).max(600).nullable(),
  timeRange: z.object({
    from: isoDatetimeSchema,
    to: isoDatetimeSchema,
  }),
});

export const createProjectRequestSchema = z.object({
  alertsEnabled: z.boolean(),
  idempotencyKey: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  readmeText: z.string().min(20).max(200_000),
});

export const reviewProfileRequestSchema = z.object({
  expectedProjectVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  profile: projectProfileSchema,
});

export const manualIngestionRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(400),
    requestId: z.string().min(1).max(120),
  }),
});

export type Alert = z.infer<typeof alertSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type HealthState = z.infer<typeof healthStateSchema>;
export type ImpactType = z.infer<typeof impactTypeSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectProfile = z.infer<typeof projectProfileSchema>;
export type ProjectProfileDraft = z.infer<typeof projectProfileDraftSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type SuppressionReason = z.infer<typeof suppressionReasonSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
