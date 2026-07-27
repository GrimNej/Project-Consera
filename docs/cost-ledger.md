# Cost Ledger

| Component                  | Cost boundary                                                   |
| -------------------------- | --------------------------------------------------------------- |
| Snowflake warehouses       | X-Small, 60-second auto-suspend, 5-credit monthly hard boundary |
| Snowflake Cortex AI        | Application reservation before every call, 0.3 credits per day  |
| GitHub Actions bridge      | One bounded daily job plus explicit manual dispatches           |
| Cloudflare Worker          | Static assets always available, dynamic API only on demand      |
| Public source              | Official Hacker News Firebase API, no paid scraper              |
| Email                      | Snowflake verified-recipient notification integration           |
| Third-party model fallback | Disabled unless the native model gate fails                     |

The resource monitor warns at 50 percent of a 5-credit monthly Consera quota, suspends Consera
warehouses at 80 percent, and suspends them immediately at 100 percent. Warehouse statements are
time bounded. Cortex is separately capped at three reserved calls per day because warehouse and
managed AI accounting are different cost surfaces.

The public site has no Cloudflare Cron trigger. Its static assets stay available while Snowflake
sleeps. GitHub Actions starts one bounded ingestion at 03:17 UTC each day. An authenticated operator
can dispatch the same bounded workflow from the Intelligence screen for a live demonstration.

No payment method or paid fallback is part of the release.
