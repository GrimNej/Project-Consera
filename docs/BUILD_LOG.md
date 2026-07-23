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
