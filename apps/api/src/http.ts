import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";

const MAX_REQUEST_BYTES = 210_000;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ContentfulStatusCode,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export function requestId(candidate: string | undefined): string {
  if (candidate && /^[A-Za-z0-9_-]{16,120}$/u.test(candidate)) return candidate;
  return crypto.randomUUID();
}

export function requireOrigin(origin: string | undefined, allowedOrigin: string): void {
  if (!origin || origin !== allowedOrigin) {
    throw new ApiError("ORIGIN_REJECTED", "The request origin is not allowed.", 403);
  }
}

export async function parseBody<T>(context: Context, schema: ZodType<T>): Promise<T> {
  const contentType = context.req.header("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("CONTENT_TYPE_REQUIRED", "Send a JSON request.", 415);
  }
  const contentLength = Number(context.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new ApiError("REQUEST_TOO_LARGE", "The request is too large.", 413);
  }

  let parsed: unknown;
  try {
    const body = await context.req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      throw new ApiError("REQUEST_TOO_LARGE", "The request is too large.", 413);
    }
    parsed = JSON.parse(body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError("INVALID_REQUEST", "The request did not match the required contract.", 422);
  }
  return result.data;
}
