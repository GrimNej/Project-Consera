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

Open [consera.grimnej.com](https://consera.grimnej.com), then select `Open Consera`.

Pass conditions:

- The workspace opens within 60 seconds after a cold Snowflake start.
- Overview shows project, signal, verdict, alert, and AI-budget state.
- `All systems nominal` appears.
- No access-code prompt appears.

If the landing page works but the workspace reports that Snowflake could not complete the request,
stop the rehearsal. Check the Consera resource monitor before retrying. Repeated refreshes will not
repair a suspended warehouse.

## 4. Real onboarding scenario

Open Projects, select `Add project`, name it `PatchPilot`, and paste:

```markdown
# PatchPilot

PatchPilot is an evidence-first AI code review assistant for small engineering teams. It reviews
GitHub pull requests, links every finding to changed code, and requires human approval before
suggesting a patch.

Users: maintainers and platform teams. Capabilities: pull-request risk analysis, dependency-change
review, cited recommendations. Stack: Python 3.11, Next.js, PostgreSQL, GitHub Actions, Cloudflare
Workers. Providers: GitHub API and a hosted language-model provider. Constraints: no autonomous
merges, no source retention outside the project, and a strict per-review inference budget.
Priorities: lower model cost, provider portability, GitHub API compatibility, and high precision.
Monitor: model pricing, coding-agent launches, GitHub API changes, dependency security, and
code-review competitors.
```

Confirm that the text contains no credentials, then select `Create reviewed context`.

Expected result:

1. The project is admitted and profile extraction begins.
2. A reviewable draft appears, usually within 20 to 90 seconds after a cold start.
3. The draft shows its exact source excerpt, summary, capabilities, differentiators, dependencies,
   providers, monitored topics, constraints, and completeness.
4. Edit one field to prove the human review boundary.
5. Select `Approve and begin monitoring`.
6. The project shows an active, versioned profile. It does not become authoritative before approval.

Do not repeat this scenario in production unless a fresh project is useful. It consumes a bounded AI
reservation.

## 5. Admission and safety scenario

Use the automated test suite for routine negative testing. For one live release check, attempt a
separate project containing a recognizable private-key header such as `-----BEGIN PRIVATE KEY-----`.

Expected result:

- Admission is rejected before extraction.
- No active project profile is created.
- The secret value is not echoed into application logs.

Never paste a real secret.

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
- Confirm all Consera warehouses suspend after 60 seconds of inactivity.
- Record the commit SHA, deployment URL, test output, and rehearsal date.

## Release verdict

Call the release ready only when the automated gates pass, the live preflight is healthy, one manual
run completes, project review and activation work, cited Ask works within budget, the email path has
one verified receipt, and the human submission checklist in `HACKATHON_COMPLIANCE.md` is complete.
