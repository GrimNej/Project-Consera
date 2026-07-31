import {
  alertSchema,
  askResponseSchema,
  dashboardSchema,
  projectProfileDraftSchema,
  projectSchema,
  signalSchema,
  verdictSchema,
  workspaceContentSchema,
  type AskRequest,
  type CreateProjectRequest,
} from "@consera/contracts";
import { z } from "zod";

import { createSnowflakeJwt } from "./jwt";

const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_RESULT_ROWS = 200;
const HANDLE_PATTERN = /^[0-9a-f-]{16,64}$/u;
const POLL_DELAYS_MS = [800, 1_600, 3_200, 6_400, 10_000] as const;

const statementResponseSchema = z
  .object({
    data: z.array(z.array(z.string().nullable())).optional(),
    resultSetMetaData: z
      .object({
        partitionInfo: z.array(z.object({ rowCount: z.number().int().nonnegative() })).optional(),
        rowType: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
            }),
          )
          .optional(),
      })
      .optional(),
    statementHandle: z.string().optional(),
  })
  .loose();

type StatementResponse = z.infer<typeof statementResponseSchema>;
type BindValue = boolean | number | string;
type ResultRow = Record<string, unknown>;

export class SnowflakeClientError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus: 500 | 502 | 503 = 502,
  ) {
    super(code);
  }
}

function normalizeHost(host: string): string {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/$/u, "");
  if (!/^[a-z0-9.-]+\.snowflakecomputing\.com$/u.test(normalized)) {
    throw new SnowflakeClientError("SNOWFLAKE_CONFIG_INVALID", false, 500);
  }
  return normalized;
}

async function readBoundedJson(response: Response): Promise<StatementResponse> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new SnowflakeClientError("UPSTREAM_NON_JSON", false);
  }
  if (!response.body) throw new SnowflakeClientError("UPSTREAM_EMPTY_RESPONSE", false);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel("bounded_response_exceeded");
      throw new SnowflakeClientError("UPSTREAM_RESPONSE_TOO_LARGE", false);
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SnowflakeClientError("UPSTREAM_MALFORMED_JSON", false);
  }
  const validated = statementResponseSchema.safeParse(parsed);
  if (!validated.success) throw new SnowflakeClientError("UPSTREAM_INVALID_ENVELOPE", false);
  return validated.data;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, fallback: number): number {
  const seconds = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0) * 1000, 10_000) : fallback;
}

function camelCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_([a-z0-9])/gu, (_match, character: string) => character.toUpperCase());
}

function decodeCell(value: string | null, type: string): unknown {
  if (value === null) return null;
  if (["array", "object", "variant"].includes(type.toLowerCase())) {
    try {
      return JSON.parse(value);
    } catch {
      throw new SnowflakeClientError("UPSTREAM_INVALID_VARIANT", false);
    }
  }
  if (type.toLowerCase() === "boolean") return value.toLowerCase() === "true";
  if (["fixed", "real"].includes(type.toLowerCase())) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  return value;
}

function rowsFromResponse(body: StatementResponse): ResultRow[] {
  if ((body.resultSetMetaData?.partitionInfo ?? []).length > 1) {
    throw new SnowflakeClientError("UPSTREAM_RESULT_PARTITIONED", false);
  }
  const data = body.data ?? [];
  const rowType = body.resultSetMetaData?.rowType ?? [];
  if (data.length > MAX_RESULT_ROWS || data.some((row) => row.length !== rowType.length)) {
    throw new SnowflakeClientError("UPSTREAM_RESULT_INVALID", false);
  }
  return data.map((row) =>
    Object.fromEntries(
      rowType.map((column, index) => [
        camelCase(column.name),
        decodeCell(row[index] ?? null, column.type),
      ]),
    ),
  );
}

function procedureResult(body: StatementResponse): unknown {
  const value = body.data?.[0]?.[0];
  if (typeof value !== "string") {
    throw new SnowflakeClientError("UPSTREAM_PROCEDURE_RESULT_INVALID", false);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new SnowflakeClientError("UPSTREAM_PROCEDURE_RESULT_INVALID", false);
  }
}

function snowflakeBindings(
  values: readonly BindValue[],
): Record<string, { type: string; value: string }> {
  return Object.fromEntries(
    values.map((value, index) => [
      String(index + 1),
      {
        type: typeof value === "number" ? "FIXED" : typeof value === "boolean" ? "BOOLEAN" : "TEXT",
        value: String(value),
      },
    ]),
  );
}

async function requestHeaders(bindings: CloudflareBindings): Promise<Headers> {
  return new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${await createSnowflakeJwt(bindings)}`,
    "Content-Type": "application/json",
    "User-Agent": "consera-api/0.1.0",
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  });
}

async function poll(
  endpoint: string,
  handle: string,
  headers: Headers,
  initialResponse: Response,
): Promise<StatementResponse> {
  if (!HANDLE_PATTERN.test(handle)) {
    throw new SnowflakeClientError("UPSTREAM_STATEMENT_HANDLE_INVALID", false);
  }
  let previous = initialResponse;
  for (const fallbackDelay of POLL_DELAYS_MS) {
    await wait(retryDelay(previous, fallbackDelay));
    let response: Response;
    try {
      response = await fetch(`${endpoint}/${encodeURIComponent(handle)}`, { headers });
    } catch {
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      previous = response;
      continue;
    }
    const body = await readBoundedJson(response);
    if (response.status === 202) {
      previous = response;
      continue;
    }
    if (!response.ok) throw new SnowflakeClientError("SNOWFLAKE_STATEMENT_FAILED", false);
    return body;
  }
  throw new SnowflakeClientError("SNOWFLAKE_STATEMENT_PENDING", true, 503);
}

async function execute(
  bindings: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  requestId: string,
): Promise<StatementResponse> {
  const endpoint = `https://${normalizeHost(bindings.SNOWFLAKE_HOST)}/api/v2/statements`;
  const headers = await requestHeaders(bindings);
  let response: Response;
  try {
    response = await fetch(`${endpoint}?requestId=${encodeURIComponent(crypto.randomUUID())}`, {
      body: JSON.stringify({
        bindings: snowflakeBindings(values),
        database: "CONSERA",
        parameters: {
          QUERY_TAG: `consera:${requestId}`,
          ROWS_PER_RESULTSET: MAX_RESULT_ROWS,
          TIMESTAMP_TZ_OUTPUT_FORMAT: 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM',
        },
        role: "CONSERA_APP_ROLE",
        schema: "APP_API",
        statement,
        timeout: 10,
        warehouse: "CONSERA_APP_WH",
      }),
      headers,
      method: "POST",
    });
  } catch {
    throw new SnowflakeClientError("SNOWFLAKE_SUBMISSION_OUTCOME_UNKNOWN", false, 503);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new SnowflakeClientError("SNOWFLAKE_UNAVAILABLE", true, 503);
  }
  const body = await readBoundedJson(response);
  if (response.status === 202) {
    if (!body.statementHandle) {
      throw new SnowflakeClientError("UPSTREAM_STATEMENT_HANDLE_MISSING", false);
    }
    return poll(endpoint, body.statementHandle, headers, response);
  }
  if (!response.ok) throw new SnowflakeClientError("SNOWFLAKE_REQUEST_FAILED", false);
  return body;
}

async function query(
  bindings: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  requestId: string,
): Promise<ResultRow[]> {
  return rowsFromResponse(await execute(bindings, statement, values, requestId));
}

async function call(
  bindings: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  requestId: string,
): Promise<unknown> {
  return procedureResult(await execute(bindings, statement, values, requestId));
}

function variantRows<T>(rows: ResultRow[], key: string, schema: z.ZodType<T>): T[] {
  return rows.map((row) => {
    const result = schema.safeParse(row[key]);
    if (!result.success) throw new SnowflakeClientError("UPSTREAM_CONTRACT_INVALID", false);
    return result.data;
  });
}

export const snowflakeApi = {
  activateProfile: async (
    env: CloudflareBindings,
    input: {
      expectedProjectVersion: number;
      idempotencyKey: string;
      profile: unknown;
      projectId: string;
    },
    requestId: string,
  ) =>
    projectSchema.parse(
      await call(
        env,
        "CALL CONSERA.APP_API.ACTIVATE_PROFILE(?, PARSE_JSON(?), ?, ?)",
        [
          input.projectId,
          JSON.stringify(input.profile),
          input.expectedProjectVersion,
          input.idempotencyKey,
        ],
        requestId,
      ),
    ),
  alerts: async (env: CloudflareBindings, requestId: string) =>
    variantRows(
      await query(
        env,
        "SELECT ALERT FROM CONSERA.APP_API.ALERT_V ORDER BY CREATED_AT DESC LIMIT 100",
        [],
        requestId,
      ),
      "alert",
      alertSchema,
    ),
  ask: async (env: CloudflareBindings, input: AskRequest, requestId: string) =>
    askResponseSchema.parse(
      await call(
        env,
        "CALL CONSERA.APP_API.ASK_CONSERA(PARSE_JSON(?)::ARRAY, ?, ?)",
        [JSON.stringify(input.projectIds), input.question, input.idempotencyKey],
        requestId,
      ),
    ),
  createProject: async (env: CloudflareBindings, input: CreateProjectRequest, requestId: string) =>
    projectSchema.parse(
      await call(
        env,
        "CALL CONSERA.APP_API.CREATE_PROJECT(?, ?, ?, ?)",
        [input.name, input.readmeText, input.alertsEnabled, input.idempotencyKey],
        requestId,
      ),
    ),
  dashboard: async (env: CloudflareBindings, requestId: string) => {
    const rows = await query(
      env,
      "SELECT DASHBOARD FROM CONSERA.APP_API.DASHBOARD_V LIMIT 1",
      [],
      requestId,
    );
    return dashboardSchema.parse(rows[0]?.dashboard);
  },
  health: async (env: CloudflareBindings, requestId: string) =>
    z
      .object({ status: z.literal("ok") })
      .parse(await call(env, "CALL CONSERA.APP_API.HEALTH()", [], requestId)),
  manualIngestion: async (env: CloudflareBindings, idempotencyKey: string, requestId: string) =>
    z
      .object({
        dispatchRequired: z.boolean(),
        runId: z.string().uuid(),
        state: z.enum(["QUEUED", "RUNNING", "COMPLETED"]),
      })
      .parse(
        await call(env, "CALL CONSERA.APP_API.REQUEST_INGESTION(?)", [idempotencyKey], requestId),
      ),
  profileDraft: async (env: CloudflareBindings, projectId: string, requestId: string) => {
    const rows = await query(
      env,
      "SELECT DRAFT FROM CONSERA.APP_API.PROFILE_DRAFT_V WHERE PROJECT_ID = ? LIMIT 1",
      [projectId],
      requestId,
    );
    return projectProfileDraftSchema.parse(rows[0]?.draft);
  },
  projects: async (env: CloudflareBindings, requestId: string) =>
    variantRows(
      await query(
        env,
        "SELECT PROJECT FROM CONSERA.APP_API.PROJECT_V ORDER BY UPDATED_AT DESC LIMIT 50",
        [],
        requestId,
      ),
      "project",
      projectSchema,
    ),
  signals: async (env: CloudflareBindings, requestId: string) =>
    variantRows(
      await query(
        env,
        "SELECT SIGNAL FROM CONSERA.APP_API.SIGNAL_V ORDER BY DISCOVERED_AT DESC LIMIT 100",
        [],
        requestId,
      ),
      "signal",
      signalSchema,
    ),
  verdicts: async (env: CloudflareBindings, requestId: string) =>
    variantRows(
      await query(
        env,
        "SELECT VERDICT FROM CONSERA.APP_API.VERDICT_V ORDER BY PUBLISHED_AT DESC LIMIT 100",
        [],
        requestId,
      ),
      "verdict",
      verdictSchema,
    ),
  workspace: async (env: CloudflareBindings, requestId: string) => {
    const rows = await query(
      env,
      `
      SELECT
          dashboard.DASHBOARD,
          (
              SELECT COALESCE(
                  ARRAY_AGG(signal_data.SIGNAL)
                      WITHIN GROUP (ORDER BY signal_data.DISCOVERED_AT DESC),
                  ARRAY_CONSTRUCT()
              )
              FROM (
                  SELECT SIGNAL, DISCOVERED_AT
                  FROM CONSERA.APP_API.SIGNAL_V
                  ORDER BY DISCOVERED_AT DESC
                  LIMIT 100
              ) AS signal_data
          ) AS SIGNALS,
          (
              SELECT COALESCE(
                  ARRAY_AGG(verdict_data.VERDICT)
                      WITHIN GROUP (ORDER BY verdict_data.PUBLISHED_AT DESC),
                  ARRAY_CONSTRUCT()
              )
              FROM (
                  SELECT VERDICT, PUBLISHED_AT
                  FROM CONSERA.APP_API.VERDICT_V
                  ORDER BY PUBLISHED_AT DESC
                  LIMIT 100
              ) AS verdict_data
          ) AS VERDICTS,
          (
              SELECT COALESCE(
                  ARRAY_AGG(alert_data.ALERT)
                      WITHIN GROUP (ORDER BY alert_data.CREATED_AT DESC),
                  ARRAY_CONSTRUCT()
              )
              FROM (
                  SELECT ALERT, CREATED_AT
                  FROM CONSERA.APP_API.ALERT_V
                  ORDER BY CREATED_AT DESC
                  LIMIT 100
              ) AS alert_data
          ) AS ALERTS
      FROM CONSERA.APP_API.DASHBOARD_V AS dashboard
      LIMIT 1
      `,
      [],
      requestId,
    );
    return workspaceContentSchema.parse(rows[0]);
  },
} as const;
