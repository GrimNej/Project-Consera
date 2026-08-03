# Build Log

## 2026-07-23: Repository and product contract

- **Goal:** Establish a clean canonical workspace and a platform-isolated operating contract.
- **Files:** `.gitignore`, `AGENTS.md`, root tooling configuration, `progress.md`,
  `decision-log.md`.
- **Evidence:** The target directory was empty, the new GitHub repository had no refs, and the older
  `Conseraa` repository remained unchanged with its original remote.
- **Decision:** Use a static Next.js product and Hono Worker API while retaining Snowflake as the
  authoritative intelligence platform.
- **Related commit:** `7cc19bf`
- **Rollback point:** Remove the initial, unpushed workspace. No external resource was changed.

## 2026-07-23: Snowflake-native intelligence foundation

- **Goal:** Implement the isolated Consera data model, profile lifecycle, ingestion graph,
  consequence pipeline, alert policy, and Ask Consera contract.
- **Files:** `snowflake/migrations/`, `snowflake/src/consera/`, `bridges/hn/`, `scripts/`,
  `.github/workflows/hn-ingestion.yml`.
- **Commands:** `uv run ruff check .`, `uv run ruff format --check .`,
  `uv run mypy snowflake scripts`, `uv run pytest`, `sqlfluff lint snowflake/`.
- **Evidence:** 35 Python tests pass. Ruff, mypy, and SQLFluff complete with zero reported issues.
- **Decision/issue:** Native `AI_COMPLETE` stays primary. A live model contract gate chooses only a
  model that satisfies the structured-output contract. Groq is not configured.
- **Related commit:** `45cbfe7`
- **Rollback point:** Revert the Snowflake foundation slice before provisioning. No Consera
  Snowflake resource has been created yet.

## 2026-07-23: Product experience and access boundary

- **Goal:** Deliver the landing page, access gate, and five-surface intelligence workspace with a
  complete project create, review, activate, inspect, alert, and cited-question flow.
- **Files:** `apps/web/`, `apps/api/`, `packages/contracts/`, `packages/domain/`,
  `packages/fixture-data/`.
- **Commands:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`,
  `pnpm --filter @consera/web build`, `pnpm --filter @consera/web test:e2e`.
- **Evidence:** All static gates pass. Chromium reports 4 of 4 flows passing, including axe checks,
  desktop visual regression, the project review workflow, and 390 px mobile navigation.
- **Decision/issue:** The Worker exposes a fixed operation allowlist. The browser cannot submit SQL
  or Snowflake object names.
- **Related commit:** `7cc19bf`
- **Rollback point:** Revert the web, API, and shared-package slice. No public deployment exists.

## 2026-07-23: Brand, motion, and presentation system

- **Goal:** Create one consistent Consera identity across the product and repository while adding
  useful motion without visual noise.
- **Files:** `apps/web/app/globals.css`, `apps/web/components/`, `docs/assets/`, `README.md`.
- **Commands:** Browser inspection at 1440 by 900, hover-state inspection, reduced-motion review,
  SVG XML parsing, production build, and Playwright visual regression.
- **Evidence:** Landing, overview, hover states, mobile intelligence, banner, and architecture
  assets were rendered and inspected. The final motion build passes all frontend gates.
- **Decision/issue:** Hover motion uses transforms rather than padding changes, preventing layout
  shifts. Ambient motion is limited to signal and system-state motifs.
- **Related commit:** `7cc19bf`
- **Rollback point:** Revert the motion and brand asset slice without affecting intelligence logic.

## 2026-07-23: Cloudflare contract and dependency security

- **Goal:** Validate the Worker against the installed runtime and remove known production dependency
  vulnerabilities.
- **Files:** `apps/api/wrangler.jsonc`, `apps/api/worker-configuration.d.ts`,
  `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/web/package.json`, `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Commands:** `wrangler types`, `wrangler types --check`, `wrangler check startup`,
  `wrangler deploy --dry-run`, `pnpm audit --prod --audit-level high`, `pnpm build`.
- **Evidence:** Generated Worker bindings are current, local startup analysis completes, 63 static
  assets bundle successfully, and the production dependency audit reports no known vulnerabilities.
- **Decision/issue:** The compatibility date now matches the newest date supported by the installed
  runtime. Next.js is patched to 16.2.11 and `sharp` is resolved to 0.35.3.
- **Related commit:** `7cc19bf`
- **Rollback point:** Revert the platform-contract refresh. No Cloudflare resource was deployed.

## 2026-07-27: Cost-safe always-available release model

- **Goal:** Keep the public product continuously available without continuously waking Snowflake or
  consuming Workers KV operations.
- **Files:** `.github/workflows/hn-ingestion.yml`, `apps/api/`, `snowflake/bootstrap/`,
  `snowflake/migrations/`, `snowflake/procedures/`, `scripts/cloudflare_cost_guard.py`,
  `docs/cost-ledger.md`, `decision-log.md`.
- **Commands:** `wrangler types`, API unit and type checks, focused Snowpark tests, SQLFluff, and
  the Cloudflare cost guard.
- **Evidence:** The Worker has no KV, Durable Object, Queue, or Cron binding. Static requests bypass
  Worker code, ingestion is daily plus manual, warehouses auto-suspend after 60 seconds, the shared
  warehouse monitor is capped at 5 credits monthly, and AI reservations stop at 0.3 credits daily.
- **Live evidence:** `docs/evidence/live-pipeline-verification.json` records one 0.1-credit
  evaluation that published a cited verdict, recommendation, protective factor, and deterministic
  low-relevance suppression. The monitor reported 0 of 5 credits used when installed.
- **Decision/issue:** The former minute-level polling pattern was removed. A manual run now queues
  one idempotent Snowflake request and dispatches one fixed GitHub Actions workflow.
- **Related commit:** `7284b3b`
- **Rollback point:** Revert the cost-safe release slice before production deployment.

## 2026-07-27: Production release and live browser verification

- **Goal:** Publish Consera at its custom domain and verify the complete authenticated manual-run
  path against live Snowflake and GitHub Actions.
- **Files:** `apps/web/e2e/production.spec.ts`, `apps/web/playwright.production.config.ts`,
  `packages/contracts/`, `snowflake/migrations/V002__application_contract.sql`,
  `docs/evidence/production-release-verification.json`.
- **Commands:** Next.js production build, Wrangler deploy, production Playwright Chromium, axe,
  GitHub workflow status polling, and sanitized Snowflake state checks.
- **Evidence:** `docs/evidence/production-release-verification.json` records the passing landing,
  access gate, live workspace, manual dispatch, accessibility, triggered-task, and cost-boundary
  checks. The real production browser gate completed in 12.5 seconds.
- **Decision/issue:** Live contract validation exposed timezone offsets, one non-absolute public
  source URL, and a mismatched contribution score type. The contracts now admit explicit ISO
  offsets, the secure view nulls invalid source URLs, and verdicts aggregate relevance
  contributions.
- **Related commit:** `3efb3f0`
- **Rollback point:** Roll back the latest Cloudflare Worker version and revert this release slice.

## 2026-07-27: Public judge workspace

- **Goal:** Remove the access-code prompt so judges can enter the live workspace directly while
  retaining signed browser sessions, exact-origin checks, and CSRF protection for mutations.
- **Files:** `apps/api/`, `apps/web/`, `README.md`, `docs/architecture.md`, `docs/security.md`,
  `docs/limitations.md`, `docs/evidence/public-judge-access-verification.json`.
- **Commands:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `wrangler types --check`, the Cloudflare cost guard, local Playwright Chromium, Wrangler deploy,
  and production Playwright Chromium.
- **Evidence:** `docs/evidence/public-judge-access-verification.json` records a direct public
  workspace load, the absent access-code prompt, a passing live Snowflake workspace, a passing
  manual dispatch, zero Cloudflare KV or scheduled bindings, and retained origin and CSRF checks.
  The production browser gate passed in 12.4 seconds.
- **Decision/issue:** The signed session now protects request integrity rather than identity. The
  retired access-code verifier, UI, local artifact, and two obsolete Cloudflare secrets were
  removed.
- **Related commit:** `d4902c3`
- **Rollback point:** Revert `d4902c3`, restore the retired secret values through Wrangler, and
  deploy the preceding Worker release.

## 2026-07-27: Submission-readiness audit and cost-monitor hardening

- **Goal:** Audit Consera against the controlling contest rules, provide a complete acceptance and
  demonstration route, and prevent optional warehouse acceleration or bootstrap reruns from
  weakening the five-credit cost boundary.
- **Files:** `README.md`, `snowflake/bootstrap/00_account_resources.sql`,
  `docs/ACCEPTANCE_TEST_GUIDE.md`, `docs/HACKATHON_COMPLIANCE.md`, `docs/DEMO_VIDEO_SCRIPT.md`,
  `docs/cost-ledger.md`, `docs/data-license.md`, and `docs/source-register.md`.
- **Commands:** All TypeScript and Python format, lint, type, test, build, SQLFluff, local
  Playwright Chromium, axe, visual-regression, and Cloudflare cost gates; Snowflake service
  connection checks; a live production browser preflight.
- **Evidence:** 22 TypeScript tests, 45 Python tests, four local Chromium journeys, the static
  Next.js and Worker builds, SQLFluff, and the zero-binding cost guard pass. The official Terms and
  event rubric are mapped to repository and human submission evidence.
- **Decision/issue:** AI-Native Data Application is the primary track. Query acceleration is
  explicitly disabled, monitor restarts are no longer embedded in repeat bootstrap alteration, and
  future bootstrap runs grant only scoped monitor management to the Consera admin role. The live
  preflight found the existing five-credit allowance exhausted, so the workspace and the required
  successful Cortex Code artifact remain release blockers. Neither was reported as passing.
- **Related commits:** `abffff5`, `0b0fa83`
- **Rollback point:** Revert `0b0fa83` to remove the submission kit. Revert `abffff5` only if the
  prior Snowflake bootstrap behavior is intentionally restored.

## 2026-07-31: Quiet scheduled budget boundary

- **Goal:** Stop an intentional Snowflake resource-monitor pause from producing repeated scheduled
  GitHub failure notifications while preserving real failure visibility.
- **Files:** `.github/workflows/hn-ingestion.yml`, `bridges/hn_bridge/main.py`,
  `bridges/hn_bridge/upload.py`, and bridge tests.
- **Commands:** Ruff, full mypy, all bridge tests, staged whitespace validation, remote push, and
  GitHub Actions API history inspection.
- **Evidence:** Ten bridge tests pass. Error 090073 is the only condition classified as an
  intentional budget pause. Authentication, configuration, source, schema, and other Snowflake
  failures remain errors. Checkout and uv setup use current Node 24-compatible releases pinned to
  full commit SHAs.
- **Decision/issue:** A scheduled budget pause exits successfully with a sanitized `PAUSED_BUDGET`
  summary because retrying cannot change the weekly quota. The same state remains nonzero for a
  manual run so an operator request is never presented as completed live work.
- **Related commit:** `f88ee5b`
- **Rollback point:** Revert `f88ee5b` to restore the former failure behavior and action versions.

## 2026-07-31: Cost-safe task graph and AI Observatory

- **Goal:** Replace the feedback-prone state-stream tasks, isolate warehouse budgets, and focus the
  release on one broad AI intelligence project.
- **Files:** `snowflake/migrations/V005__cost_safe_task_graph.sql`,
  `snowflake/operations/recover_cost_boundaries.sql`, Snowpark procedures, `scripts/migrate.py`,
  `scripts/seed_ai_observatory.py`, `scripts/live_release_audit.py`, and the AI Observatory fixture.
- **Commands:** Owner-approved resource-monitor recovery, immutable migration runner, AI Observatory
  seed, one production manual dispatch, the delayed daily schedule, and the live release audit.
- **Evidence:** `docs/evidence/release-reliability-verification.json` records one active
  Observatory, V005 applied, four append-only streams, all four tasks started, two complete graph
  runs, zero task failures, zero current-project queue failures, and zero delivery failures. One
  genuine active-project alert and one genuine email delivery reached `SENT`.
- **Decision/issue:** The three warehouses now have independent one-credit weekly monitors. A
  Snowflake no-data trigger recheck is recorded as `SKIPPED`; it invokes no child task and is
  excluded from successful-run multiplicity without hiding failures. Archived terminal jobs remain
  immutable history but cannot degrade the active project.
- **Related commits:** `4150e3b`, `dc2dbc5`
- **Rollback point:** Suspend the task graph, revert `dc2dbc5`, and restore the preceding task
  definitions only if the historical feedback topology is intentionally required.

## 2026-07-31: Resilient public workspace and release breakers

- **Goal:** Keep the public experience available without Workers KV polling or repeated Snowflake
  reads, and make release regressions fail before deployment.
- **Files:** `apps/api/src/workspace-cache.ts`, the consolidated Snowflake workspace client,
  `apps/api/src/snapshot/workspace.json`, console surfaces, shared contracts,
  `.github/workflows/ci.yml`, and `scripts/reliability_audit.py`.
- **Commands:** Full TypeScript and Python format, lint, type, and test gates; SQLFluff; Cloudflare
  binding type generation; production build; local Chromium, axe, visual regression; dependency
  audit; live snapshot export; and the release reliability audit.
- **Evidence:** 29 TypeScript tests, 57 Python tests, four local browser journeys, the static
  Next.js export, the Worker dry run, and the release audit pass. The deployed snapshot contains one
  project, 100 bounded signals, one verdict, and one alert and remains below the one-megabyte guard.
- **Decision/issue:** One workspace request replaces four Snowflake reads. The state-free Cache API
  serves fresh data for 15 minutes, retains the last known good result for seven days, coalesces
  same-isolate refreshes, and falls back to a real deployed snapshot. No KV, Queue, Durable Object,
  or Cloudflare Cron binding exists.
- **Related commits:** `1073264`, `a45a274`
- **Rollback point:** Revert `1073264` to restore uncached workspace reads. Revert `a45a274` only if
  the cross-layer release breakers are deliberately removed.

## 2026-07-31: Cortex Code release challenge

- **Goal:** Use Cortex Code for a meaningful Snowflake-specific challenge before public deployment.
- **Files:** `snowflake/migrations/V006__profile_task_guards.sql`, `scripts/live_release_audit.py`,
  `scripts/reliability_audit.py`, `docs/evidence/cortex-cost-task-review.md`, and
  `docs/COCO_USAGE_LOG.md`.
- **Commands:** Official Cortex Code update, cached-owner read-only review, immutable migration
  runner, focused Python and SQL gates, and live release audit.
- **Evidence:** The sanitized Cortex review records every accepted, changed, and rejected
  recommendation. V006 is applied and recorded, the profile task is started with `NO_OVERLAP`, and
  the live audit passes.
- **Decision/issue:** The service JWT connection remains incompatible with Cortex Code v1.1.52, but
  the already-cached owner OAuth token completed the review without another login. Recommendations
  that would hide source-global failures, terminalize valid deferred work, or reset a quota window
  were rejected with product evidence.
- **Related commit:** `d3db0dc`
- **Rollback point:** Revert `d3db0dc` only if the profile task's explicit cost and retry guards are
  intentionally removed.

## 2026-07-31: Production contract recovery

- **Goal:** Deploy the consolidated workspace and prove that both live and fallback data satisfy the
  public contract with a real sent alert.
- **Files:** `snowflake/migrations/V007__normalize_alert_nulls.sql`,
  `apps/api/src/workspace-cache.test.ts`, `apps/api/src/snapshot/workspace.json`,
  `scripts/live_release_audit.py`, and `docs/evidence/production-cost-safe-release.json`.
- **Commands:** Immutable V007 migration, live snapshot export, full TypeScript, Python, SQL, build,
  and reliability gates, Wrangler production deployment, and read-only Chromium plus axe audit.
- **Evidence:** The first production audit exposed a literal `"None"` suppression reason in the real
  sent alert. A regression test failed on that exact snapshot. V007 normalizes historical
  Python-style null text at the secure-view boundary, the same test then passes, and the final
  production audit records zero accessibility violations, one active project, 100 bounded signals,
  one verdict, one alert, and two consecutive edge-cache responses.
- **Decision/issue:** Live and deployed fallback data must be parsed by the same shared Zod
  contract. A fallback is not considered valid merely because it was exported successfully.
- **Related commit:** `9f8d651`
- **Rollback point:** Revert `9f8d651` only if sent alerts can again emit a valid JSON null through
  a different immutable migration and the snapshot-contract regression remains.

## 2026-07-31: Cross-Windows visual stability and final release

- **Goal:** Make visual regression deterministic across local and GitHub Windows builds, preserve
  reduced-motion accessibility, and publish the exact green asset build.
- **Files:** `apps/web/playwright.config.ts`, `apps/web/e2e/consera.spec.ts`, the mobile golden,
  `apps/web/components/landing-page.tsx`, `apps/web/components/console/consera-console.tsx`, and
  `docs/evidence/production-cost-safe-release.json`.
- **Commands:** Authenticated GitHub Actions log inspection, local Chromium, golden regeneration,
  full TypeScript gates, GitHub `Quality gates`, fresh production build, Wrangler deployment, and
  read-only normal plus reduced-motion Chromium audits.
- **Evidence:** GitHub Actions run `30612243370` passes every locked dependency, TypeScript, Python,
  SQL, build, cost, reliability, Chromium, axe, and visual step. The production evidence records
  zero accessibility violations, zero browser console errors, correct reduced-motion hydration, one
  active project, 100 signals, one verdict, one alert, and two edge-cache responses.
- **Decision/issue:** Cross-Windows font rasterization uses a four-percent pixel tolerance. The
  mobile golden uses a fixed 390 by 2000 canvas so operating-system font metrics cannot change image
  dimensions. Functional, text, interaction, and accessibility assertions remain exact.
- **Related commits:** `010a301`, `7fd1c92`
- **Rollback point:** Revert these commits only if the replacement visual runner provides identical
  pinned font and rendering metrics while retaining reduced-motion coverage.

## 2026-08-03: Private judging access and illustrated onboarding

- **Goal:** Protect live judging resources with a clear four-digit invitation gate while keeping the
  browser experience trusted, accessible, cost bounded, and simple for first-time reviewers.
- **Files:** The Hono access middleware and session helpers, Cloudflare binding contract, static
  access screen, console logout and Markdown upload controls, browser and API regression tests,
  security and architecture ledgers, and `guide/` with eight verified interface screenshots.
- **Commands:** Full Prettier, ESLint, TypeScript, Vitest, Ruff, Mypy, Pytest, SQLFluff, Cloudflare
  binding, production build, zero-metered-state, reliability, Chromium, axe, mobile, visual, TLS,
  deployment dry-run, production deployment, and authenticated production browser gates.
- **Evidence:** 36 TypeScript tests, 57 Python tests, five local Chromium journeys, one read-only
  production Chromium journey, zero axe violations, no passkey match in repository content, a
  trusted TLS 1.3 certificate, HTTP 308 upgrade, two-year HSTS, and deployment version
  `7626201b-57a6-4304-9f94-f51e4fb95c75`. The sanitized machine-readable record is
  `docs/evidence/private-judge-access-verification.json`.
- **Decision/issue:** The passkey remains only in an encrypted Worker secret. Protected documents
  and APIs run through the Worker, while immutable assets remain direct. Attempts are rate limited
  without KV and rejected attempts never wake Snowflake. A production-only immutable-header fault
  and an incompatible hydration CSP were reproduced, corrected, and covered before release.
- **Related commit:** `8042fe1`
- **Rollback point:** Revert `8042fe1`, remove the access secret and rate-limit bindings, then
  redeploy only if invitation-level access is deliberately retired.
