# Cortex Code Cost and Task Review

- **Date:** 2026-07-31
- **Mode:** Read-only repository review
- **Scope:** Warehouse boundaries, task topology, migration immutability, budget deferral, and
  archived-failure health
- **Result:** Completed

## Accepted

- The V005 landing, evaluation, and alert dependency graph removes the former state-table feedback
  loop. The root watches only the append-only landing stream, and the two children cannot trigger
  themselves.
- Separate one-credit weekly resource monitors, X-Small warehouses, 60-second auto-suspend, explicit
  task timeouts, zero task retries, and the application AI ledger form independent cost breakers.
- Baseline digests and strict checksum drift are intentionally conservative. An applied migration
  cannot be changed silently.
- A two-hour task-history window is appropriate for immediate release verification.

## Changed

- V006 now recreates the independent profile task with explicit `TASK_AUTO_RETRY_ATTEMPTS = 0`,
  `OVERLAP_POLICY = NO_OVERLAP`, a two-failure suspension breaker, and its existing 180-second
  timeout. The live and static audits verify these guards.
- The migration recovery runbook now treats checksum drift as an operator investigation, never an
  automatic rebaseline.

## Rejected

- Source batch failures are not scoped to a project. Hacker News batches enter before project
  matching, so archiving a project must not conceal a failed source batch. An unresolved batch
  failure remains an intentional health and release failure.
- Budget deferrals do not wake Snowflake every 15 minutes. Evaluation is a child of the landing
  graph and runs only after a daily or manual ingestion. `NEXT_ATTEMPT_AT` is an eligibility
  boundary, not a schedule. A hard deferral-count terminal state would discard a valid candidate
  merely because earlier runs exhausted the daily cap.
- Recovery does not reset an existing monitor's frequency or start timestamp automatically. Repeated
  recovery must not restart a quota window. The operation creates the expected weekly monitors, and
  the live audit rejects any frequency other than weekly.

## Resulting artifact

- Implementation commit: `d3db0dc`
- Live proof: `docs/evidence/release-reliability-verification.json`
