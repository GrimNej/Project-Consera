import {
  askRequestSchema,
  createProjectRequestSchema,
  manualIngestionRequestSchema,
  reviewProfileRequestSchema,
} from "@consera/contracts";
import { deleteCookie, setCookie } from "hono/cookie";
import { type Context, Hono } from "hono";
import { z } from "zod";

import { dispatchIngestion, GitHubDispatchError } from "./github/dispatch";
import { ApiError, parseBody, requestId, requireOrigin } from "./http";
import { constantTimeEqual, sha256 } from "./security/crypto";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  verifyCsrf,
  verifySession,
} from "./security/session";
import { SnowflakeClientError, snowflakeApi } from "./snowflake/client";
import { loadWorkspace, workspaceCacheKey } from "./workspace-cache";

type ConseraEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    requestId: string;
    session: SessionPayload;
    startedAt: number;
  };
};

const app = new Hono<ConseraEnv>();
const safeId = /^[A-Za-z0-9_-]{8,120}$/u;
const accessRequestSchema = z.object({ passcode: z.string().regex(/^\d{4}$/u) }).strict();
const publicApiPaths = new Set(["/api/v1/auth/unlock", "/api/v1/session"]);
const protectedPagePaths = new Set(["/", "/index.html", "/console", "/console/", "/console.html"]);

function success(data: unknown, id: string): Record<string, unknown> {
  return { data, ok: true, requestId: id };
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }
  return undefined;
}

function requireSafeId(value: string): void {
  if (!safeId.test(value)) {
    throw new ApiError("NOT_FOUND", "The requested resource was not found.", 404);
  }
}

async function sessionFromCookie(
  bindings: Pick<CloudflareBindings, "SESSION_SIGNING_SECRET">,
  cookieHeader: string | undefined,
): Promise<SessionPayload | null> {
  const token = cookieValue(cookieHeader, SESSION_COOKIE);
  return token ? verifySession(bindings, token) : null;
}

function setSessionCookie(context: Context<ConseraEnv>, token: string): void {
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "Strict",
    secure: true,
  });
}

function applySecurityHeaders(headers: Headers): void {
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
}

function isRuntimeCache(value: unknown): value is Cache {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "match") === "function" &&
    typeof Reflect.get(value, "put") === "function" &&
    typeof Reflect.get(value, "delete") === "function"
  );
}

function defaultRuntimeCache(): Cache | null {
  const cacheStorage: unknown = Reflect.get(globalThis, "caches");
  if (!cacheStorage || typeof cacheStorage !== "object" || !("default" in cacheStorage)) {
    return null;
  }
  const candidate: unknown = cacheStorage.default;
  return isRuntimeCache(candidate) ? candidate : null;
}

async function invalidateWorkspaceCache(requestUrl: string): Promise<void> {
  const cache = defaultRuntimeCache();
  if (cache) {
    await cache.delete(workspaceCacheKey(requestUrl)).catch(() => false);
  }
}

app.use("*", async (context, next) => {
  context.set("requestId", requestId(context.req.header("x-request-id")));
  context.set("startedAt", performance.now());
  await next();
  const headers = new Headers(context.res.headers);
  applySecurityHeaders(headers);
  context.res = new Response(context.res.body, {
    headers,
    status: context.res.status,
    statusText: context.res.statusText,
  });
  if (context.req.path.startsWith("/api/")) {
    console.info(
      JSON.stringify({
        durationMs: Number((performance.now() - context.get("startedAt")).toFixed(2)),
        event: "api_request",
        method: context.req.method,
        path: context.req.routePath || "unmatched_api_route",
        requestId: context.get("requestId"),
        status: context.res.status,
      }),
    );
  }
});

app.use("*", async (context, next) => {
  const url = new URL(context.req.url);
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return context.redirect(url.toString(), 308);
  }
  await next();
});

app.use("*", async (context, next) => {
  if (!protectedPagePaths.has(context.req.path)) {
    await next();
    return;
  }
  if (await sessionFromCookie(context.env, context.req.header("cookie"))) {
    await next();
    return;
  }
  const nextPath =
    context.req.path === "/" || context.req.path === "/index.html" ? "/" : "/console";
  return context.redirect(`/access?next=${encodeURIComponent(nextPath)}`, 302);
});

app.use("/api/v1/*", async (context, next) => {
  if (publicApiPaths.has(context.req.path)) {
    await next();
    return;
  }
  const session = await sessionFromCookie(context.env, context.req.header("cookie"));
  if (!session) {
    throw new ApiError("SESSION_REQUIRED", "Enter the private review passkey to continue.", 401);
  }
  context.set("session", session);
  if (!["GET", "HEAD"].includes(context.req.method)) {
    requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
    if (!(await verifyCsrf(session, context.req.header("x-consera-csrf") ?? ""))) {
      throw new ApiError("CSRF_REJECTED", "The request could not be verified.", 403);
    }
  }
  await next();
});

app.get("/api/v1/session", async (context) => {
  const currentSession = await sessionFromCookie(context.env, context.req.header("cookie"));
  if (!currentSession) {
    throw new ApiError("SESSION_REQUIRED", "Enter the private review passkey to continue.", 401);
  }
  const session = await createSession(context.env);
  setSessionCookie(context, session.token);
  return context.json(
    success(
      {
        authenticated: true,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      },
      context.get("requestId"),
    ),
  );
});

app.post("/api/v1/auth/unlock", async (context) => {
  requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
  const clientAddress = context.req.header("cf-connecting-ip") ?? "unknown";
  const clientKey = await sha256(clientAddress);
  const [clientLimit, globalLimit] = await Promise.all([
    context.env.AUTH_CLIENT_RATE_LIMITER.limit({ key: clientKey }),
    context.env.AUTH_GLOBAL_RATE_LIMITER.limit({ key: "consera-review-access" }),
  ]);
  if (!clientLimit.success || !globalLimit.success) {
    context.header("Retry-After", "60");
    throw new ApiError(
      "ACCESS_RATE_LIMITED",
      "Too many access attempts. Wait one minute, then try again.",
      429,
      true,
    );
  }

  const body = await parseBody(context, accessRequestSchema, 128);
  if (!constantTimeEqual(body.passcode, context.env.ACCESS_PASSCODE)) {
    throw new ApiError("ACCESS_DENIED", "That passkey was not accepted.", 401);
  }

  const session = await createSession(context.env);
  setSessionCookie(context, session.token);
  return context.json(
    success(
      {
        authenticated: true,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      },
      context.get("requestId"),
    ),
  );
});

app.post("/api/v1/auth/logout", (context) => {
  deleteCookie(context, SESSION_COOKIE, {
    path: "/",
    secure: true,
  });
  return context.json(success({ authenticated: false }, context.get("requestId")));
});

app.get("/api/v1/health", async (context) => {
  const snowflake = await snowflakeApi.health(context.env, context.get("requestId"));
  return context.json(
    success({ architecture: "static-next-hono-snowflake", snowflake }, context.get("requestId")),
  );
});

app.get("/api/v1/dashboard", async (context) =>
  context.json(
    success(
      await snowflakeApi.dashboard(context.env, context.get("requestId")),
      context.get("requestId"),
    ),
  ),
);

app.get("/api/v1/workspace", async (context) => {
  const cache = defaultRuntimeCache();
  const workspace = await loadWorkspace({
    cache,
    cacheKey: workspaceCacheKey(context.req.url),
    loadLive: () => snowflakeApi.workspace(context.env, context.get("requestId")),
    waitUntil: (promise) => context.executionCtx.waitUntil(promise),
  });
  return context.json(success(workspace, context.get("requestId")));
});

app.get("/api/v1/projects", async (context) =>
  context.json(
    success(
      await snowflakeApi.projects(context.env, context.get("requestId")),
      context.get("requestId"),
    ),
  ),
);

app.post("/api/v1/projects", async (context) => {
  const body = await parseBody(context, createProjectRequestSchema);
  const project = await snowflakeApi.createProject(context.env, body, context.get("requestId"));
  await invalidateWorkspaceCache(context.req.url);
  return context.json(success(project, context.get("requestId")), 202);
});

app.get("/api/v1/projects/:projectId/profile-draft", async (context) => {
  const projectId = context.req.param("projectId");
  requireSafeId(projectId);
  return context.json(
    success(
      await snowflakeApi.profileDraft(context.env, projectId, context.get("requestId")),
      context.get("requestId"),
    ),
  );
});

app.post("/api/v1/projects/:projectId/activate", async (context) => {
  const projectId = context.req.param("projectId");
  requireSafeId(projectId);
  const body = await parseBody(context, reviewProfileRequestSchema);
  const project = await snowflakeApi.activateProfile(
    context.env,
    { ...body, projectId },
    context.get("requestId"),
  );
  await invalidateWorkspaceCache(context.req.url);
  return context.json(success(project, context.get("requestId")));
});

app.get("/api/v1/signals", async (context) =>
  context.json(
    success(
      await snowflakeApi.signals(context.env, context.get("requestId")),
      context.get("requestId"),
    ),
  ),
);

app.get("/api/v1/verdicts", async (context) =>
  context.json(
    success(
      await snowflakeApi.verdicts(context.env, context.get("requestId")),
      context.get("requestId"),
    ),
  ),
);

app.get("/api/v1/alerts", async (context) =>
  context.json(
    success(
      await snowflakeApi.alerts(context.env, context.get("requestId")),
      context.get("requestId"),
    ),
  ),
);

app.post("/api/v1/ingestion/run", async (context) => {
  const body = await parseBody(context, manualIngestionRequestSchema);
  const run = await snowflakeApi.manualIngestion(
    context.env,
    body.idempotencyKey,
    context.get("requestId"),
  );
  if (run.dispatchRequired) {
    await dispatchIngestion(context.env.GITHUB_DISPATCH_TOKEN);
    await invalidateWorkspaceCache(context.req.url);
  }
  return context.json(
    success({ runId: run.runId, state: run.state }, context.get("requestId")),
    202,
  );
});

app.post("/api/v1/ask", async (context) => {
  const body = await parseBody(context, askRequestSchema);
  const answer = await snowflakeApi.ask(context.env, body, context.get("requestId"));
  return context.json(success(answer, context.get("requestId")));
});

app.onError((error, context) => {
  const id = context.get("requestId") || crypto.randomUUID();
  const apiError =
    error instanceof ApiError
      ? error
      : error instanceof SnowflakeClientError
        ? new ApiError(
            error.code,
            error.retryable
              ? "Snowflake is still processing or temporarily unavailable."
              : "Snowflake could not complete the request.",
            error.httpStatus,
            error.retryable,
          )
        : error instanceof GitHubDispatchError
          ? new ApiError(error.code, error.message, error.httpStatus, error.retryable)
          : new ApiError("INTERNAL_ERROR", "The request could not be completed.", 500);
  console.error(
    JSON.stringify({
      code: apiError.code,
      event: "api_error",
      method: context.req.method,
      path: context.req.routePath || "unmatched_api_route",
      requestId: id,
      retryable: apiError.retryable,
    }),
  );
  return context.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        requestId: id,
      },
    },
    apiError.status,
  );
});

app.notFound((context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested API route does not exist.",
          requestId: context.get("requestId"),
        },
      },
      404,
    );
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

export { app };
export default app;
