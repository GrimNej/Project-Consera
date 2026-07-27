import { describe, expect, it } from "vitest";

import { createSession, verifyCsrf, verifySession } from "./session";

const signingBindings = {
  SESSION_SIGNING_SECRET: "session-secret-with-more-than-thirty-two-characters",
};

describe("public browser session", () => {
  it("creates a time-bounded signed session with a matching CSRF token", async () => {
    const created = await createSession(signingBindings, 1_700_000_000_000);
    const payload = await verifySession(signingBindings, created.token, 1_700_000_100_000);

    expect(payload?.sub).toBe("browser");
    expect(payload ? await verifyCsrf(payload, created.csrfToken) : false).toBe(true);
    expect(payload ? await verifyCsrf(payload, "different-token") : true).toBe(false);
  });

  it("rejects an expired or tampered session", async () => {
    const created = await createSession(signingBindings, 1_700_000_000_000);

    expect(await verifySession(signingBindings, created.token, 1_700_002_000_000)).toBeNull();
    expect(
      await verifySession(signingBindings, `${created.token.slice(0, -1)}x`, 1_700_000_100_000),
    ).toBeNull();
  });
});
