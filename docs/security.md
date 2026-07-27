# Security Model

## Trust boundaries

Project documents, Hacker News content, article excerpts, operator questions, and model output are
untrusted. They are validated as data and never interpreted as instructions, SQL, object names, or
runtime configuration.

## Application controls

- Signed, short-lived, HTTP-only sessions
- Automatic browser-session issuance with no judge login gate
- CSRF tokens on mutations
- Exact origin enforcement
- Stateless signed sessions with no Workers KV session store
- Zod validation on every Worker request and response boundary
- Pydantic validation on public-source and model boundaries
- Fixed Snowflake statements and bindings
- Bounded upstream and downstream response sizes
- Sanitized error envelopes and query tags

The signed session protects request integrity and does not claim user identity. The judging release
is intentionally accessible to anyone who has its URL.

## Snowflake controls

- Consera-only roles, users, warehouses, database, schemas, stage, tasks, integration, and monitor
- Independent key pairs for release administration, application queries, and ingestion
- Owner-executed procedures behind narrow `USAGE` grants
- Secure views for product read models
- Fenced leases and compare-and-set state transitions
- Server-owned score, completeness, publication, and alert policy
- No arbitrary outbound Snowflake access

## Secret handling

Private keys, account identifiers, verified recipient addresses, and signing keys stay in ignored
local artifacts, GitHub Secrets, Cloudflare secrets, or Snowflake metadata. They are never committed
or written to product logs.
