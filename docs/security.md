# Security Model

## Trust boundaries

Project documents, Hacker News content, article excerpts, operator questions, and model output are
untrusted. They are validated as data and never interpreted as instructions, SQL, object names, or
runtime configuration.

## Application controls

- Signed, short-lived, HTTP-only sessions
- Access-code verification through an HMAC-derived value
- CSRF tokens on mutations
- Exact origin enforcement
- Zod validation on every Worker request and response boundary
- Pydantic validation on public-source and model boundaries
- Fixed Snowflake statements and bindings
- Bounded upstream and downstream response sizes
- Sanitized error envelopes and query tags

## Snowflake controls

- Consera-only roles, users, warehouses, database, schemas, stage, tasks, integration, and monitor
- Independent key pairs for application and ingestion identities
- Owner-executed procedures behind narrow `USAGE` grants
- Secure views for product read models
- Fenced leases and compare-and-set state transitions
- Server-owned score, completeness, publication, and alert policy
- No arbitrary outbound Snowflake access

## Secret handling

Private keys, access codes, account identifiers, verified recipient addresses, and signing keys stay
in ignored local artifacts, GitHub Secrets, Cloudflare secrets, or Snowflake metadata. They are
never committed or written to product logs.
