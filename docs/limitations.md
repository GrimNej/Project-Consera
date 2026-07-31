# Product Limitations

- P0 monitors the official Hacker News source, not the entire internet.
- Consequence verdicts are evidence-bound assessments, not predictions or autonomous business
  decisions.
- Email delivery depends on Snowflake notification availability and verified recipients.
- The daily GitHub Actions ingestion may run later than 03:17 UTC.
- Manual checks depend on GitHub Actions availability and can take several minutes to finish.
- Cloudflare Cache API entries are local to a data center. A cold location uses live Snowflake or
  the visibly labeled deployed snapshot.
- A deployed snapshot is read-only and can be older than the current Snowflake state. The interface
  always shows its synchronization time and never presents it as a live mutation path.
- Project onboarding accepts UTF-8 Markdown or plain text up to 200 KB.
- The judging release intentionally has no identity or access-code gate. Anyone with its URL can use
  the allowlisted product operations, subject to the same origin, CSRF, workload, and cost controls.
- The initial release does not claim enterprise organization administration.
