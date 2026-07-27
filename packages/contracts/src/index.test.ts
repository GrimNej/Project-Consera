import { describe, expect, it } from "vitest";

import {
  askRequestSchema,
  createProjectRequestSchema,
  projectProfileSchema,
  signalSchema,
  verdictSchema,
} from "./index";

describe("browser boundary contracts", () => {
  it("rejects an oversized project document before it reaches Snowflake", () => {
    const result = createProjectRequestSchema.safeParse({
      alertsEnabled: true,
      idempotencyKey: crypto.randomUUID(),
      name: "Northstar",
      readmeText: "a".repeat(200_001),
    });

    expect(result.success).toBe(false);
  });

  it("requires a bounded project scope for natural-language questions", () => {
    expect(
      askRequestSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        projectIds: [],
        question: "What changed?",
      }).success,
    ).toBe(false);
  });

  it("rejects incomplete profile and verdict objects", () => {
    expect(projectProfileSchema.safeParse({ projectId: crypto.randomUUID() }).success).toBe(false);
    expect(verdictSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(false);
  });

  it("accepts Snowflake ISO timestamps with explicit UTC offsets", () => {
    expect(
      signalSchema.safeParse({
        deepAnalysisCount: 0,
        discoveredAt: "2026-07-27T06:18:56.784+00:00",
        discussionUrl: "https://news.ycombinator.com/item?id=1",
        id: "signal-1",
        points: 1,
        sourceUrl: null,
        state: "INGESTED",
        title: "A bounded signal",
        topic: "technology",
      }).success,
    ).toBe(true);
  });
});
