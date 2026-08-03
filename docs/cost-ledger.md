# Cost Ledger

| Component                  | Cost boundary                                                                 |
| -------------------------- | ----------------------------------------------------------------------------- |
| Ingestion warehouse        | X-Small, 60-second auto-suspend, 1 credit per week                            |
| Pipeline warehouse         | X-Small, 60-second auto-suspend, 1 credit per week                            |
| Application warehouse      | X-Small, 60-second auto-suspend, 1 credit per week                            |
| Query acceleration         | Explicitly disabled on every Consera warehouse                                |
| Snowflake Cortex AI        | Reservation before every call, hard maximum of 0.3 credits per day            |
| GitHub Actions bridge      | One bounded daily job plus explicit manual dispatches                         |
| Cloudflare Worker          | Static assets, signed sessions, free rate-limit bindings, no persistent store |
| Public source              | Official Hacker News Firebase API, no paid scraper                            |
| Email                      | Snowflake verified-recipient notification integration                         |
| Third-party model fallback | Disabled unless the native model gate fails                                   |

Each warehouse has its own weekly monitor. This prevents ingestion, pipeline, or public browsing
from suspending the other two paths. Every monitor warns at 60 percent, suspends at 85 percent, and
suspends immediately at 100 percent. Snowflake rejected a fractional quota in the live trial
account, so 1 credit per week is the smallest verified boundary for each warehouse.

Across nine weeks, the warehouse planning envelope is 27 credits. The independent AI circuit breaker
can reserve at most 18 estimated credits across 60 days. The combined protected planning envelope is
45 credits, before normal early auto-suspend and cache savings. Snowflake resource monitors are not
precise metering instruments, so bounded task timeouts and non-overlap remain necessary to limit any
in-flight work near a threshold. This design leaves more than 250 credits of the reported remaining
trial balance outside the planning envelope.

The public site has no Cloudflare Cron trigger. Its static assets stay available while Snowflake
sleeps. One consolidated workspace response is fresh at the edge for 15 minutes and retained for up
to seven days. A deployed, real Snowflake snapshot protects a cold edge location when live Snowflake
is unavailable. Protected HTML navigation and API requests invoke the Worker, while immutable
scripts, fonts, and styles remain direct static assets. Passkey checks use no KV operation and never
wake Snowflake. GitHub Actions starts one bounded ingestion at 03:17 UTC each day. A judge can
dispatch the same bounded workflow from the Intelligence screen.

If the scheduled ingestion monitor reaches its weekly ceiling, the bridge records `PAUSED_BUDGET`,
writes no batch, and ends without generating a repeated GitHub failure notification. A manual run
still reports a failure in that state because an operator explicitly requested live work.

No payment method or paid fallback is part of the release.

## Current recovery status

The former shared five-credit monitor is exhausted and remains untouched for audit history. The
reviewed recovery was applied on 2026-07-31. Three new weekly monitors now protect the three Consera
warehouses independently, with 1.00 unused credit visible on each monitor immediately after
provisioning. All three warehouses were verified suspended, X-Small, set to 60-second auto-suspend,
and configured with Query Acceleration disabled. The recovery created no unmonitored warehouse,
changed no billing setting, and touched no Ripple resource.
