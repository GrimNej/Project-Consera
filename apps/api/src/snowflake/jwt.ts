const textEncoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeTextBase64Url(value: string): string {
  return encodeBase64Url(textEncoder.encode(value));
}

function parsePkcs8Pem(value: string): ArrayBuffer {
  const base64 = value
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/gu, "");
  if (!base64) throw new Error("Snowflake private key is empty.");

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Snowflake private key is not valid PKCS#8 PEM.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

export async function createSnowflakeJwt(
  bindings: Pick<
    CloudflareBindings,
    | "SNOWFLAKE_ACCOUNT_LOCATOR"
    | "SNOWFLAKE_PRIVATE_KEY"
    | "SNOWFLAKE_PUBLIC_KEY_FINGERPRINT"
    | "SNOWFLAKE_USER"
  >,
  now = Date.now(),
): Promise<string> {
  const accountLocator = bindings.SNOWFLAKE_ACCOUNT_LOCATOR.trim().toUpperCase();
  const user = bindings.SNOWFLAKE_USER.trim().toUpperCase();
  const fingerprint = bindings.SNOWFLAKE_PUBLIC_KEY_FINGERPRINT.trim();
  if (!accountLocator || !user || !fingerprint) {
    throw new Error("Snowflake JWT configuration is incomplete.");
  }

  const qualifiedUser = `${accountLocator}.${user}`;
  const nowSeconds = Math.floor(now / 1000);
  const header = encodeTextBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeTextBase64Url(
    JSON.stringify({
      exp: nowSeconds + 3540,
      iat: nowSeconds - 60,
      iss: `${qualifiedUser}.SHA256:${fingerprint}`,
      sub: qualifiedUser,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    parsePkcs8Pem(bindings.SNOWFLAKE_PRIVATE_KEY),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    textEncoder.encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}
