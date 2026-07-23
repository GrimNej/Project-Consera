# Architecture

Consera is a Snowflake-native, evidence-bound, silence-first project intelligence system.

## Runtime boundary

The statically exported Next.js frontend is served from Cloudflare Worker assets. The Hono Worker
handles only authentication, request validation, response validation, and a fixed set of Snowflake
SQL API operations. Browser input cannot select SQL, roles, databases, warehouses, schemas, views,
or procedures.

Two independent Snowflake service identities are used:

- the application identity can read approved secure views and call approved application procedures;
- the ingestion identity can call the Hacker News batch admission procedure.

Neither identity can assume the Consera administration role.

## Authoritative control plane

Snowflake standard tables hold project documents, profile versions, signals, evidence, evaluation
jobs, verdicts, alert decisions, deliveries, AI usage, activity, configuration, and audit state. An
internal stage holds one reproducible Snowpark bundle.

Streams and triggered tasks form the pipeline:

```text
project document -> profile extraction -> human review -> active profile

Hacker News batch -> normalization -> lexical candidate gate
                  -> fenced deep analysis -> deterministic publication policy
                  -> alert decision -> ambiguity-safe email delivery
```

All AI calls reserve budget first, use an exact structured-output schema, reconcile token usage, and
fail closed when their envelope or evidence references are invalid.

## Failure behavior

- Invalid project text is rejected before persistence.
- Invalid public-source items reject the batch transaction.
- Budget exhaustion defers work without consuming a provider attempt.
- Ambiguous AI outcomes are charged pessimistically.
- Ambiguous email outcomes enter `DELIVERY_UNKNOWN` and are not retried blindly.
- Stale profile activation loses a compare-and-set transition.
- Uncertain verdicts are quarantined or published without an alert.
