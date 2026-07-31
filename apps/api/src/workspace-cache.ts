import {
  workspaceContentSchema,
  workspaceSchema,
  type Workspace,
  type WorkspaceContent,
} from "@consera/contracts";
import { z } from "zod";

import deployedSnapshot from "./snapshot/workspace.json";

const FRESH_FOR_MS = 15 * 60 * 1_000;
const CACHE_FOR_SECONDS = 7 * 24 * 60 * 60;

const storedWorkspaceSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }),
  workspace: workspaceContentSchema,
});

const deployedSnapshotSchema = z.discriminatedUnion("ready", [
  z.object({
    capturedAt: z.string().datetime({ offset: true }),
    ready: z.literal(true),
    workspace: workspaceContentSchema,
  }),
  z.object({
    capturedAt: z.string().datetime({ offset: true }),
    ready: z.literal(false),
    workspace: z.null(),
  }),
]);

type WorkspaceCacheOptions = Readonly<{
  cache: Cache | null;
  cacheKey: Request;
  loadLive: () => Promise<WorkspaceContent>;
  now?: () => Date;
  waitUntil: (promise: Promise<unknown>) => void;
}>;

let liveLoadInFlight: Promise<WorkspaceContent> | null = null;

function present(
  content: WorkspaceContent,
  mode: Workspace["sync"]["mode"],
  synchronizedAt: string,
  stale: boolean,
): Workspace {
  return workspaceSchema.parse({
    ...content,
    sync: { mode, stale, synchronizedAt },
  });
}

async function readCached(cache: Cache | null, key: Request) {
  if (!cache) return null;
  try {
    const response = await cache.match(key);
    if (!response) return null;
    const parsed = storedWorkspaceSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function storeCached(
  cache: Cache | null,
  key: Request,
  workspace: WorkspaceContent,
  capturedAt: string,
): Promise<void> {
  if (!cache) return;
  const response = new Response(JSON.stringify({ capturedAt, workspace }), {
    headers: {
      "Cache-Control": `public, max-age=${CACHE_FOR_SECONDS}`,
      "Content-Type": "application/json",
    },
  });
  await cache.put(key, response);
}

async function refresh(
  cache: Cache | null,
  key: Request,
  loadLive: () => Promise<WorkspaceContent>,
  now: () => Date,
): Promise<void> {
  try {
    const workspace = await coalescedLiveLoad(loadLive);
    await storeCached(cache, key, workspace, now().toISOString());
  } catch {
    // The retained cache entry remains the honest last-known-good result.
  }
}

async function coalescedLiveLoad(loadLive: () => Promise<WorkspaceContent>) {
  if (!liveLoadInFlight) {
    liveLoadInFlight = Promise.resolve()
      .then(loadLive)
      .then((workspace) => workspaceContentSchema.parse(workspace))
      .finally(() => {
        liveLoadInFlight = null;
      });
  }
  return liveLoadInFlight;
}

export async function loadWorkspace(options: WorkspaceCacheOptions): Promise<Workspace> {
  const now = options.now ?? (() => new Date());
  const cached = await readCached(options.cache, options.cacheKey);
  if (cached) {
    const age = now().getTime() - new Date(cached.capturedAt).getTime();
    if (age <= FRESH_FOR_MS) {
      return present(cached.workspace, "EDGE_CACHE", cached.capturedAt, false);
    }
    options.waitUntil(refresh(options.cache, options.cacheKey, options.loadLive, now));
    return present(cached.workspace, "EDGE_CACHE", cached.capturedAt, true);
  }

  try {
    // This is only an opportunistic same-isolate stampede guard. Durable correctness remains in
    // Snowflake and the Cache API, so a new isolate or data center is always safe.
    const workspace = await coalescedLiveLoad(options.loadLive);
    const capturedAt = now().toISOString();
    options.waitUntil(
      storeCached(options.cache, options.cacheKey, workspace, capturedAt).catch(() => undefined),
    );
    return present(workspace, "LIVE", capturedAt, false);
  } catch (error) {
    const fallback = deployedSnapshotSchema.parse(deployedSnapshot);
    if (fallback.ready) {
      return present(fallback.workspace, "DEPLOYED_SNAPSHOT", fallback.capturedAt, true);
    }
    throw error;
  }
}

export function workspaceCacheKey(requestUrl: string): Request {
  const url = new URL(requestUrl);
  url.pathname = "/__consera-cache/workspace-v1";
  url.search = "";
  return new Request(url, { method: "GET" });
}
