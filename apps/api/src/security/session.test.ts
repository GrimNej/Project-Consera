import { describe, expect, it } from "vitest";

import { createSession, verifyAccessCode, verifyCsrf, verifySession } from "./session";
import { hmacSha256 } from "./crypto";

const signingBindings = {
  SESSION_SIGNING_SECRET: "session-secret-with-more-than-thirty-two-characters",
};

describe("operator session", () => {
  it("creates a time-bounded signed session with a matching CSRF token", async () => {
    const created = await createSession(signingBindings, 1_700_000_000_000);
    const payload = await verifySession(signingBindings, created.token, 1_700_000_100_000);

    expect(payload?.sub).toBe("operator");
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

  it("compares access codes through a keyed digest", async () => {
    const pepper = "login-pepper-with-more-than-thirty-two-characters";
    const bindings = {
      ACCESS_CODE_HMAC: await hmacSha256(pepper, "correct-code"),
      LOGIN_PEPPER: pepper,
    };

    expect(await verifyAccessCode(bindings, "correct-code")).toBe(true);
    expect(await verifyAccessCode(bindings, "wrong-code")).toBe(false);
  });
});
