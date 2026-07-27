const INGESTION_WORKFLOW_URL =
  "https://api.github.com/repos/GrimNej/Project-Consera/actions/workflows/hn-ingestion.yml/dispatches";
const DISPATCH_TIMEOUT_MS = 8_000;

export class GitHubDispatchError extends Error {
  readonly code = "INGESTION_DISPATCH_FAILED";
  readonly httpStatus = 503;
  readonly retryable = true;

  constructor() {
    super("The ingestion runner could not be started.");
  }
}

export async function dispatchIngestion(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(INGESTION_WORKFLOW_URL, {
      body: JSON.stringify({
        inputs: { fetch_mode: "manual" },
        ref: "main",
      }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "consera-ingestion-dispatch",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: "POST",
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
  } catch {
    throw new GitHubDispatchError();
  }

  if (response.status !== 204) {
    throw new GitHubDispatchError();
  }
}
