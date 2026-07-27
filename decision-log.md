# Consera Decision Log

## D-001: Preserve the product thesis, replace the presentation runtime

**Decision:** Keep the blueprint's Snowflake-native, evidence-bound, silence-first intelligence
architecture. Serve a statically exported Next.js product through a small Hono Cloudflare Worker
instead of using Streamlit as the primary experience.

**Why:** The custom product surface provides substantially stronger visual quality, interaction
design, responsive behavior, and public presentation while Snowflake remains authoritative for
state, orchestration, intelligence, evidence, search, and notifications.

**Guardrail:** The Worker exposes only a fixed operation allowlist and cannot accept SQL, procedure
names, or object names from the browser.

## D-002: Give Consera a fully isolated platform namespace

**Decision:** Use `CONSERA` and `CONSERA_*` resources only. The existing Ripple and older Conseraa
projects are never runtime dependencies.

**Why:** This prevents role, warehouse, task, secret, route, and deployment collisions while still
allowing carefully reviewed source-level reuse.

## D-003: Build the brand from signal filtration

**Decision:** The Consera mark is a radar-like C whose incoming signal resolves into one consequence
node. The interface uses midnight black, electric cyan, neon mint, and cool white.

**Why:** The mark directly expresses the product promise and creates a coherent motif for the
frontend, loading states, README, architecture diagrams, and motion system.

## D-004: Prove native inference before considering a fallback

**Decision:** Run a live platform contract gate against an allowlist of native Snowflake models and
persist a model only after the structured-output contract passes. Groq remains an unconfigured,
last-resort fallback if native inference fails with measured evidence.

**Why:** This keeps the primary intelligence path Snowflake-native and avoids adding another secret,
provider boundary, and runtime dependency without a demonstrated need.

## D-005: Combine scheduled monitoring with an explicit manual trigger

**Decision:** Run one bounded GitHub Actions ingestion at 03:17 UTC daily and expose a
client-visible "Check for new signals" action that creates an idempotent request and dispatches the
same workflow.

**Why:** Scheduled monitoring supports unattended use. The manual trigger makes the system easy to
verify and demonstrate. The daily schedule keeps Snowflake asleep most of the time and avoids
pretending a long-held HTTP connection can replace polling for the official Hacker News source.

## D-006: Use motion to communicate state and affordance

**Decision:** Apply restrained motion to the signal radar, active navigation, buttons, cards,
filtration rows, project rows, and alert rows. Disable nonessential animation when the operating
system requests reduced motion.

**Why:** Motion should make interaction and system state easier to read. It must not compete with
the consequence itself or create layout movement.

## D-007: Keep Cloudflare runtime state-free

**Decision:** Serve the exported product through Cloudflare static assets and invoke the Worker only
for `/api/*`. Do not bind Workers KV, Durable Objects, Queues, or Cron Triggers.

**Why:** Consera already keeps authoritative state in Snowflake and uses signed browser sessions.
Another state layer would add cost, synchronization risk, and no product value. The release test
fails if a metered Cloudflare state binding or scheduled trigger is introduced.
