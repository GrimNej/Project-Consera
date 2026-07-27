import { z } from "zod";

import { constantTimeEqual, hmacSha256, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "__Host-consera_session";
export const SESSION_MAX_AGE_SECONDS = 1800;

const sessionSchema = z.object({
  csrfHash: z.string().min(40).max(64),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  nonce: z.string().min(20).max(64),
  sub: z.literal("browser"),
});

export type SessionPayload = z.infer<typeof sessionSchema>;

function encodeText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeText(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("INVALID_SESSION");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
  );
}

export async function createSession(
  bindings: Pick<CloudflareBindings, "SESSION_SIGNING_SECRET">,
  nowMilliseconds = Date.now(),
): Promise<{ csrfToken: string; expiresAt: string; token: string }> {
  const csrfToken = randomToken(24);
  const issuedAt = Math.floor(nowMilliseconds / 1000);
  const payload: SessionPayload = {
    csrfHash: await sha256(csrfToken),
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    iat: issuedAt,
    nonce: randomToken(24),
    sub: "browser",
  };
  const encodedPayload = encodeText(JSON.stringify(payload));
  const signature = await hmacSha256(bindings.SESSION_SIGNING_SECRET, encodedPayload);
  return {
    csrfToken,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    token: `${encodedPayload}.${signature}`,
  };
}

export async function verifySession(
  bindings: Pick<CloudflareBindings, "SESSION_SIGNING_SECRET">,
  token: string,
  nowMilliseconds = Date.now(),
): Promise<SessionPayload | null> {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;
  const expectedSignature = await hmacSha256(bindings.SESSION_SIGNING_SECRET, encodedPayload);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeText(encodedPayload));
  } catch {
    return null;
  }
  const result = sessionSchema.safeParse(parsed);
  if (!result.success) return null;
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  if (result.data.exp <= nowSeconds || result.data.iat > nowSeconds + 60) return null;
  return result.data;
}

export async function verifyCsrf(payload: SessionPayload, token: string): Promise<boolean> {
  return constantTimeEqual(await sha256(token), payload.csrfHash);
}
