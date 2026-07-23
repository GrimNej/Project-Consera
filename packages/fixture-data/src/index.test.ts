import { describe, expect, it } from "vitest";

import { alertSchema, askResponseSchema, dashboardSchema, signalSchema } from "@consera/contracts";

import { fixtureAlerts, fixtureAskResponse, fixtureDashboard, fixtureSignals } from "./index";

describe("fixture contracts", () => {
  it("keeps every product fixture valid against public schemas", () => {
    expect(dashboardSchema.safeParse(fixtureDashboard).success).toBe(true);
    expect(signalSchema.array().safeParse(fixtureSignals).success).toBe(true);
    expect(alertSchema.array().safeParse(fixtureAlerts).success).toBe(true);
    expect(askResponseSchema.safeParse(fixtureAskResponse).success).toBe(true);
  });
});
