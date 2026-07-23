import {
  askRequestSchema,
  createProjectRequestSchema,
  manualIngestionRequestSchema,
  reviewProfileRequestSchema,
} from "@consera/contracts";
import { deleteCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError, parseBody, requestId, requireOrigin } from "./http";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  verifyAccessCode,
  verifyCsrf,
  verifySession,
} from "./security/session";
import { SnowflakeClientError, snowflakeApi } from "./snowflake/client";

type ConseraEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    requestId: string;
    session: SessionPayload;
    startedAt: number;
  };
};

const app = new Hono<ConseraEnv>();
const loginSchema = z.object({ accessCode: z.string().min(1).max(256) });
const safeId = /^[A-Za-z0-9_-]{8,120}$/u;

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

function applySecurityHeaders(headers: Headers): void {
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
}

app.use("*", async (context, next) => {
  context.set("requestId", requestId(context.req.header("x-request-id")));
  context.set("startedAt", performance.now());
  await next();
  applySecurityHeaders(context.res.headers);
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

app.use("/api/v1/*", async (context, next) => {
  if (["/api/v1/auth/login", "/api/v1/session"].includes(context.req.path)) {
    await next();
    return;
  }
  const token = cookieValue(context.req.header("cookie"), SESSION_COOKIE);
  const session = token ? await verifySession(context.env, token) : null;
  if (!session) throw new ApiError("SESSION_REQUIRED", "Sign in to continue.", 401);
  context.set("session", session);
  if (!["GET", "HEAD"].includes(context.req.method)) {
    requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
    if (!(await verifyCsrf(session, context.req.header("x-consera-csrf") ?? ""))) {
      throw new ApiError("CSRF_REJECTED", "The request could not be verified.", 403);
    }
  }
  await next();
});

app.post("/api/v1/auth/login", async (context) => {
  requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
  let accessCode = "";
  try {
    accessCode = (await parseBody(context, loginSchema)).accessCode;
  } catch {
    await verifyAccessCode(context.env, "invalid-login-shape");
    throw new ApiError("AUTHENTICATION_FAILED", "The access code is invalid.", 401);
  }
  if (!(await verifyAccessCode(context.env, accessCode))) {
    throw new ApiError("AUTHENTICATION_FAILED", "The access code is invalid.", 401);
  }
  const session = await createSession(context.env);
  setCookie(context, SESSION_COOKIE, session.token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "Strict",
    secure: true,
  });
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
  deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true });
  return context.json(success({ authenticated: false }, context.get("requestId")));
});

app.get("/api/v1/session", async (context) => {
  const token = cookieValue(context.req.header("cookie"), SESSION_COOKIE);
  const session = token ? await verifySession(context.env, token) : null;
  if (session) {
    const renewed = await createSession(context.env);
    setCookie(context, SESSION_COOKIE, renewed.token, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "Strict",
      secure: true,
    });
    return context.json(
      success(
        {
          authenticated: true,
          csrfToken: renewed.csrfToken,
          expiresAt: renewed.expiresAt,
        },
        context.get("requestId"),
      ),
    );
  }
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
  return context.json(success(run, context.get("requestId")), 202);
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
