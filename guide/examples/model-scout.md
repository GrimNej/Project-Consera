# ModelScout

ModelScout helps small engineering teams compare hosted AI models before they change providers.

## Who it serves

- Engineering leads choosing a model provider
- Product teams that need predictable AI quality and cost

## Core capabilities

- Runs the same evaluation set across supported model providers
- Compares answer quality, latency, and estimated cost
- Keeps every provider change behind human review
- Produces an evidence-backed recommendation instead of changing production automatically

## Technology and providers

- Python services
- Snowflake for reviewed evaluation history and analytics
- Hosted language-model APIs from OpenAI, Anthropic, and Google
- GitHub Actions for scheduled evaluation jobs

## Constraints and risks

- The project has a strict monthly model budget
- Provider pricing and model availability can change
- A recommendation must cite an official announcement or technical source
- Customer prompts and credentials must never appear in evaluation logs

## Current priority

Identify model or provider releases that could improve quality or reduce cost without weakening
privacy, reliability, or human review.
