import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "./index";
import { snowflakeApi } from "./snowflake/client";

const origin = "https://consera.example";
const bindings = {
  APP_ORIGIN: origin,
  ASSETS: {
    connect: () => {
      throw new Error("ASSET_SOCKET_NOT_AVAILABLE");
    },
    fetch: () => Promise.resolve(new Response("asset")),
  },
  GITHUB_DISPATCH_TOKEN: "github-token",
  SESSION_SIGNING_SECRET: "session-secret-with-more-than-thirty-two-characters",
  SNOWFLAKE_ACCOUNT_LOCATOR: "account-locator",
  SNOWFLAKE_HOST: "account.snowflakecomputing.com",
  SNOWFLAKE_PRIVATE_KEY: "private-key",
  SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: "fingerprint",
  SNOWFLAKE_USER: "CONSERA_API_USER",
} satisfies CloudflareBindings;

const successEnvelopeSchema = z.object({
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

async function startSession(): Promise<{
  cookie: string;
  csrfToken: string;
  response: Response;
}> {
  const response = await app.request(`${origin}/api/v1/session`, undefined, bindings);
  const parsed = successEnvelopeSchema.parse(await response.json());
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("SESSION_COOKIE_MISSING");
  return { cookie, csrfToken: parsed.data.csrfToken, response };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public application session", () => {
  it("starts automatically with a hardened browser cookie", async () => {
    const { response } = await startSession();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("__Host-consera_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
  });

  it("still requires a signed session for protected API reads", async () => {
    const response = await app.request(`${origin}/api/v1/dashboard`, undefined, bindings);
    const parsed = errorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(401);
    expect(parsed.error.code).toBe("SESSION_REQUIRED");
  });

  it("preserves exact-origin and CSRF checks on public mutations", async () => {
    const { cookie, csrfToken } = await startSession();

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

  it("does not expose the retired access-code endpoint", async () => {
    const { cookie, csrfToken } = await startSession();
    const response = await app.request(
      `${origin}/api/v1/auth/login`,
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
    const parsed = errorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(parsed.error.code).toBe("NOT_FOUND");
  });

  it("invalidates the current edge workspace after dispatching a manual run", async () => {
    const { cookie, csrfToken } = await startSession();
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
