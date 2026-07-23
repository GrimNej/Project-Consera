import { describe, expect, it } from "vitest";

import { formatImpactType, formatPercent, formatSuppressionReason } from "./format";

describe("product copy formatting", () => {
  it("formats bounded scores as human-readable percentages", () => {
    expect(formatPercent(0.864)).toBe("86%");
  });

  it("turns machine states into readable labels", () => {
    expect(formatImpactType("REPLACEMENT_PRESSURE")).toBe("Replacement Pressure");
    expect(formatSuppressionReason("LOW_EVIDENCE_QUALITY")).toBe("Low Evidence Quality");
  });
});
