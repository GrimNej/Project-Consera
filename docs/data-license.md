# Data Licence and Source Use

## Hacker News

Consera reads the [documented public Hacker News Firebase API](https://github.com/HackerNews/API).
The official API documentation and example code are published under the MIT License. Hacker News
items and linked articles remain content from their respective authors and publishers. Every stored
signal preserves the canonical Hacker News discussion URL and the linked source URL when present.
Raw batch data is retained for 14 days, normalized signals for 30 days, and published evidence
excerpts for up to 90 days.

Consera does not republish full articles. It stores bounded excerpts only when needed to support a
material claim and links to the original source. The ingestion bridge reads only the documented API
fields and does not crawl linked articles.

## Project documents

Project documents are supplied by the operator and used only to create reviewed project context.
They are limited to UTF-8 Markdown or plain text up to 200 KB and remain under the operator's
ownership.

## Generated analysis

Consequence dossiers are derived assessments. They preserve source attribution and do not change the
licence of the underlying source material.

## Service APIs

- GitHub Actions dispatches Consera's own bounded workflow. It is not used as a content dataset and
  remains subject to the
  [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
- Cloudflare Workers hosts the static product and its allowlisted API. Cloudflare is not a content
  source.
- Snowflake stores and evaluates authoritative application state. Snowflake services are not treated
  as external datasets.
