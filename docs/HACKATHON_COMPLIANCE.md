# Snowflake CoCo CLI Hackathon Compliance

Status date: July 27, 2026.

The controlling sources are the [official event page](https://hack2skill.com/event/cococlihack/) and
the
[official Terms and Conditions](https://docs.google.com/document/d/e/2PACX-1vQ0RB2XJB3MuE_dZbroHkqlicLD2O_Y3FaGgj03JwkC6_dhUfRqi4az-Teb62S43km27dg9YlMarOD6/pub).
If the microsite and Terms conflict, this checklist follows the Terms.

## Submission position

- **Primary track:** AI-Native Data Application
- **Supporting capabilities:** Intelligent Workflow Automation Agent and Unstructured Data
  Intelligence System
- **Submission-safe deadline:** August 2, 2026 at 11:59 PM IST
- **Team:** One to four eligible participants
- **Language:** English
- **Entry count:** Consera must be the only entry submitted by this participant or team

Consera fits the AI-Native track because it is a complete product where natural-language
interaction, evidence-bound summaries, consequence recommendations, and a low-friction experience
are supported by a real Snowflake data application. It is not submitted as a generic chatbot or a
dashboard.

## Rubric alignment

| Criterion             | Weight | Consera evidence                                                                                                                                                                   |
| --------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real-world relevance  |    30% | Reduces technology-change overload and alerts only when a public signal materially affects a reviewed project                                                                      |
| Technical execution   |    40% | Snowpark Python, standard tables, Streams, triggered Tasks, Cortex `AI_COMPLETE`, deterministic policy, key-pair SQL API, email, idempotency, tests, and bounded costs             |
| Solution completeness |    30% | Public landing page, project onboarding, human profile review, live ingestion, consequence dossiers, silence ledger, email actions, cited questions, documentation, and deployment |

## Requirement audit

| Requirement                                | Status                 | Evidence or remaining action                                                                             |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Responds to one official problem statement | Pass                   | AI-Native Data Application is the primary track                                                          |
| Uses Cortex Code CLI meaningfully          | Blocked before freeze  | Attempts are honestly logged, but one successful sanitized planning or review artifact is still required |
| Uses Python, Java, or Scala                | Pass                   | Python 3.11 Snowpark procedures and ingestion bridge                                                     |
| Uses Snowflake                             | Pass                   | Snowflake is the authoritative store and intelligence control plane                                      |
| Complete working prototype                 | Conditional            | Product is deployed; live workspace must be healthy after the resource-monitor recovery                  |
| Snowpark consideration                     | Pass                   | Snowpark Python procedures implement extraction and intelligence                                         |
| Source code accessible                     | Pass                   | Public GitHub repository with architecture and operating documentation                                   |
| Deployment accessible                      | Pass                   | Public custom domain, with no access-code gate                                                           |
| Presentation materials                     | Open                   | Create and upload the final deck                                                                         |
| Video link                                 | Open                   | Record the script in `DEMO_VIDEO_SCRIPT.md`, upload it, and test anonymous playback                      |
| Dataset and API rights disclosed           | Pass                   | See `data-license.md` and `source-register.md`                                                           |
| Original work and accurate claims          | Owner confirmation     | Confirm team authorship and remove any claim that was not directly verified                              |
| No confidential or unauthorized material   | Pass with final review | Secret screening, no bundled credentials, and a final repository scan are required                       |
| Sponsor intellectual property              | Pass with final review | No copied Snowflake logo asset is bundled; retain only necessary technical product-name references       |
| Participant profile complete               | Owner action           | Complete name, email, phone, country, and other Innovator Dashboard fields                               |
| Eligibility                                | Owner action           | Confirm age 18+, eligible residence, one-to-four-person team, and no excluded relationship               |
| One entry only                             | Owner action           | Do not submit Ripple or another entry for the same participant or team                                   |
| Exact portal format                        | Owner action           | Inspect the Innovator Dashboard template and mirror every required field                                 |

## Platform proof that must appear in the submission

Show enough evidence that Snowflake is the product core rather than a remote database:

1. A project document enters a reviewed, versioned Snowflake profile.
2. Hacker News data lands once through the bounded bridge.
3. Streams and triggered Tasks advance the deterministic workflow.
4. Cortex produces structured advisory analysis within a fixed schema and budget.
5. Deterministic policy owns publication and email.
6. Secure application views and allowlisted procedures reach the Worker through key-pair SQL API.
7. A successful Cortex Code CLI review visibly influenced one Snowflake artifact.

Do not expose the Snowflake account locator, usernames, query IDs, session IDs, email addresses,
keys, or raw private source text.

## Submission package

- Public GitHub repository at the final tagged commit
- Public deployment at `https://consera.grimnej.com`
- English idea summary and problem statement
- Architecture and Snowflake services list
- Presentation deck
- Publicly playable demo video link
- Dataset/API register and licences
- Successful sanitized Cortex Code artifact and usage log
- Test evidence and known limitations
- Complete participant and team profile

## Final freeze procedure

1. Finish the Cortex Code artifact and resolve every open row above.
2. Run every command in `ACCEPTANCE_TEST_GUIDE.md`.
3. Run one cost-bounded live rehearsal and verify one real email receipt.
4. Record the demo against the same commit that will be submitted.
5. Scan the repository and video for secrets and identifiers.
6. Tag the release and preserve the commit SHA.
7. Test the repository, deployment, deck, and video links in a private browser window.
8. Submit before August 2, 2026 at 11:59 PM IST.
9. Save the confirmation page and submission timestamp.

The preliminary video does not remove the need to prepare for a live virtual finalist demonstration.
Keep the same five-minute route rehearsed and maintain a static screenshot fallback for a temporary
external-service outage.
