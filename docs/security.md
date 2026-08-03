# Security Model

## Trust boundaries

Project documents, Hacker News content, article excerpts, operator questions, and model output are
untrusted. They are validated as data and never interpreted as instructions, SQL, object names, or
runtime configuration.

## Application controls

- Private four-digit review gate checked only against an encrypted Cloudflare secret
- Signed, eight-hour, HTTP-only sessions issued only after a successful gate check
- Local client and aggregate edge rate limits on access attempts
- Direct page and API authorization at the Worker, not a client-only visual lock
- CSRF tokens on mutations
- Exact origin enforcement
- Explicit HTTP-to-HTTPS redirect, HSTS, CSP, frame denial, and MIME sniffing protection
- Stateless signed sessions with no Workers KV session store
- Public read responses cached only after full Zod validation
- Timestamped read-only deployed snapshot when a cold edge cannot reach Snowflake
- Zod validation on every Worker request and response boundary
- Pydantic validation on public-source and model boundaries
- Fixed Snowflake statements and bindings
- Bounded upstream and downstream response sizes
- Sanitized error envelopes and query tags

The shared passkey limits the judging release to invited reviewers but does not identify individual
people. The signed session proves successful access and protects request integrity. It is not an
enterprise identity or account-management system.

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

The edge cache and deployed snapshot contain only the same public read model shown to judges.
Mutations, source documents, profile drafts, prompts, secrets, account metadata, and private
delivery details are never stored in either fallback.
