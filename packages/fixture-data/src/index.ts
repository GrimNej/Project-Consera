import {
  alertSchema,
  askResponseSchema,
  dashboardSchema,
  signalSchema,
  type Alert,
  type AskResponse,
  type Dashboard,
  type Signal,
} from "@consera/contracts";

const projectId = "0ef877cc-009c-4d3f-a845-0d3303c82937";
const verdictId = "88bd1a0e-4aa9-41d6-99a8-55d8c25e6db0";

const evidence = [
  {
    excerpt:
      "The provider introduced prompt caching discounts and a smaller low-latency model tier.",
    id: "evidence-official-0142",
    label: "Provider release notes",
    publishedAt: "2026-07-23T03:45:00.000Z",
    sourceKind: "OFFICIAL" as const,
    sourceUrl: "https://www.anthropic.com/news",
  },
  {
    excerpt:
      "Developers report lower median response time in agent loops that reuse long system context.",
    id: "evidence-hn-comment-6319",
    label: "Hacker News technical discussion",
    publishedAt: "2026-07-23T04:18:00.000Z",
    sourceKind: "HN_COMMENT" as const,
    sourceUrl: "https://news.ycombinator.com/",
  },
  {
    excerpt:
      "Provider abstraction and configurable model routing are listed as current project capabilities.",
    id: "evidence-project-0021",
    label: "Active project profile",
    publishedAt: null,
    sourceKind: "PROJECT" as const,
    sourceUrl: null,
  },
];

const topVerdict = {
  alertWorthiness: 0.82,
  confidence: 0.86,
  contributions: [
    {
      component: "Strategic relevance",
      explanation: "The change affects the project's primary model provider and unit economics.",
      rawValue: 0.91,
      weight: 0.3,
      weightedValue: 0.273,
    },
    {
      component: "Solution adjacency",
      explanation: "The new model tier can be evaluated without changing the product workflow.",
      rawValue: 0.82,
      weight: 0.25,
      weightedValue: 0.205,
    },
    {
      component: "Evidence quality",
      explanation: "An official release is supported by independent technical discussion.",
      rawValue: 0.88,
      weight: 0.1,
      weightedValue: 0.088,
    },
  ],
  createdAt: "2026-07-23T05:08:00.000Z",
  evidence,
  headline:
    "A lower-cost model tier could improve agent margins without weakening the core workflow",
  id: verdictId,
  impactPeak: 0.84,
  impactType: "PROVIDER_OPPORTUNITY" as const,
  opportunity: 0.84,
  projectId,
  projectName: "Northstar",
  protectiveFactors: [
    "The provider abstraction already isolates model-specific request formats.",
    "The differentiated review workflow is independent of the underlying model.",
  ],
  publishedAt: "2026-07-23T05:09:00.000Z",
  recommendations: [
    "Run the existing evaluation set against the new tier before routing production traffic.",
    "Compare cached and uncached cost per completed agent task for one week.",
  ],
  relevance: 0.9,
  replacementPressure: 0.32,
  signalId: "hn-44201831-v1",
  summary:
    "The provider change is more likely to improve Northstar's margins than threaten its product. Existing model routing reduces adoption effort, while the product's review workflow remains differentiated.",
  threat: 0.38,
  uncertainty:
    "Community latency reports use varied workloads. Consera cannot confirm performance for Northstar until its own evaluation set is run.",
  urgency: 0.71,
};

export const fixtureDashboard: Dashboard = dashboardSchema.parse({
  activities: [
    {
      detail: "1 project-specific consequence published",
      id: "activity-analysis-142",
      occurredAt: "2026-07-23T05:09:00.000Z",
      state: "SUCCESS",
      title: "Deep analysis completed",
    },
    {
      detail: "238 signals stayed below the materiality gate",
      id: "activity-suppression-774",
      occurredAt: "2026-07-23T05:07:00.000Z",
      state: "SUPPRESSED",
      title: "Noise suppressed",
    },
    {
      detail: "Official HN batch verified and merged without duplicates",
      id: "activity-ingestion-331",
      occurredAt: "2026-07-23T05:02:00.000Z",
      state: "SUCCESS",
      title: "Signal batch ingested",
    },
  ],
  alertsSent: 1,
  analyzedDeeply: 8,
  credits: {
    consumed: 18.4,
    reserve: 80,
    totalEnvelope: 320,
  },
  health: "HEALTHY",
  latestIngestionAt: "2026-07-23T05:02:00.000Z",
  projects: [
    {
      activeProfile: {
        capabilities: [
          "Repository-aware code generation",
          "Human-reviewed change plans",
          "Provider-neutral model routing",
        ],
        completeness: 0.92,
        constraints: ["Keep inference cost under $0.18 per completed task"],
        dependencies: ["Next.js", "Cloudflare Workers", "Snowflake"],
        differentiators: [
          "Every proposed code change includes a reviewable evidence trail",
          "Evaluation gates block unsupported edits",
        ],
        monitoredTopics: [
          "AI coding agents",
          "model pricing",
          "prompt caching",
          "developer tooling",
        ],
        projectId,
        providers: ["Anthropic", "Cloudflare", "Snowflake"],
        summary:
          "A repository-aware coding assistant that prepares evidence-backed changes for human review.",
        targetUsers: ["Software teams maintaining production applications"],
        version: 3,
      },
      alertsEnabled: true,
      createdAt: "2026-07-18T11:00:00.000Z",
      id: projectId,
      name: "Northstar",
      profileState: "ACTIVE",
      updatedAt: "2026-07-22T09:30:00.000Z",
      version: 4,
    },
    {
      activeProfile: null,
      alertsEnabled: false,
      createdAt: "2026-07-22T14:22:00.000Z",
      id: "734373f2-6fc5-4fbb-8c38-017a3f2b924c",
      name: "Ledgerlane",
      profileState: "REVIEW",
      updatedAt: "2026-07-23T02:11:00.000Z",
      version: 2,
    },
  ],
  signalsReviewed: 247,
  suppressed: 238,
  topVerdicts: [topVerdict],
});

export const fixtureSignals: Signal[] = signalSchema.array().parse([
  {
    deepAnalysisCount: 1,
    discoveredAt: "2026-07-23T03:50:00.000Z",
    discussionUrl: "https://news.ycombinator.com/",
    id: "hn-44201831-v1",
    points: 312,
    sourceUrl: "https://www.anthropic.com/news",
    state: "ANALYZED",
    title: "New model tier targets lower-latency agent workloads",
    topic: "Model providers",
  },
  {
    deepAnalysisCount: 0,
    discoveredAt: "2026-07-23T02:42:00.000Z",
    discussionUrl: "https://news.ycombinator.com/",
    id: "hn-44200112-v1",
    points: 188,
    sourceUrl: "https://example.com/database-release",
    state: "SUPPRESSED",
    title: "Embedded database adds vector indexing primitives",
    topic: "Data infrastructure",
  },
  {
    deepAnalysisCount: 1,
    discoveredAt: "2026-07-22T23:18:00.000Z",
    discussionUrl: "https://news.ycombinator.com/",
    id: "hn-44197225-v1",
    points: 96,
    sourceUrl: "https://example.com/agent-evaluation",
    state: "CANDIDATE",
    title: "A practical evaluation harness for long-running coding agents",
    topic: "Developer tooling",
  },
]);

export const fixtureAlerts: Alert[] = alertSchema.array().parse([
  {
    createdAt: "2026-07-23T05:10:00.000Z",
    deliveryState: "SENT",
    id: "b04544ef-3f4b-411d-8f18-9dc588138a12",
    projectId,
    projectName: "Northstar",
    suppressionReason: null,
    verdictHeadline: topVerdict.headline,
    verdictId,
    verdictType: "PROVIDER_OPPORTUNITY",
  },
  {
    createdAt: "2026-07-23T02:46:00.000Z",
    deliveryState: "SUPPRESSED",
    id: "78d02a8d-610a-43fb-b341-5354654789a5",
    projectId,
    projectName: "Northstar",
    suppressionReason: "LOW_RELEVANCE",
    verdictHeadline:
      "Embedded vector indexing does not materially affect the active project profile",
    verdictId: "cf9d4f08-0be9-4df4-b7e5-e57bc48ce0c4",
    verdictType: "STRATEGIC_WATCH",
  },
]);

export const fixtureAskResponse: AskResponse = askResponseSchema.parse({
  answer:
    "Northstar should investigate the new provider tier as a controlled cost opportunity. The active profile already includes provider-neutral routing, so the change can be evaluated without altering the product's core workflow. The strongest protection against replacement remains Northstar's evidence-backed human review loop, which the provider release does not reproduce.",
  citations: evidence,
  confidence: 0.84,
  limitations: [
    "Latency claims from community discussions use different workloads.",
    "No Northstar-specific evaluation has run against the new tier yet.",
  ],
  projects: [{ id: projectId, name: "Northstar" }],
  quotaRemaining: 27,
  suggestedAction:
    "Run Northstar's existing evaluation set on the new tier and compare cost per accepted change.",
  timeRange: {
    from: "2026-07-16T00:00:00.000Z",
    to: "2026-07-23T05:15:00.000Z",
  },
});
