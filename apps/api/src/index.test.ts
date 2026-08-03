import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "./index";
import { snowflakeApi } from "./snowflake/client";

const origin = "https://consera.example";
const testPasscode = "1357";
const allowRateLimit = { limit: vi.fn(() => Promise.resolve({ success: true })) };
const bindings = {
  ACCESS_PASSCODE: testPasscode,
  APP_ORIGIN: origin,
  ASSETS: {
    connect: () => {
      throw new Error("ASSET_SOCKET_NOT_AVAILABLE");
    },
    fetch: () => Promise.resolve(new Response("asset")),
  },
  AUTH_CLIENT_RATE_LIMITER: allowRateLimit,
  AUTH_GLOBAL_RATE_LIMITER: allowRateLimit,
  GITHUB_DISPATCH_TOKEN: "github-token",
  SESSION_SIGNING_SECRET: "session-secret-with-more-than-thirty-two-characters",
  SNOWFLAKE_ACCOUNT_LOCATOR: "account-locator",
  SNOWFLAKE_HOST: "account.snowflakecomputing.com",
  SNOWFLAKE_PRIVATE_KEY: "private-key",
  SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: "fingerprint",
  SNOWFLAKE_USER: "CONSERA_API_USER",
} satisfies CloudflareBindings;

const sessionEnvelopeSchema = z.object({
  data: z.object({
    authenticated: z.literal(true),
    csrfToken: z.string().min(20),
    expiresAt: z.string().datetime(),
  }),
  ok: z.literal(true),
  requestId: z.string().uuid(),
});

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().uuid(),
  }),
});

async function unlockSession(
  activeBindings: CloudflareBindings = bindings,
): Promise<{ cookie: string; csrfToken: string; response: Response }> {
  const response = await app.request(
    `${origin}/api/v1/auth/unlock`,
    {
      body: JSON.stringify({ passcode: testPasscode }),
      headers: {
        "cf-connecting-ip": "203.0.113.17",
        "content-type": "application/json",
        origin,
      },
      method: "POST",
    },
    activeBindings,
  );
  const parsed = sessionEnvelopeSchema.parse(await response.json());
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("SESSION_COOKIE_MISSING");
  return { cookie, csrfToken: parsed.data.csrfToken, response };
}

afterEach(() => {
  allowRateLimit.limit.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("private judging access", () => {
  it("redirects every protected page entry to the access screen", async () => {
    for (const path of ["/", "/index.html", "/console", "/console.html"]) {
      const response = await app.request(`${origin}${path}`, undefined, bindings);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toMatch(/^\/access\?next=/u);
      expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
    }
  });

  it("redirects plain HTTP before evaluating application access", async () => {
    const response = await app.request("http://consera.example/console", undefined, bindings);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://consera.example/console");
  });

  it("serves the access page without a session", async () => {
    const response = await app.request(`${origin}/access`, undefined, bindings);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset");
  });

  it("does not issue a session before the passkey succeeds", async () => {
    const sessionResponse = await app.request(`${origin}/api/v1/session`, undefined, bindings);
    const sessionError = errorEnvelopeSchema.parse(await sessionResponse.json());
    expect(sessionResponse.status).toBe(401);
    expect(sessionError.error.code).toBe("SESSION_REQUIRED");

    const unlockResponse = await app.request(
      `${origin}/api/v1/auth/unlock`,
      {
        body: JSON.stringify({ passcode: "0000" }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      },
      bindings,
    );
    const unlockError = errorEnvelopeSchema.parse(await unlockResponse.json());
    expect(unlockResponse.status).toBe(401);
    expect(unlockError.error.code).toBe("ACCESS_DENIED");
    expect(unlockResponse.headers.get("set-cookie")).toBeNull();
  });

  it("rejects malformed, cross-origin, and oversized unlock requests", async () => {
    const wrongOrigin = await app.request(
      `${origin}/api/v1/auth/unlock`,
      {
        body: JSON.stringify({ passcode: testPasscode }),
        headers: { "content-type": "application/json", origin: "https://untrusted.example" },
        method: "POST",
      },
      bindings,
    );
    expect(wrongOrigin.status).toBe(403);

    const malformed = await app.request(
      `${origin}/api/v1/auth/unlock`,
      {
        body: JSON.stringify({ extra: "not accepted", passcode: "1 OR 1=1" }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      },
      bindings,
    );
    expect(malformed.status).toBe(422);

    const oversized = await app.request(
      `${origin}/api/v1/auth/unlock`,
      {
        body: JSON.stringify({ passcode: testPasscode, padding: "x".repeat(200) }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      },
      bindings,
    );
    expect(oversized.status).toBe(413);
  });

  it("rate limits unlock attempts without calling Snowflake", async () => {
    const health = vi.spyOn(snowflakeApi, "health");
    const limitedBindings = {
      ...bindings,
      AUTH_CLIENT_RATE_LIMITER: { limit: () => Promise.resolve({ success: false }) },
    } satisfies CloudflareBindings;
    const response = await app.request(
      `${origin}/api/v1/auth/unlock`,
      {
        body: JSON.stringify({ passcode: testPasscode }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      },
      limitedBindings,
    );
    const parsed = errorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(parsed.error.code).toBe("ACCESS_RATE_LIMITED");
    expect(health).not.toHaveBeenCalled();
  });

  it("issues a hardened signed cookie only after successful unlock", async () => {
    const { cookie, response } = await unlockSession();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("__Host-consera_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");

    const consoleResponse = await app.request(
      `${origin}/console`,
      { headers: { cookie } },
      bindings,
    );
    expect(consoleResponse.status).toBe(200);
  });

  it("refreshes CSRF state only for an existing valid session", async () => {
    const { cookie } = await unlockSession();
    const response = await app.request(
      `${origin}/api/v1/session`,
      { headers: { cookie } },
      bindings,
    );
    const parsed = sessionEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(parsed.data.csrfToken).toHaveLength(32);
    expect(response.headers.get("set-cookie")).toContain("__Host-consera_session=");
  });

  it("preserves exact-origin and CSRF checks on protected mutations", async () => {
    const { cookie, csrfToken } = await unlockSession();

    const missingCsrf = await app.request(
      `${origin}/api/v1/projects`,
      {
        body: "{}",
        headers: { cookie, "content-type": "application/json", origin },
        method: "POST",
      },
      bindings,
    );
    const csrfError = errorEnvelopeSchema.parse(await missingCsrf.json());
    expect(missingCsrf.status).toBe(403);
    expect(csrfError.error.code).toBe("CSRF_REJECTED");

    const wrongOrigin = await app.request(
      `${origin}/api/v1/projects`,
      {
        body: "{}",
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "https://untrusted.example",
          "x-consera-csrf": csrfToken,
        },
        method: "POST",
      },
      bindings,
    );
    const originError = errorEnvelopeSchema.parse(await wrongOrigin.json());
    expect(wrongOrigin.status).toBe(403);
    expect(originError.error.code).toBe("ORIGIN_REJECTED");
  });

  it("clears the private session through a verified logout", async () => {
    const { cookie, csrfToken } = await unlockSession();
    const response = await app.request(
      `${origin}/api/v1/auth/logout`,
      {
        body: "{}",
        headers: {
          cookie,
          "content-type": "application/json",
          origin,
          "x-consera-csrf": csrfToken,
        },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("invalidates the current edge workspace after dispatching a manual run", async () => {
    const { cookie, csrfToken } = await unlockSession();
    const deleteCached = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("caches", {
      default: {
        delete: deleteCached,
        match: vi.fn(),
        put: vi.fn(),
      },
    });
    vi.spyOn(snowflakeApi, "manualIngestion").mockResolvedValue({
      dispatchRequired: true,
      runId: crypto.randomUUID(),
      state: "QUEUED",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );

    const response = await app.request(
      `${origin}/api/v1/ingestion/run`,
      {
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        headers: {
          cookie,
          "content-type": "application/json",
          origin,
          "x-consera-csrf": csrfToken,
        },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(202);
    expect(deleteCached).toHaveBeenCalledOnce();
  });
});
