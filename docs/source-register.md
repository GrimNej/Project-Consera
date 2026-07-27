# Source Register

## Hacker News

- **Source:** [Official Hacker News Firebase API](https://github.com/HackerNews/API)
- **Fields:** Item identifiers, type, author handle, creation time, title, URL, parent, descendants,
  score, deleted/dead state, and bounded comment text
- **Licence:** Official API documentation and examples are MIT licensed. Item and linked-article
  content remains attributable to its respective author or publisher
- **Attribution:** Every published signal retains the original Hacker News discussion URL and the
  canonical linked source URL where available
- **Retention:** Raw landing data 14 days, selected normalized signals 30 days, published evidence
  excerpts up to 90 days
- **Acquisition:** A bounded, free GitHub Actions bridge. Snowflake performs no arbitrary outbound
  crawl

## Project documents

- **Source:** User-supplied UTF-8 Markdown or plain text, maximum 200 KB
- **Purpose:** Build an evidence-bound project profile after secret screening and human review
- **Retention:** Until replaced or deleted by the owner

## Snowflake Cortex

- **Purpose:** Structured extraction, bounded classification, consequence analysis, and cited
  synthesis
- **Authority boundary:** Cortex output is advisory. Deterministic validation owns publication,
  scores, and alerts
