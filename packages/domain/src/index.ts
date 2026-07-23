import type { ImpactType, SuppressionReason } from "@consera/contracts";

export const formulaVersion = "impact-formula-v1";
export const alertPolicyVersion = "alert-policy-v1";

export type ComponentScores = Readonly<{
  actionability: number;
  adoptionFriction: number;
  capabilityOverlap: number;
  competitorAdvantage: number;
  dependencyImpact: number;
  evidenceQuality: number;
  marketMomentum: number;
  solutionAdjacency: number;
  strategicRelevance: number;
  substitutability: number;
  timeSensitivity: number;
  userPainSignal: number;
}>;

export type ConfidenceInputs = Readonly<{
  claimCoverage: number;
  evidenceQuality: number;
  highContradictions: number;
  lowContradictions: number;
  materialUnknowns: number;
  mediumContradictions: number;
  modelSchemaReliability: number;
  profileCompleteness: number;
  sourceDiversity: number;
}>;

export type ImpactScores = Readonly<{
  alertWorthiness: number;
  confidence: number;
  impactPeak: number;
  impactType: ImpactType;
  opportunity: number;
  relevance: number;
  replacementPressure: number;
  threat: number;
  urgency: number;
}>;

export type AlertPolicyInput = Readonly<{
  alertsEnabled: boolean;
  confidence: number;
  cooldownActive: boolean;
  dailyCapReached: boolean;
  dependencyImpact: number;
  duplicate: boolean;
  evidenceQuality: number;
  hasActionableRecommendation: boolean;
  hasCriticalAuditFinding: boolean;
  hasVerifiedEmail: boolean;
  healthAllowsAlerts: boolean;
  impactPeak: number;
  impactType: ImpactType;
  relevance: number;
  replacementPressure: number;
  staleProfile: boolean;
  staleSignal: boolean;
  alertWorthiness: number;
}>;

export type AlertPolicyDecision = Readonly<
  | { shouldAlert: true; reason: "QUALIFIED" | "HIGH_SEVERITY_OVERRIDE" }
  | { shouldAlert: false; reason: SuppressionReason }
>;

function clip(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertScore(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite value between 0 and 1`);
  }
}

function assertComponents(components: ComponentScores): void {
  for (const [name, value] of Object.entries(components)) {
    assertScore(name, value);
  }
}

export function calculateConfidence(inputs: ConfidenceInputs): number {
  for (const key of [
    "claimCoverage",
    "evidenceQuality",
    "modelSchemaReliability",
    "profileCompleteness",
    "sourceDiversity",
  ] as const) {
    assertScore(key, inputs[key]);
  }
  for (const key of [
    "highContradictions",
    "lowContradictions",
    "materialUnknowns",
    "mediumContradictions",
  ] as const) {
    if (!Number.isInteger(inputs[key]) || inputs[key] < 0) {
      throw new RangeError(`${key} must be a non-negative integer`);
    }
  }

  const baseConfidence =
    0.45 * inputs.evidenceQuality +
    0.2 * inputs.sourceDiversity +
    0.15 * inputs.profileCompleteness +
    0.1 * inputs.modelSchemaReliability +
    0.1 * inputs.claimCoverage;
  const contradictionPenalty = Math.min(
    0.4,
    0.08 * inputs.lowContradictions +
      0.15 * inputs.mediumContradictions +
      0.25 * inputs.highContradictions,
  );
  const unknownPenalty = Math.min(0.2, 0.03 * inputs.materialUnknowns);

  return clip(baseConfidence - contradictionPenalty - unknownPenalty);
}

export function determineImpactType(
  relevance: number,
  opportunity: number,
  threat: number,
  replacementPressure: number,
  components: ComponentScores,
): ImpactType {
  assertScore("relevance", relevance);
  assertScore("opportunity", opportunity);
  assertScore("threat", threat);
  assertScore("replacementPressure", replacementPressure);
  assertComponents(components);

  if (relevance < 0.45) return "IRRELEVANT";
  if (components.dependencyImpact >= 0.72 && threat >= 0.58) return "DEPENDENCY_RISK";
  if (replacementPressure >= 0.72) return "REPLACEMENT_PRESSURE";
  if (threat >= 0.68) return "COMPETITIVE_THREAT";
  if (opportunity >= 0.68 && components.dependencyImpact >= 0.45) {
    return "PROVIDER_OPPORTUNITY";
  }
  if (opportunity >= 0.65) return "OPPORTUNITY";
  if (components.userPainSignal >= 0.68 && components.marketMomentum >= 0.55) {
    return "MARKET_VALIDATION";
  }
  return "STRATEGIC_WATCH";
}

export function calculateImpactScores(
  components: ComponentScores,
  confidenceInputs: ConfidenceInputs,
): ImpactScores {
  assertComponents(components);

  const relevance = clip(
    0.3 * components.strategicRelevance +
      0.2 * components.capabilityOverlap +
      0.2 * components.dependencyImpact +
      0.1 * components.solutionAdjacency +
      0.1 * components.userPainSignal +
      0.1 * components.evidenceQuality,
  );
  const opportunity = clip(
    0.25 * components.strategicRelevance +
      0.25 * components.solutionAdjacency +
      0.2 * components.userPainSignal +
      0.15 * components.marketMomentum +
      0.1 * components.dependencyImpact +
      0.05 * components.evidenceQuality,
  );
  const threat = clip(
    0.25 * components.capabilityOverlap +
      0.2 * components.competitorAdvantage +
      0.2 * components.substitutability +
      0.15 * components.strategicRelevance +
      0.1 * components.marketMomentum +
      0.1 * components.evidenceQuality,
  );
  const replacementPressure = clip(
    0.3 * components.substitutability +
      0.25 * components.capabilityOverlap +
      0.15 * components.competitorAdvantage +
      0.15 * components.dependencyImpact +
      0.1 * components.marketMomentum +
      0.05 * components.evidenceQuality -
      0.2 * components.adoptionFriction,
  );
  const confidence = calculateConfidence(confidenceInputs);
  const impactPeak = Math.max(
    opportunity,
    threat,
    replacementPressure,
    components.dependencyImpact,
  );
  const urgency = clip(
    0.25 * Math.max(threat, opportunity, replacementPressure) +
      0.2 * components.dependencyImpact +
      0.15 * components.marketMomentum +
      0.15 * components.strategicRelevance +
      0.15 * components.timeSensitivity +
      0.1 * components.evidenceQuality,
  );
  const alertWorthiness = clip(
    0.3 * relevance +
      0.25 * impactPeak +
      0.15 * urgency +
      0.15 * confidence +
      0.1 * components.evidenceQuality +
      0.05 * components.actionability,
  );

  return {
    alertWorthiness,
    confidence,
    impactPeak,
    impactType: determineImpactType(
      relevance,
      opportunity,
      threat,
      replacementPressure,
      components,
    ),
    opportunity,
    relevance,
    replacementPressure,
    threat,
    urgency,
  };
}

export function evaluateAlertPolicy(input: AlertPolicyInput): AlertPolicyDecision {
  if (!input.alertsEnabled) return { shouldAlert: false, reason: "ALERTS_DISABLED" };
  if (!input.hasVerifiedEmail) return { shouldAlert: false, reason: "NO_VERIFIED_EMAIL" };
  if (!input.healthAllowsAlerts) return { shouldAlert: false, reason: "SYSTEM_DEGRADED" };
  if (input.hasCriticalAuditFinding) return { shouldAlert: false, reason: "AUDIT_BLOCK" };
  if (input.staleProfile) return { shouldAlert: false, reason: "STALE_PROFILE" };
  if (input.staleSignal) return { shouldAlert: false, reason: "STALE_SIGNAL" };
  if (input.duplicate) return { shouldAlert: false, reason: "DUPLICATE" };
  if (input.cooldownActive) return { shouldAlert: false, reason: "COOLDOWN" };
  if (input.dailyCapReached) return { shouldAlert: false, reason: "DAILY_CAP_REACHED" };
  if (input.impactType === "IRRELEVANT" || input.relevance < 0.62) {
    return { shouldAlert: false, reason: "LOW_RELEVANCE" };
  }
  if (input.evidenceQuality < 0.6) {
    return { shouldAlert: false, reason: "LOW_EVIDENCE_QUALITY" };
  }

  const highSeverity =
    (input.replacementPressure >= 0.82 || input.dependencyImpact >= 0.85) &&
    input.confidence >= 0.62 &&
    input.evidenceQuality >= 0.62;
  if (highSeverity) return { shouldAlert: true, reason: "HIGH_SEVERITY_OVERRIDE" };

  if (input.confidence < 0.68) return { shouldAlert: false, reason: "LOW_CONFIDENCE" };
  if (input.alertWorthiness < 0.68 || input.impactPeak < 0.62) {
    return { shouldAlert: false, reason: "LOW_IMPACT" };
  }
  if (!input.hasActionableRecommendation) {
    return { shouldAlert: false, reason: "NO_ACTIONABLE_STEP" };
  }
  return { shouldAlert: true, reason: "QUALIFIED" };
}

export function createAlertFingerprint(input: {
  affectedCapability: string;
  impactType: ImpactType;
  projectId: string;
  topic: string;
}): string {
  const normalized = [
    input.projectId.trim().toLowerCase(),
    input.topic.trim().toLowerCase().replaceAll(/\s+/g, " "),
    input.impactType,
    input.affectedCapability.trim().toLowerCase().replaceAll(/\s+/g, " "),
    alertPolicyVersion,
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
