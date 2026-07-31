# Consera Acceptance Test Guide

This guide separates free, repeatable engineering checks from live checks that can wake Snowflake or
dispatch GitHub Actions. Run the local suite freely. Run the complete live rehearsal once after
meaningful releases and once before recording.

## 1. Automated release gates

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
uv sync --frozen

pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @consera/web test:e2e

uv run ruff check .
uv run ruff format --check .
uv run mypy snowflake bridges scripts
uv run pytest
uv run sqlfluff lint snowflake/
uv run python scripts/cloudflare_cost_guard.py
uv run python -m scripts.reliability_audit
```

Expected result:

- Every command exits with code 0 and no warning is accepted as a pass.
- Unit and integration tests pass.
- Four Chromium journeys pass, including axe accessibility and visual comparison.
- The cost guard confirms there is no Workers KV, Durable Object, Queue, or Cloudflare Cron binding.
- The production build creates the static Next.js product and the narrow Hono Worker.

The browser suite uses explicit fixture mode. It never presents fixture results as live evidence.

## 2. Local product walkthrough

```powershell
$env:NEXT_PUBLIC_CONSERA_FIXTURE_MODE = "true"
pnpm --filter @consera/web dev
```

Open the URL printed by Next.js. Verify:

1. The landing page explains the problem before the architecture.
2. `Open Consera` enters the workspace without an access code.
3. Overview, Projects, Intelligence, Alerts, and Ask Consera are usable by keyboard.
4. At 390 px width, navigation, cards, filters, dialogs, and evidence links remain readable.
5. Reduced-motion mode removes nonessential animation.

## 3. Live preflight

Run the bounded live metadata and aggregate-state audit once:

```powershell
uv run python -m scripts.live_release_audit `
  --connection CONSERA_ADMIN_AUTOMATION
```

The command must report `Consera live release audit passed`. Its sanitized evidence verifies three
isolated one-credit weekly monitors, X-Small warehouses, 60-second auto-suspend, append-only
streams, the non-retriggering task graph, V005 migration state, exactly one active project, queue
health, recent task multiplicity, and delivery health.

Open [consera.grimnej.com](https://consera.grimnej.com), then select `Open Consera`.

Pass conditions:

- The workspace opens immediately from a validated edge response or deployed snapshot. A cold live
  refresh can continue in the background.
- Overview shows project, signal, verdict, alert, and AI-budget state.
- The synchronization label states whether the response is live, edge-cached, or a timestamped
  last-known view.
- No access-code prompt appears.

If the landing page works but the workspace reports that Snowflake could not complete the request,
stop the rehearsal. Check the Consera resource monitor before retrying. Repeated refreshes will not
repair a suspended warehouse.

## 4. Reviewed project scenario

Open Projects and select `AI Change Observatory`.

Expected result:

1. Exactly one active project is visible in the judging workspace.
2. Its reviewed profile covers models, APIs, agents, inference, developer tooling, open-source
   alternatives, RAG, vector search, evaluation, security, policy, licensing, and pricing.
3. The project shows an immutable active profile version and its monitored topics.
4. No profile draft or archived historical project appears as active.

The create, secret-screen, extraction, review, and compare-and-set activation paths remain covered
by automated tests. Do not create another live project during routine judging because profile
extraction consumes a bounded AI reservation and would weaken the focused demonstration.

## 5. Admission and safety scenario

Use the automated test suite for negative testing. It submits a synthetic document containing a
recognizable private-key header such as `-----BEGIN PRIVATE KEY-----`.

Expected result:

- Admission is rejected before extraction.
- No active project profile is created.
- The secret value is not echoed into application logs.

Never paste a real secret or run this mutation in the final judging workspace.

## 6. Live intelligence run

Open Intelligence and select `Check for new signals` once.

Expected immediate result:

- The button changes to `Run queued`.
- One idempotent GitHub Actions workflow is requested.

Expected eventual result:

- The latest-source time advances after the bounded workflow completes.
- New items enter Snowflake once even if delivery is retried.
- Irrelevant items remain hidden by default.
- `Show dismissed` reveals quietly rejected signals and their reason.
- A material candidate can produce a consequence dossier with relevance, impact, confidence, project
  context, suggested actions, protective factors, uncertainty, and source links.

A run that publishes no new dossier is a valid outcome when no new item clears the deterministic
policy. Consera's default behavior is silence, not manufactured activity.

## 7. Alerts and email

Open Alerts and exercise the `All`, `Sent`, and `Suppressed` filters.

Expected result:

- Every alert decision has a delivery state and timestamp.
- A suppressed decision explains why it stayed quiet.
- A qualifying dossier sends one evidence-linked email.
- The same project and consequence are deduplicated for 72 hours.
- No project can receive more than three alerts per day.

Do not promise that every manual run sends email. Email is evidence of a consequence clearing the
policy, not evidence that ingestion ran.

For the recorded demonstration, use only a real delivery that was produced by the active AI Change
Observatory project. If the current bounded run produces only suppression decisions, show that
honest outcome and use the previously verified real delivery as the email example.

## 8. Ask Consera

Select an active project and ask:

```text
What should this project investigate first, and what protects it from replacement pressure?
```

Expected result:

- The answer is scoped to the selected active project.
- External claims have stored evidence citations.
- Confidence and a suggested action are visible.
- Evidence links open their original source.

If the daily 0.3-credit application AI budget is exhausted, a budget-unavailable response is the
correct safe result. Do not raise the cap for a rehearsal.

## 9. Final quality checks

- Test Chrome at 1440 by 900 and a mobile viewport at 390 by 844.
- Navigate with Tab, Shift+Tab, Enter, Escape, and arrow keys where applicable.
- Verify visible focus, dialog focus containment, link destinations, empty states, loading states,
  and retry states.
- Confirm the browser console has no errors.
- Confirm no account identifiers, keys, tokens, raw prompts, or private project text appear in
  screenshots or recordings.
- Confirm all Consera warehouses remain X-Small, use separate weekly monitors, disable query
  acceleration, and suspend after 60 seconds of inactivity.
- Confirm the task history has one landing, one evaluation, and one alert graph run per admitted
  batch, with no state-table retrigger loop.
- Confirm one daily schedule and one explicit manual dispatch are the only ingestion triggers.
- Record the commit SHA, deployment URL, test output, and rehearsal date.

## Release verdict

Call the release ready only when the automated gates pass, the live preflight is healthy, one manual
run completes, project review and activation work, cited Ask works within budget, the email path has
one verified receipt, and the human submission checklist in `HACKATHON_COMPLIANCE.md` is complete.
