import { describe, expect, it } from "vitest";

import {
  calculateImpactScores,
  createAlertFingerprint,
  determineImpactType,
  evaluateAlertPolicy,
  type ComponentScores,
} from "./index";

const components: ComponentScores = {
  actionability: 0.9,
  adoptionFriction: 0,
  capabilityOverlap: 0.8,
  competitorAdvantage: 0.7,
  dependencyImpact: 0.4,
  evidenceQuality: 0.9,
  marketMomentum: 0.8,
  solutionAdjacency: 0.7,
  strategicRelevance: 0.9,
  substitutability: 0.78,
  timeSensitivity: 0.6,
  userPainSignal: 0.74,
};

describe("impact scoring", () => {
  it("calculates bounded deterministic scores and an ordered impact type", () => {
    const result = calculateImpactScores(components, {
      claimCoverage: 1,
      evidenceQuality: 0.9,
      highContradictions: 0,
      lowContradictions: 0,
      materialUnknowns: 0,
      mediumContradictions: 0,
      modelSchemaReliability: 1,
      profileCompleteness: 0.9,
      sourceDiversity: 0.8,
    });

    expect(result.impactType).toBe("REPLACEMENT_PRESSURE");
    expect(result.relevance).toBeCloseTo(0.744);
    expect(result.confidence).toBeCloseTo(0.9);
    expect(Object.values(result).filter((value) => typeof value === "number")).toSatisfy(
      (values: number[]) => values.every((value) => value >= 0 && value <= 1),
    );
  });

  it("makes irrelevance the first deterministic branch", () => {
    expect(determineImpactType(0.2, 0.9, 0.9, 0.9, components)).toBe("IRRELEVANT");
  });

  it("rejects out-of-range model components", () => {
    expect(() =>
      calculateImpactScores(
        { ...components, evidenceQuality: 1.2 },
        {
          claimCoverage: 1,
          evidenceQuality: 1,
          highContradictions: 0,
          lowContradictions: 0,
          materialUnknowns: 0,
          mediumContradictions: 0,
          modelSchemaReliability: 1,
          profileCompleteness: 1,
          sourceDiversity: 1,
        },
      ),
    ).toThrow(RangeError);
  });
});

describe("alert policy", () => {
  const qualified = {
    alertsEnabled: true,
    alertWorthiness: 0.8,
    confidence: 0.8,
    cooldownActive: false,
    dailyCapReached: false,
    dependencyImpact: 0.6,
    duplicate: false,
    evidenceQuality: 0.8,
    hasActionableRecommendation: true,
    hasCriticalAuditFinding: false,
    hasVerifiedEmail: true,
    healthAllowsAlerts: true,
    impactPeak: 0.8,
    impactType: "OPPORTUNITY" as const,
    relevance: 0.8,
    replacementPressure: 0.5,
    staleProfile: false,
    staleSignal: false,
  };

  it("is silence-first when evidence is weak", () => {
    expect(evaluateAlertPolicy({ ...qualified, evidenceQuality: 0.4 })).toEqual({
      shouldAlert: false,
      reason: "LOW_EVIDENCE_QUALITY",
    });
  });

  it("allows only a bounded high-severity override", () => {
    expect(
      evaluateAlertPolicy({
        ...qualified,
        alertWorthiness: 0.5,
        confidence: 0.64,
        impactPeak: 0.6,
        replacementPressure: 0.84,
      }),
    ).toEqual({ shouldAlert: true, reason: "HIGH_SEVERITY_OVERRIDE" });
  });

  it("creates stable normalized dedupe fingerprints", () => {
    const first = createAlertFingerprint({
      affectedCapability: "  Agent Runtime ",
      impactType: "DEPENDENCY_RISK",
      projectId: "ABC",
      topic: "New   Runtime",
    });
    const second = createAlertFingerprint({
      affectedCapability: "agent runtime",
      impactType: "DEPENDENCY_RISK",
      projectId: "abc",
      topic: "new runtime",
    });

    expect(first).toBe(second);
  });
});
