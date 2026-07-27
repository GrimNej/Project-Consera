import {
  alertSchema,
  askResponseSchema,
  dashboardSchema,
  projectProfileDraftSchema,
  projectSchema,
  signalSchema,
  verdictSchema,
  type Alert,
  type AskResponse,
  type Dashboard,
  type Project,
  type ProjectProfile,
  type ProjectProfileDraft,
  type Signal,
  type Verdict,
} from "@consera/contracts";
import {
  fixtureAlerts,
  fixtureAskResponse,
  fixtureDashboard,
  fixtureSignals,
} from "@consera/fixture-data";
import { z } from "zod";

const fixtureMode = process.env.NEXT_PUBLIC_CONSERA_FIXTURE_MODE === "true";
const fixtureProjectNames = new Map<string, string>();
const csrfKey = "consera-csrf";

const sessionDataSchema = z.object({
  authenticated: z.boolean(),
  csrfToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const ingestionRunSchema = z.object({
  runId: z.string().uuid(),
  state: z.enum(["QUEUED", "RUNNING", "COMPLETED"]),
});

export class ConseraApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function envelopeSchema<T>(data: z.ZodType<T>) {
  return z.object({
    data,
    ok: z.literal(true),
    requestId: z.string(),
  });
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ConseraApiError("INVALID_RESPONSE", "Consera received an invalid response.");
  }
  try {
    return await response.json();
  } catch {
    throw new ConseraApiError("INVALID_RESPONSE", "Consera received an invalid response.");
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> {
  const { body: requestBody, ...requestOptions } = init ?? {};
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (requestBody !== undefined) headers.set("Content-Type", "application/json");
  if (init?.method && !["GET", "HEAD"].includes(init.method)) {
    const csrf = sessionStorage.getItem(csrfKey);
    if (csrf) headers.set("x-consera-csrf", csrf);
  }
  const response = await fetch(path, {
    ...requestOptions,
    ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    credentials: "same-origin",
    headers,
  });
  const parsed = await readJson(response);
  if (!response.ok) {
    const error = z
      .object({
        error: z.object({
          code: z.string(),
          message: z.string(),
          requestId: z.string().optional(),
        }),
      })
      .safeParse(parsed);
    throw new ConseraApiError(
      error.success ? error.data.error.code : "REQUEST_FAILED",
      error.success ? error.data.error.message : "The request could not be completed.",
      error.success ? error.data.error.requestId : undefined,
    );
  }
  const result = envelopeSchema(schema).safeParse(parsed);
  if (!result.success) {
    throw new ConseraApiError("INVALID_RESPONSE", "Consera received an invalid response.");
  }
  return result.data.data;
}

export type WorkspaceData = Readonly<{
  alerts: Alert[];
  dashboard: Dashboard;
  signals: Signal[];
  verdicts: Verdict[];
}>;

export const conseraApi = {
  ask: async (projectIds: string[], question: string): Promise<AskResponse> => {
    if (fixtureMode) {
      await Promise.resolve();
      return fixtureAskResponse;
    }
    return request("/api/v1/ask", askResponseSchema, {
      body: {
        idempotencyKey: crypto.randomUUID(),
        projectIds,
        question,
      },
      method: "POST",
    });
  },
  createProject: async (input: {
    alertsEnabled: boolean;
    name: string;
    readmeText: string;
  }): Promise<Project> => {
    if (fixtureMode) {
      await Promise.resolve();
      const now = new Date().toISOString();
      const projectId = crypto.randomUUID();
      fixtureProjectNames.set(projectId, input.name);
      return projectSchema.parse({
        activeProfile: null,
        alertsEnabled: input.alertsEnabled,
        createdAt: now,
        id: projectId,
        name: input.name,
        profileState: "REVIEW",
        updatedAt: now,
        version: 2,
      });
    }
    return request("/api/v1/projects", projectSchema, {
      body: {
        ...input,
        idempotencyKey: crypto.randomUUID(),
      },
      method: "POST",
    });
  },
  getSession: async (): Promise<z.infer<typeof sessionDataSchema>> => {
    if (fixtureMode) return { authenticated: true };
    const result = await request("/api/v1/session", sessionDataSchema);
    if (result.csrfToken) sessionStorage.setItem(csrfKey, result.csrfToken);
    return result;
  },
  getProfileDraft: async (projectId: string): Promise<ProjectProfileDraft> => {
    if (fixtureMode) {
      await Promise.resolve();
      return projectProfileDraftSchema.parse({
        evidence: {
          excerpt:
            "Ledgerlane watches payment and ledger infrastructure changes, with an emphasis on provider reliability, compliance constraints, and migration risk.",
          id: "fixture-project-evidence",
          label: "Reviewed project README",
          publishedAt: new Date().toISOString(),
          sourceKind: "PROJECT",
          sourceUrl: null,
        },
        profile: {
          capabilities: ["Payment event reconciliation", "Ledger integrity monitoring"],
          completeness: 0.84,
          constraints: ["Changes require human approval"],
          dependencies: ["PostgreSQL", "Stripe"],
          differentiators: ["Evidence-backed reconciliation"],
          monitoredTopics: ["payment infrastructure", "ledger databases", "Stripe"],
          projectId,
          providers: ["Stripe"],
          summary:
            "A financial operations product that detects reconciliation gaps and protects ledger integrity.",
          targetUsers: ["Finance and platform operations teams"],
          version: 1,
        },
        projectVersion: 2,
      });
    }
    return request(
      `/api/v1/projects/${encodeURIComponent(projectId)}/profile-draft`,
      projectProfileDraftSchema,
    );
  },
  activateProfile: async (
    projectId: string,
    profile: ProjectProfile,
    expectedProjectVersion: number,
  ): Promise<Project> => {
    if (fixtureMode) {
      await Promise.resolve();
      return projectSchema.parse({
        activeProfile: { ...profile, version: profile.version + 1 },
        alertsEnabled: true,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        id: projectId,
        name: fixtureProjectNames.get(projectId) ?? "Reviewed project",
        profileState: "ACTIVE",
        updatedAt: new Date().toISOString(),
        version: expectedProjectVersion + 1,
      });
    }
    return request(`/api/v1/projects/${encodeURIComponent(projectId)}/activate`, projectSchema, {
      body: {
        expectedProjectVersion,
        idempotencyKey: crypto.randomUUID(),
        profile,
      },
      method: "POST",
    });
  },
  getWorkspace: async (): Promise<WorkspaceData> => {
    if (fixtureMode) {
      await Promise.resolve();
      return {
        alerts: fixtureAlerts,
        dashboard: fixtureDashboard,
        signals: fixtureSignals,
        verdicts: fixtureDashboard.topVerdicts,
      };
    }
    const [dashboard, signals, verdicts, alerts] = await Promise.all([
      request("/api/v1/dashboard", dashboardSchema),
      request("/api/v1/signals", signalSchema.array()),
      request("/api/v1/verdicts", verdictSchema.array()),
      request("/api/v1/alerts", alertSchema.array()),
    ]);
    return { alerts, dashboard, signals, verdicts };
  },
  runIngestion: async (): Promise<z.infer<typeof ingestionRunSchema>> => {
    if (fixtureMode) {
      await Promise.resolve();
      return { runId: crypto.randomUUID(), state: "QUEUED" };
    }
    return request("/api/v1/ingestion/run", ingestionRunSchema, {
      body: { idempotencyKey: crypto.randomUUID() },
      method: "POST",
    });
  },
};
