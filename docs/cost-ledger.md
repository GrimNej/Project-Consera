# Cost Ledger

| Component                  | Cost boundary                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| Snowflake warehouses       | X-Small, 60-second auto-suspend, shared Consera resource monitor |
| Snowflake Cortex AI        | Application reservation before every call, 2 credits per day     |
| GitHub Actions bridge      | Standard free runner, one bounded job every five minutes         |
| Cloudflare Worker          | Free offering, static assets plus a small API boundary           |
| Public source              | Official Hacker News Firebase API, no paid scraper               |
| Email                      | Snowflake verified-recipient notification integration            |
| Third-party model fallback | Disabled unless the native model gate fails                      |

The resource monitor warns at 55 and 70 percent of a 40-credit monthly Consera quota and suspends
Consera warehouses at 80 percent. This does not replace the application AI ledger because warehouse
and managed AI accounting are different cost surfaces.

No payment method or paid fallback is part of the release.
