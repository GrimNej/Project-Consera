import { describe, expect, it, vi } from "vitest";

import { dispatchIngestion, GitHubDispatchError } from "./dispatch";

describe("GitHub ingestion dispatch", () => {
  it("dispatches the fixed workflow without exposing the token in the body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await dispatchIngestion("private-token", fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.github.com/repos/GrimNej/Project-Consera/actions/workflows/hn-ingestion.yml/dispatches",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"inputs":{"fetch_mode":"manual"},"ref":"main"}');
    expect(init?.body).not.toBe("private-token");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-token");
  });

  it("maps provider failures to a sanitized retryable error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("provider details must stay private", {
        status: 401,
      }),
    );

    await expect(dispatchIngestion("expired-token", fetcher)).rejects.toEqual(
      expect.objectContaining<Partial<GitHubDispatchError>>({
        code: "INGESTION_DISPATCH_FAILED",
        httpStatus: 503,
        retryable: true,
      }),
    );
  });

  it("bounds network failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network details"));

    await expect(dispatchIngestion("private-token", fetcher)).rejects.toBeInstanceOf(
      GitHubDispatchError,
    );
  });
});
