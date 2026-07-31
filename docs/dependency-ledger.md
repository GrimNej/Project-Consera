# Dependency Ledger

Every direct dependency is pinned in `pnpm-lock.yaml` or `uv.lock`.

## Product runtime

| Dependency                   | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| Next.js 16.2.11 and React 19 | Static product experience                   |
| Hono                         | Cloudflare Worker routing                   |
| Zod                          | Worker and browser boundary validation      |
| Motion                       | Accessible product transitions              |
| Lucide React                 | Consistent interface iconography            |
| Pydantic                     | Python and model-output boundary validation |
| Snowpark Python              | Snowflake-native pipeline procedures        |
| Snowflake Python Connector   | Migration and ingestion service connections |
| HTTPX                        | Bounded official Hacker News requests       |
| cryptography                 | Independent RSA key generation              |

## Verification

TypeScript, ESLint, Prettier, Vitest, Playwright, axe, Ruff, mypy, pytest, Hypothesis, and SQLFluff
form the zero-warning local gate.

No runtime dependency is loaded from a CDN.

`sharp` is resolved to 0.35.3 across Next.js and Wrangler to avoid the vulnerable inherited libvips
range. Wrangler owns the generated Worker runtime declarations, so the older direct
`@cloudflare/workers-types` package is not part of the application lock.

Wrangler remains pinned at 4.112.0 with compatibility date 2026-07-21. A newer release was rejected
during the 2026-07-31 audit because it was inside the repository's dependency minimum-age window and
would have required explicit supply-chain exceptions.

`pnpm audit --prod --audit-level high` reports no known vulnerabilities on 2026-07-31.
