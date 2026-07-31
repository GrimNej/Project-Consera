import { fixtureAlerts, fixtureDashboard, fixtureSignals } from "@consera/fixture-data";
import { describe, expect, it, vi } from "vitest";

import { loadWorkspace } from "./workspace-cache";

const content = {
  alerts: fixtureAlerts,
  dashboard: fixtureDashboard,
  signals: fixtureSignals,
  verdicts: fixtureDashboard.topVerdicts,
};

function memoryCache(initial?: Response): {
  cache: Cache;
  put: ReturnType<typeof vi.fn>;
} {
  let response = initial;
  const put = vi.fn((_request: RequestInfo | URL, next: Response) => {
    response = next.clone();
    return Promise.resolve();
  });
  const cache = {
    match: vi.fn(() => Promise.resolve(response?.clone())),
    put,
  } as unknown as Cache;
  return { cache, put };
}

function stored(capturedAt: string): Response {
  return new Response(JSON.stringify({ capturedAt, workspace: content }), {
    headers: { "content-type": "application/json" },
  });
}

describe("state-free workspace cache", () => {
  it("serves a fresh edge snapshot without waking Snowflake", async () => {
    const live = vi.fn(() => Promise.resolve(content));
    const waitUntil = vi.fn();
    const result = await loadWorkspace({
      cache: memoryCache(stored("2026-07-31T10:00:00.000Z")).cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: live,
      now: () => new Date("2026-07-31T10:05:00.000Z"),
      waitUntil,
    });

    expect(result.sync).toEqual({
      mode: "EDGE_CACHE",
      stale: false,
      synchronizedAt: "2026-07-31T10:00:00.000Z",
    });
    expect(live).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("returns retained data immediately and refreshes stale data in the background", async () => {
    const live = vi.fn(() => Promise.resolve(content));
    const pending: Promise<unknown>[] = [];
    const result = await loadWorkspace({
      cache: memoryCache(stored("2026-07-31T09:00:00.000Z")).cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: live,
      now: () => new Date("2026-07-31T10:00:00.000Z"),
      waitUntil: (promise) => pending.push(promise),
    });

    expect(result.sync.stale).toBe(true);
    expect(result.sync.mode).toBe("EDGE_CACHE");
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(live).toHaveBeenCalledOnce();
  });

  it("stores one consolidated live result after a cold edge miss", async () => {
    const { cache, put } = memoryCache();
    const pending: Promise<unknown>[] = [];
    const result = await loadWorkspace({
      cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: () => Promise.resolve(content),
      now: () => new Date("2026-07-31T10:00:00.000Z"),
      waitUntil: (promise) => pending.push(promise),
    });

    expect(result.sync.mode).toBe("LIVE");
    expect(result.sync.stale).toBe(false);
    await Promise.all(pending);
    expect(put).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent cold misses inside one Worker isolate", async () => {
    const firstCache = memoryCache();
    const secondCache = memoryCache();
    let release: ((value: typeof content) => void) | undefined;
    const live = vi.fn(
      () =>
        new Promise<typeof content>((resolve) => {
          release = resolve;
        }),
    );
    const first = loadWorkspace({
      cache: firstCache.cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: live,
      waitUntil: () => undefined,
    });
    const second = loadWorkspace({
      cache: secondCache.cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: live,
      waitUntil: () => undefined,
    });

    await vi.waitFor(() => expect(live).toHaveBeenCalledOnce());
    release?.(content);

    await expect(first).resolves.toMatchObject({ sync: { mode: "LIVE" } });
    await expect(second).resolves.toMatchObject({ sync: { mode: "LIVE" } });
    expect(live).toHaveBeenCalledOnce();
  });

  it("keeps retained data when a background refresh fails", async () => {
    const pending: Promise<unknown>[] = [];
    const result = await loadWorkspace({
      cache: memoryCache(stored("2026-07-31T09:00:00.000Z")).cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: () => Promise.reject(new Error("sanitized upstream failure")),
      now: () => new Date("2026-07-31T10:00:00.000Z"),
      waitUntil: (promise) => pending.push(promise),
    });

    expect(result.sync).toMatchObject({ mode: "EDGE_CACHE", stale: true });
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });

  it("rejects a malformed cache entry and replaces it from live data", async () => {
    const live = vi.fn(() => Promise.resolve(content));
    const { cache } = memoryCache(
      new Response('{"capturedAt":"not-a-date","workspace":{}}', {
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await loadWorkspace({
      cache,
      cacheKey: new Request("https://consera.example/__cache"),
      loadLive: live,
      waitUntil: () => undefined,
    });

    expect(result.sync.mode).toBe("LIVE");
    expect(live).toHaveBeenCalledOnce();
  });
});
