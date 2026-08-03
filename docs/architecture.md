# Architecture

Consera is a Snowflake-native, evidence-bound, silence-first project intelligence system.

## Runtime boundary

The statically exported Next.js frontend is served from Cloudflare Worker assets. The Hono Worker
checks the private review passkey from an encrypted secret, issues a short-lived signed browser
session, then handles request validation, response validation, and a fixed set of Snowflake SQL API
operations. Direct document paths and every API operation require the signed session. Mutations also
require a matching CSRF token and exact origin. Browser input cannot select SQL, roles, databases,
warehouses, schemas, views, or procedures.

The access route has local and aggregate edge rate limits. It accepts an exact four-digit Zod
contract, compares the secret in constant time, and never calls Snowflake. The Worker redirects
plain HTTP to HTTPS and adds HSTS, a same-origin content policy, clickjacking protection, and secure
cookie attributes. No passkey value appears in source, static assets, logs, or repository history.

Two independent Snowflake service identities are used:

- the application identity can read approved secure views and call approved application procedures;
- the ingestion identity can call the Hacker News batch admission procedure.

Neither identity can assume the Consera administration role.

## Authoritative control plane

Snowflake standard tables hold project documents, profile versions, signals, evidence, evaluation
jobs, verdicts, alert decisions, deliveries, AI usage, activity, configuration, and audit state. An
internal stage holds one reproducible Snowpark bundle.

One triggered task graph forms the signal pipeline:

```text
project document -> profile extraction -> human review -> active profile

Hacker News batch -> triggered landing root -> normalization and lexical candidate gate
                  -> evaluation child -> fenced deep analysis and deterministic publication
                  -> alert child -> ambiguity-safe email delivery
```

The landing stream is append-only. The evaluation and alert children use `AFTER` dependencies
instead of watching tables they update. The graph uses `NO_OVERLAP`, zero automatic retries, and a
two-failure suspension breaker. One daily batch therefore wakes one X-Small pipeline warehouse graph
without creating a state-change feedback loop.

All AI calls reserve budget first, use an exact structured-output schema, reconcile token usage, and
fail closed when their envelope or evidence references are invalid.

## Public read availability

The browser loads one consolidated workspace endpoint instead of four independent Snowflake queries.
The Worker stores the validated result in Cloudflare's state-free Cache API for 15 minutes, retains
it for up to seven days, and refreshes stale data in the background. Cache content remains local to
the serving Cloudflare data center. Concurrent refreshes inside one Worker isolate share a single
live load to reduce cache-stampede warehouse wakes.

The Worker also bundles a last-known-good snapshot exported from the real Snowflake secure views.
When a cold edge location cannot reach Snowflake, the UI labels that snapshot as stale and shows its
exact synchronization time. Mutations never run against a fixture or snapshot.

## Failure behavior

- Invalid project text is rejected before persistence.
- Invalid public-source items reject the batch transaction.
- Budget exhaustion defers work without consuming a provider attempt.
- Ambiguous AI outcomes are charged pessimistically.
- Ambiguous email outcomes enter `DELIVERY_UNKNOWN` and are not retried blindly.
- Stale profile activation loses a compare-and-set transition.
- Uncertain verdicts are quarantined or published without an alert.
- A resource-monitor pause cannot cascade from one Consera warehouse to another.
- An expired edge entry serves retained verified data while a bounded background refresh runs.
- Migration checksums stop an already-applied Snowflake migration from drifting silently.
