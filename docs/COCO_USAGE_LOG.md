# Cortex Code Usage Log

Every entry records a sanitized summary only. Account identifiers, session identifiers, source
content, prompts containing source content, and credentials are excluded.

## 2026-07-27: Cost-control release review attempt

- **Goal:** Ask Cortex Code to review the Snowflake warehouse, triggered-task, AI-budget, and
  Cloudflare state boundaries in read-only mode.
- **Result:** Rejected as evidence. One connected attempt returned without reviewing because the
  repository read tool was blocked. Two further bounded attempts, including a self-contained
  sanitized evidence packet that required no tools or SQL, timed out without a model response.
- **Accepted:** Nothing. No model response or Snowflake review was produced.
- **Edited:** Nothing.
- **Rejected:** The blocked-tool response and all timed-out sessions. No transcript, screenshot,
  session identifier, raw prompt, or empty artifact is published.
- **Follow-up:** The independently verified product release remains valid. Capture one successful
  owner-authenticated read-only review before freezing submission artifacts, without using bypass
  permissions.

## 2026-07-31: Key-pair review connection attempt

- **Goal:** Review the live cost recovery, V005 dependency graph, migration immutability, and
  archived-failure health scoping with read-only SQL and repository tools.
- **Result:** Rejected as evidence. Cortex Code v1.1.41 ignored the working Snowflake JWT service
  connection and waited for browser authentication. The local connection was aligned with the
  documented `private_key_path` and `snowflake_jwt` fields, and the official updater installed
  v1.1.52. The updated client exhibited the same browser timeout before any model turn.
- **Accepted:** Nothing. No model review was produced.
- **Edited:** Nothing by Cortex Code.
- **Rejected:** All connection-timeout output. It proves neither Snowflake reasoning nor product
  quality, so no transcript or screenshot is published.
- **Follow-up:** Product release validation continues independently. Submission artifacts remain
  unfrozen until one successful Cortex Code session can be captured without repeated owner login.

## 2026-07-31: Cost and task release review

- **Goal:** Challenge the task topology, warehouse boundaries, migration immutability, budget
  deferral, and archived-failure health behavior before production deployment.
- **Result:** Completed through the cached owner OAuth connection in read-only mode after the
  service-key connection incompatibility was isolated. No new login was requested.
- **Accepted:** The landing dependency graph cannot retrigger from its own state; independent
  warehouse and AI breakers bound spend; checksum drift is conservatively safe; the two-hour live
  audit window is appropriate for release verification.
- **Edited:** The profile task now has explicit zero-retry, no-overlap, timeout, and suspension
  guards in V006. Static and live audits verify the change.
- **Rejected:** Project scoping for source-global batch failures, a deferral-count terminal state,
  and automatic monitor-window resets. Each recommendation conflicted with verified product
  semantics or cost safety, as documented in the sanitized review.
- **Artifact:** `docs/evidence/cortex-cost-task-review.md`
- **Related commit:** `d3db0dc`
