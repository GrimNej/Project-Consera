"use client";

import type { Alert, AskResponse, Dashboard, Project, Signal, Verdict } from "@consera/contracts";
import {
  Activity,
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  Gauge,
  Layers3,
  MailCheck,
  MessageSquareText,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatDateTime,
  formatImpactType,
  formatPercent,
  formatSuppressionReason,
} from "../../lib/format";

export function OverviewSurface({
  dashboard,
  onOpenIntelligence,
}: Readonly<{ dashboard: Dashboard; onOpenIntelligence: () => void }>) {
  const signalEfficiency =
    dashboard.signalsReviewed === 0
      ? 0
      : Math.round((dashboard.suppressed / dashboard.signalsReviewed) * 100);
  const availableCredits = dashboard.credits.totalEnvelope - dashboard.credits.consumed;

  return (
    <section className="surface" aria-labelledby="overview-title">
      <header className="surface-heading split-heading">
        <div>
          <p className="eyebrow">Attention, protected</p>
          <h1 id="overview-title">
            One consequence.
            <br />
            <em>Not another feed.</em>
          </h1>
          <p>
            Consera reviewed {dashboard.signalsReviewed} technology signals, dismissed{" "}
            {dashboard.suppressed} quietly, and interrupted you only when a project-specific action
            was justified.
          </p>
        </div>
        <div className="health-card">
          <span className="health-pulse" />
          <div>
            <small>System state</small>
            <b>
              {dashboard.health === "HEALTHY" ? "All intelligence paths healthy" : dashboard.health}
            </b>
          </div>
          <ShieldCheck aria-hidden="true" size={22} />
        </div>
      </header>

      <div className="metric-strip">
        <article>
          <Radar aria-hidden="true" size={20} />
          <span>Signals reviewed</span>
          <b>{dashboard.signalsReviewed}</b>
          <small>Latest 24 hours</small>
        </article>
        <article>
          <BellOff aria-hidden="true" size={20} />
          <span>Dismissed quietly</span>
          <b>{dashboard.suppressed}</b>
          <small>{signalEfficiency}% filtration rate</small>
        </article>
        <article>
          <BrainCircuit aria-hidden="true" size={20} />
          <span>Analyzed deeply</span>
          <b>{dashboard.analyzedDeeply}</b>
          <small>Only plausible relevance</small>
        </article>
        <article className="is-accent">
          <Bell aria-hidden="true" size={20} />
          <span>Worth interruption</span>
          <b>{dashboard.alertsSent}</b>
          <small>Evidence threshold passed</small>
        </article>
      </div>

      <div className="overview-grid">
        <article className="panel consequence-feature">
          <header className="panel-header">
            <div>
              <span>Highest current consequence</span>
              <h2>{dashboard.topVerdicts[0]?.projectName ?? "No active consequence"}</h2>
            </div>
            {dashboard.topVerdicts[0] && (
              <span className="impact-pill opportunity">
                {formatImpactType(dashboard.topVerdicts[0].impactType)}
              </span>
            )}
          </header>
          {dashboard.topVerdicts[0] ? (
            <>
              <div className="consequence-body">
                <p>{dashboard.topVerdicts[0].headline}</p>
                <div className="score-pair">
                  <div>
                    <span>Opportunity</span>
                    <b>{formatPercent(dashboard.topVerdicts[0].opportunity)}</b>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <b>{formatPercent(dashboard.topVerdicts[0].confidence)}</b>
                  </div>
                </div>
                <blockquote>{dashboard.topVerdicts[0].summary}</blockquote>
              </div>
              <button className="panel-action" onClick={onOpenIntelligence} type="button">
                Open consequence dossier <ArrowRight aria-hidden="true" size={18} />
              </button>
            </>
          ) : (
            <div className="empty-panel">
              <Check aria-hidden="true" size={24} />
              <b>No material consequence is waiting</b>
              <p>Consera will stay quiet until the evidence and impact gates are satisfied.</p>
            </div>
          )}
        </article>

        <article className="panel activity-panel">
          <header className="panel-header">
            <div>
              <span>Pipeline activity</span>
              <h2>What Consera did</h2>
            </div>
            <Activity aria-hidden="true" size={21} />
          </header>
          <ol>
            {dashboard.activities.map((activity) => (
              <li key={activity.id}>
                <i className={`activity-state ${activity.state.toLowerCase()}`} />
                <div>
                  <b>{activity.title}</b>
                  <span>{activity.detail}</span>
                </div>
                <time>{formatDateTime(activity.occurredAt)}</time>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel budget-panel">
          <header className="panel-header">
            <div>
              <span>Responsible intelligence</span>
              <h2>Cost envelope</h2>
            </div>
            <Gauge aria-hidden="true" size={21} />
          </header>
          <div className="budget-gauge">
            <svg aria-hidden="true" viewBox="0 0 180 100">
              <path d="M18 89A72 72 0 0 1 162 89" />
              <path
                className="budget-gauge__value"
                d="M18 89A72 72 0 0 1 162 89"
                pathLength="100"
                style={{
                  strokeDasharray: `${Math.round((dashboard.credits.consumed / dashboard.credits.totalEnvelope) * 100)} 100`,
                }}
              />
            </svg>
            <div>
              <b>{availableCredits.toFixed(1)}</b>
              <span>credits available</span>
            </div>
          </div>
          <dl className="compact-data">
            <div>
              <dt>Protected reserve</dt>
              <dd>{dashboard.credits.reserve.toFixed(0)} credits</dd>
            </div>
            <div>
              <dt>AI calls avoided</dt>
              <dd>{dashboard.suppressed}</dd>
            </div>
            <div>
              <dt>Last ingestion</dt>
              <dd>{formatDateTime(dashboard.latestIngestionAt)}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}

export function ProjectsSurface({
  onCreate,
  onOpenProject,
  projects,
}: Readonly<{
  onCreate: () => void;
  onOpenProject: (project: Project) => void;
  projects: Project[];
}>) {
  return (
    <section className="surface" aria-labelledby="projects-title">
      <header className="surface-heading split-heading compact-heading">
        <div>
          <p className="eyebrow">Reviewed project context</p>
          <h1 id="projects-title">
            Teach Consera
            <br />
            <em>what matters.</em>
          </h1>
          <p>
            Each project receives a versioned profile of capabilities, providers, dependencies,
            constraints, and differentiation before monitoring begins.
          </p>
        </div>
        <button className="button" onClick={onCreate} type="button">
          <Plus aria-hidden="true" size={18} />
          Add project
        </button>
      </header>

      <div className="projects-grid">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <header>
              <div className="project-monogram">{project.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <h2>{project.name}</h2>
                <span className={`project-state ${project.profileState.toLowerCase()}`}>
                  {project.profileState === "ACTIVE"
                    ? "Monitoring active"
                    : project.profileState === "EXTRACTING"
                      ? "Profile extracting"
                      : "Profile review ready"}
                </span>
              </div>
              <button
                aria-label={`Open ${project.name}`}
                className="icon-button"
                onClick={() => onOpenProject(project)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={19} />
              </button>
            </header>
            {project.activeProfile ? (
              <>
                <p>{project.activeProfile.summary}</p>
                <div className="project-facts">
                  <span>
                    <Layers3 aria-hidden="true" size={16} />
                    {project.activeProfile.capabilities.length} capabilities
                  </span>
                  <span>
                    <ShieldCheck aria-hidden="true" size={16} />
                    {formatPercent(project.activeProfile.completeness)} complete
                  </span>
                </div>
                <div className="topic-list">
                  {project.activeProfile.monitoredTopics.slice(0, 4).map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
                <footer>
                  <span>Profile v{project.activeProfile.version}</span>
                  <span>
                    <i className={project.alertsEnabled ? "is-on" : ""} />
                    Alerts {project.alertsEnabled ? "on" : "off"}
                  </span>
                </footer>
              </>
            ) : (
              <div className="review-ready">
                <FileCheck2 aria-hidden="true" size={24} />
                <div>
                  <b>
                    {project.profileState === "EXTRACTING"
                      ? "Extraction is running"
                      : "Extraction ready for review"}
                  </b>
                  <span>
                    {project.profileState === "EXTRACTING"
                      ? "Open the project to watch the reviewed profile become available."
                      : "Confirm the structured profile before monitoring begins."}
                  </span>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => onOpenProject(project)}
                  type="button"
                >
                  {project.profileState === "EXTRACTING" ? "View progress" : "Review profile"}{" "}
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
            )}
          </article>
        ))}
        <button className="project-card project-card--add" onClick={onCreate} type="button">
          <span>
            <Plus aria-hidden="true" size={25} />
          </span>
          <b>Add another project</b>
          <small>Paste or upload a README to create reviewed context.</small>
        </button>
      </div>

      <article className="profile-policy" id="profile-policy">
        <ShieldCheck aria-hidden="true" size={23} />
        <div>
          <b>Profiles are reviewable, versioned, and evidence bound</b>
          <p>
            Project text is treated as untrusted data. Secret screening runs before extraction, and
            no profile can become active without human confirmation.
          </p>
        </div>
        <a href="#profile-policy">
          Evidence policy <ArrowRight aria-hidden="true" size={16} />
        </a>
      </article>
    </section>
  );
}

export function IntelligenceSurface({
  onRun,
  onSelectVerdict,
  runState,
  signals,
  verdicts,
}: Readonly<{
  onRun: () => void;
  onSelectVerdict: (verdict: Verdict) => void;
  runState: "idle" | "running" | "queued" | "failed";
  signals: Signal[];
  verdicts: Verdict[];
}>) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const visibleSignals = showSuppressed
    ? signals
    : signals.filter((signal) => signal.state !== "SUPPRESSED");

  return (
    <section className="surface" aria-labelledby="intelligence-title">
      <header className="surface-heading split-heading compact-heading">
        <div>
          <p className="eyebrow">Signal filtration and verdicts</p>
          <h1 id="intelligence-title">
            See the consequence,
            <br />
            <em>not the firehose.</em>
          </h1>
          <p>
            Candidate signals are compared against active project profiles. Only plausible,
            evidence-supported impacts reach deep analysis.
          </p>
        </div>
        <button
          className="button"
          disabled={runState === "running" || runState === "queued"}
          onClick={onRun}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={runState === "running" || runState === "queued" ? "is-spinning" : ""}
            size={18}
          />
          {runState === "queued"
            ? "Run queued"
            : runState === "running"
              ? "Checking signals"
              : "Check for new signals"}
        </button>
      </header>

      <div className="intelligence-grid">
        <article className="panel radar-panel">
          <header className="panel-header">
            <div>
              <span>Signal radar</span>
              <h2>Latest source activity</h2>
            </div>
            <label className="quiet-toggle">
              <input
                checked={showSuppressed}
                onChange={(event) => setShowSuppressed(event.target.checked)}
                type="checkbox"
              />
              <span>Show dismissed</span>
            </label>
          </header>
          <div className="signal-list">
            {visibleSignals.map((signal) => (
              <article key={signal.id}>
                <div className={`signal-icon ${signal.state.toLowerCase()}`}>
                  {signal.state === "SUPPRESSED" ? (
                    <BellOff aria-hidden="true" size={17} />
                  ) : (
                    <Radar aria-hidden="true" size={17} />
                  )}
                </div>
                <div>
                  <div className="signal-meta">
                    <span>{signal.topic}</span>
                    <time>{formatDateTime(signal.discoveredAt)}</time>
                  </div>
                  <h3>{signal.title}</h3>
                  <p>
                    {signal.state === "SUPPRESSED"
                      ? "Dismissed before deep analysis because no active project showed material relevance."
                      : signal.state === "ANALYZED"
                        ? "Deep analysis completed for one active project."
                        : "Plausible relevance found. Evidence selection is in progress."}
                  </p>
                  <div className="signal-links">
                    <a href={signal.discussionUrl} rel="noreferrer" target="_blank">
                      Discussion <ExternalLink aria-hidden="true" size={13} />
                    </a>
                    {signal.sourceUrl && (
                      <a href={signal.sourceUrl} rel="noreferrer" target="_blank">
                        Source <ExternalLink aria-hidden="true" size={13} />
                      </a>
                    )}
                    <span>{signal.points} points</span>
                  </div>
                </div>
                <span className={`state-label ${signal.state.toLowerCase()}`}>
                  {signal.state === "SUPPRESSED" ? "Quietly dismissed" : signal.state.toLowerCase()}
                </span>
              </article>
            ))}
          </div>
        </article>

        <div className="verdict-stack">
          <div className="stack-heading">
            <span>Published consequence dossiers</span>
            <b>{verdicts.length.toString().padStart(2, "0")}</b>
          </div>
          {verdicts.map((verdict) => (
            <button
              className="verdict-card"
              key={verdict.id}
              onClick={() => onSelectVerdict(verdict)}
              type="button"
            >
              <div className="verdict-card__top">
                <span className={`impact-pill ${verdict.impactType.toLowerCase()}`}>
                  {formatImpactType(verdict.impactType)}
                </span>
                <time>{formatDateTime(verdict.publishedAt)}</time>
              </div>
              <span className="verdict-project">{verdict.projectName}</span>
              <h2>{verdict.headline}</h2>
              <p>{verdict.summary}</p>
              <div className="verdict-scores">
                <span>
                  <small>Relevance</small>
                  <b>{formatPercent(verdict.relevance)}</b>
                </span>
                <span>
                  <small>Impact</small>
                  <b>{formatPercent(verdict.impactPeak)}</b>
                </span>
                <span>
                  <small>Confidence</small>
                  <b>{formatPercent(verdict.confidence)}</b>
                </span>
              </div>
              <footer>
                <span>{verdict.evidence.length} evidence records</span>
                <b>
                  Open dossier <ArrowRight aria-hidden="true" size={16} />
                </b>
              </footer>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AlertsSurface({ alerts }: Readonly<{ alerts: Alert[] }>) {
  const [filter, setFilter] = useState<"all" | "sent" | "suppressed">("all");
  const visible = useMemo(
    () =>
      alerts.filter((alert) => {
        if (filter === "all") return true;
        if (filter === "sent") return alert.deliveryState === "SENT";
        return alert.deliveryState === "SUPPRESSED";
      }),
    [alerts, filter],
  );

  return (
    <section className="surface" aria-labelledby="alerts-title">
      <header className="surface-heading compact-heading">
        <p className="eyebrow">Interruption ledger</p>
        <h1 id="alerts-title">
          Every alert justified.
          <br />
          Every silence <em>explained.</em>
        </h1>
        <p>
          Review sent, queued, failed, and suppressed alert decisions. Consera records exactly why a
          signal did or did not earn your attention.
        </p>
      </header>

      <div className="alert-summary">
        <article>
          <MailCheck aria-hidden="true" size={20} />
          <div>
            <b>{alerts.filter((alert) => alert.deliveryState === "SENT").length}</b>
            <span>Sent with evidence</span>
          </div>
        </article>
        <article>
          <BellOff aria-hidden="true" size={20} />
          <div>
            <b>{alerts.filter((alert) => alert.deliveryState === "SUPPRESSED").length}</b>
            <span>Suppressed decisions</span>
          </div>
        </article>
        <article>
          <Clock3 aria-hidden="true" size={20} />
          <div>
            <b>72h</b>
            <span>Dedupe window</span>
          </div>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <b>3/day</b>
            <span>Per-project ceiling</span>
          </div>
        </article>
      </div>

      <article className="panel alert-ledger">
        <header>
          <div>
            <h2>Decision history</h2>
            <span>Delivery and suppression states remain auditable.</span>
          </div>
          <div className="segment-control" aria-label="Alert filter">
            {(["all", "sent", "suppressed"] as const).map((item) => (
              <button
                className={filter === item ? "is-active" : ""}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </header>
        <div className="alert-table">
          <div className="alert-table__head">
            <span>Decision</span>
            <span>Project and consequence</span>
            <span>State</span>
            <span>Time</span>
          </div>
          {visible.map((alert) => (
            <article className="alert-row" key={alert.id}>
              <span className={`alert-decision ${alert.deliveryState.toLowerCase()}`}>
                {alert.deliveryState === "SENT" ? (
                  <MailCheck aria-hidden="true" size={17} />
                ) : (
                  <BellOff aria-hidden="true" size={17} />
                )}
              </span>
              <span>
                <b>{alert.projectName}</b>
                <small>{alert.verdictHeadline}</small>
              </span>
              <span>
                <b>{alert.deliveryState === "SUPPRESSED" ? "Stayed quiet" : "Email sent"}</b>
                <small>
                  {alert.suppressionReason
                    ? formatSuppressionReason(alert.suppressionReason)
                    : formatImpactType(alert.verdictType)}
                </small>
              </span>
              <time>{formatDateTime(alert.createdAt)}</time>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}

const suggestedQuestions = [
  "What should I investigate today?",
  "What protects this project from replacement pressure?",
  "Which provider changes could lower our costs?",
] as const;

export function AskSurface({
  answer,
  asking,
  onAsk,
  projects,
}: Readonly<{
  answer: AskResponse | null;
  asking: boolean;
  onAsk: (projectIds: string[], question: string) => void;
  projects: Project[];
}>) {
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [feedback, setFeedback] = useState<"useful" | "missing" | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length >= 4 && projectId) onAsk([projectId], question.trim());
  }

  return (
    <section className="surface ask-surface" aria-labelledby="ask-title">
      <header className="surface-heading compact-heading">
        <p className="eyebrow">Cited project intelligence</p>
        <h1 id="ask-title">
          Ask the consequence,
          <br />
          <em>trace the answer.</em>
        </h1>
        <p>
          Ask about opportunities, threats, providers, dependencies, or alert decisions. Every
          external assertion must cite stored evidence.
        </p>
      </header>

      <div className="ask-grid">
        <form className="ask-composer" onSubmit={submit}>
          <label>
            Project context
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects
                .filter((project) => project.activeProfile)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Your question
            <textarea
              maxLength={1_000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Which technology shift deserves my attention today?"
              rows={5}
              value={question}
            />
          </label>
          <div className="suggested-questions">
            <span>Try asking</span>
            {suggestedQuestions.map((suggestion) => (
              <button key={suggestion} onClick={() => setQuestion(suggestion)} type="button">
                {suggestion}
              </button>
            ))}
          </div>
          <button className="button" disabled={asking || question.trim().length < 4} type="submit">
            {asking ? (
              <>
                <RefreshCw aria-hidden="true" className="is-spinning" size={18} />
                Tracing evidence
              </>
            ) : (
              <>
                Ask Consera <Send aria-hidden="true" size={17} />
              </>
            )}
          </button>
        </form>

        <article className={`answer-panel ${answer ? "has-answer" : ""}`}>
          {answer ? (
            <>
              <header>
                <span>
                  <Sparkles aria-hidden="true" size={17} />
                  Cited answer
                </span>
                <span>{formatPercent(answer.confidence)} confidence</span>
              </header>
              <div className="answer-copy">
                <p>{answer.answer}</p>
                {answer.suggestedAction && (
                  <div className="answer-action">
                    <TrendingUp aria-hidden="true" size={20} />
                    <span>
                      <small>Suggested next action</small>
                      <b>{answer.suggestedAction}</b>
                    </span>
                  </div>
                )}
              </div>
              <section className="answer-evidence">
                <h2>Supporting evidence</h2>
                <ol>
                  {answer.citations.map((citation, index) => (
                    <li key={citation.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <b>{citation.label}</b>
                        <p>{citation.excerpt}</p>
                        {citation.sourceUrl && (
                          <a href={citation.sourceUrl} rel="noreferrer" target="_blank">
                            Open source <ExternalLink aria-hidden="true" size={13} />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <footer>
                <span>{answer.quotaRemaining} questions remaining today</span>
                <button
                  aria-pressed={feedback === "useful"}
                  className={feedback === "useful" ? "is-active" : ""}
                  onClick={() => setFeedback("useful")}
                  type="button"
                >
                  <Check aria-hidden="true" size={15} />
                  Useful
                </button>
                <button
                  aria-pressed={feedback === "missing"}
                  className={feedback === "missing" ? "is-active" : ""}
                  onClick={() => setFeedback("missing")}
                  type="button"
                >
                  <CircleAlert aria-hidden="true" size={15} />
                  Missing context
                </button>
              </footer>
            </>
          ) : (
            <div className="answer-empty">
              <div className="answer-orbit">
                <MessageSquareText aria-hidden="true" size={27} />
                <i />
                <i />
                <i />
              </div>
              <b>Your evidence-backed answer will appear here</b>
              <p>
                Consera searches reviewed project facts, published verdicts, and immutable evidence
                records. Unsupported claims are excluded.
              </p>
              <div>
                <BookOpen aria-hidden="true" size={17} />
                Project scoped
                <Search aria-hidden="true" size={17} />
                Evidence retrieved
                <ShieldCheck aria-hidden="true" size={17} />
                Citations required
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
