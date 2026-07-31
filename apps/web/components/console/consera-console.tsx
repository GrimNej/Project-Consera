"use client";

import type {
  AskResponse,
  Project,
  ProjectProfile,
  ProjectProfileDraft,
  Verdict,
} from "@consera/contracts";
import {
  Bell,
  BookOpen,
  BrainCircuit,
  Check,
  CircleAlert,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { conseraApi, type WorkspaceData } from "../../lib/api";
import { formatDateTime, formatImpactType, formatPercent } from "../../lib/format";
import { Brand, ConseraMark } from "../brand";
import {
  AlertsSurface,
  AskSurface,
  IntelligenceSurface,
  OverviewSurface,
  ProjectsSurface,
} from "./surfaces";

type View = "overview" | "projects" | "intelligence" | "alerts" | "ask";

const navigation = [
  { icon: LayoutDashboard, id: "overview", label: "Overview" },
  { icon: FolderKanban, id: "projects", label: "Projects" },
  { icon: Radar, id: "intelligence", label: "Intelligence" },
  { icon: Bell, id: "alerts", label: "Alerts" },
  { icon: BrainCircuit, id: "ask", label: "Ask Consera" },
] as const;

function readView(): View {
  if (typeof window === "undefined") return "overview";
  const candidate = window.location.hash.replace("#", "");
  return navigation.some((item) => item.id === candidate) ? (candidate as View) : "overview";
}

export function ConseraConsole() {
  const reducedMotion = useReducedMotion();
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ready" | "error">("checking");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectDetail, setProjectDetail] = useState<Project | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "queued" | "failed">("idle");
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [view, setView] = useState<View>("overview");
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);

  const loadWorkspace = useCallback(async () => {
    setError("");
    const data = await conseraApi.getWorkspace();
    setWorkspace(data);
  }, []);

  const startWorkspace = useCallback(async () => {
    const session = await conseraApi.getSession();
    if (!session.authenticated) throw new Error("Consera could not start a browser session.");
    await loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    let active = true;
    setView(readView());

    async function initialize() {
      try {
        await startWorkspace();
        if (!active) return;
        setAuthState("ready");
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Consera could not be loaded.");
        setAuthState("error");
      }
    }

    function handleHashChange() {
      setView(readView());
    }

    void initialize();
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      active = false;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [startWorkspace]);

  function changeView(next: View) {
    window.history.pushState(null, "", `#${next}`);
    setView(next);
    setMenuOpen(false);
  }

  async function handleRun() {
    setRunState("running");
    try {
      const result = await conseraApi.runIngestion();
      setRunState(result.state === "QUEUED" ? "queued" : "running");
    } catch {
      setRunState("failed");
    }
  }

  async function handleAsk(projectIds: string[], question: string) {
    setAsking(true);
    try {
      setAnswer(await conseraApi.ask(projectIds, question));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Consera could not answer that question.",
      );
    } finally {
      setAsking(false);
    }
  }

  async function handleCreate(input: {
    alertsEnabled: boolean;
    name: string;
    readmeText: string;
  }): Promise<Project> {
    const project = await conseraApi.createProject(input);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            dashboard: {
              ...current.dashboard,
              projects: [project, ...current.dashboard.projects],
            },
          }
        : current,
    );
    return project;
  }

  async function handleActivate(
    projectId: string,
    profile: ProjectProfile,
    expectedProjectVersion: number,
  ): Promise<Project> {
    const project = await conseraApi.activateProfile(projectId, profile, expectedProjectVersion);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            dashboard: {
              ...current.dashboard,
              projects: current.dashboard.projects.map((candidate) =>
                candidate.id === project.id ? project : candidate,
              ),
            },
          }
        : current,
    );
    setProjectDetail(project);
    return project;
  }

  if (authState === "checking") return <LoadingScreen />;
  if (authState === "error" || !workspace) {
    return (
      <FailureScreen
        message={error || "Consera could not load the intelligence workspace."}
        onRetry={() => {
          setAuthState("checking");
          void startWorkspace()
            .then(() => setAuthState("ready"))
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : "Consera could not be loaded.");
              setAuthState("error");
            });
        }}
      />
    );
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label ?? "Overview";

  return (
    <main className="console-layout" id="main-content">
      <div aria-hidden="true" className="grain" />
      <button
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        className="mobile-menu"
        onClick={() => setMenuOpen((current) => !current)}
        type="button"
      >
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <Brand href="/" />
        <nav aria-label="Workspace navigation">
          {navigation.map(({ icon: Icon, id, label }) => (
            <button
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "is-active" : ""}
              key={id}
              onClick={() => changeView(id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
              <span>{label}</span>
              {id === "alerts" && workspace.dashboard.alertsSent > 0 && (
                <i>{workspace.dashboard.alertsSent}</i>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span>
            <i />
            {workspace.sync.stale ? "Last-known intelligence" : "Intelligence online"}
          </span>
          <small>Last signal batch</small>
          <b>{formatDateTime(workspace.dashboard.latestIngestionAt)}</b>
        </div>
      </aside>

      <div className="console-shell">
        <header className="console-topbar">
          <div>
            <span>Workspace</span>
            <b>{currentLabel}</b>
          </div>
          <div className="topbar-project">
            <span className="project-dot">N</span>
            <span>
              <small>Active context</small>
              <b>
                {workspace.dashboard.projects.find((project) => project.activeProfile)?.name ??
                  "No active project"}
              </b>
            </span>
          </div>
          <div className="topbar-health">
            <i />
            <span>
              <small>System health</small>
              <b>
                {workspace.sync.stale
                  ? "Last synchronized view"
                  : workspace.dashboard.health === "HEALTHY"
                    ? "All systems nominal"
                    : "Degraded"}
              </b>
            </span>
          </div>
        </header>

        {workspace.sync.stale && (
          <div className="sync-banner" role="status">
            <Clock3 aria-hidden="true" size={18} />
            <span>
              <b>Showing the last verified Snowflake snapshot</b>
              <small>
                Synchronized {formatDateTime(workspace.sync.synchronizedAt)}. Live intelligence will
                replace it automatically when Snowflake is available.
              </small>
            </span>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            key={view}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "overview" && (
              <OverviewSurface
                dashboard={workspace.dashboard}
                onOpenIntelligence={() => changeView("intelligence")}
              />
            )}
            {view === "projects" && (
              <ProjectsSurface
                onCreate={() => setCreateOpen(true)}
                onOpenProject={setProjectDetail}
                projects={workspace.dashboard.projects}
              />
            )}
            {view === "intelligence" && (
              <IntelligenceSurface
                onRun={() => void handleRun()}
                onSelectVerdict={setSelectedVerdict}
                runState={runState}
                signals={workspace.signals}
                verdicts={workspace.verdicts}
              />
            )}
            {view === "alerts" && <AlertsSurface alerts={workspace.alerts} />}
            {view === "ask" && (
              <AskSurface
                answer={answer}
                asking={asking}
                onAsk={(projectIds, question) => void handleAsk(projectIds, question)}
                projects={workspace.dashboard.projects}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && (
        <div className="toast" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      )}

      {createOpen && (
        <ProjectCreateDialog onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      )}
      {selectedVerdict && (
        <VerdictDialog onClose={() => setSelectedVerdict(null)} verdict={selectedVerdict} />
      )}
      {projectDetail && (
        <ProjectDialog
          onActivate={handleActivate}
          onClose={() => setProjectDetail(null)}
          project={projectDetail}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="system-screen" id="main-content">
      <div className="loading-mark">
        <ConseraMark />
        <i />
        <i />
        <i />
      </div>
      <p>Preparing consequence intelligence</p>
    </main>
  );
}

function FailureScreen({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <main className="system-screen system-screen--error" id="main-content">
      <CircleAlert aria-hidden="true" size={31} />
      <h1>The intelligence workspace could not be loaded</h1>
      <p>{message}</p>
      <button className="button" onClick={onRetry} type="button">
        <RefreshCw aria-hidden="true" size={18} />
        Try again
      </button>
    </main>
  );
}

function ProjectCreateDialog({
  onClose,
  onCreate,
}: Readonly<{
  onClose: () => void;
  onCreate: (input: {
    alertsEnabled: boolean;
    name: string;
    readmeText: string;
  }) => Promise<Project>;
}>) {
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [readmeText, setReadmeText] = useState("");
  const [result, setResult] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const byteCount = useMemo(() => new TextEncoder().encode(readmeText).byteLength, [readmeText]);
  const valid = name.trim().length >= 2 && readmeText.trim().length >= 20 && byteCount <= 200_000;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    setError("");
    setSubmitting(true);
    try {
      setResult(
        await onCreate({
          alertsEnabled,
          name: name.trim(),
          readmeText,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-label="Create a Consera project"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <div className="project-modal">
        <header>
          <div>
            <span>Add project</span>
            <h2>{result ? "Project context accepted" : "What should Consera understand?"}</h2>
          </div>
          <button aria-label="Close project creation" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        {result ? (
          <div className="project-success">
            <span>
              <Check aria-hidden="true" size={25} />
            </span>
            <h3>
              {result.name}{" "}
              {result.profileState === "REVIEW"
                ? "is ready for profile review"
                : "was accepted for extraction"}
            </h3>
            <p>
              Consera accepted the document and created a versioned project record. Snowflake is
              preparing the extracted facts for your review.
            </p>
            <div className="extraction-path">
              {["Secret screening", "Evidence excerpts", "Structured profile", "Human review"].map(
                (stage, index) => (
                  <div key={stage}>
                    <i>
                      {index < 2 || (index === 2 && result.profileState === "REVIEW") ? (
                        <Check size={14} />
                      ) : (
                        `0${index + 1}`
                      )}
                    </i>
                    <span>{stage}</span>
                  </div>
                ),
              )}
            </div>
            <button className="button" onClick={onClose} type="button">
              View project
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <div className="modal-steps">
              <span className="is-active">01 Project</span>
              <i />
              <span>02 Extract</span>
              <i />
              <span>03 Review</span>
            </div>
            <label>
              Project name
              <input
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Northstar"
                value={name}
              />
            </label>
            <label>
              README or project brief
              <textarea
                maxLength={200_000}
                onChange={(event) => setReadmeText(event.target.value)}
                placeholder="Paste the Markdown or plain-text project document that explains what the product does, who it serves, its capabilities, providers, dependencies, and constraints."
                rows={11}
                value={readmeText}
              />
              <span className={byteCount > 200_000 ? "is-error" : ""}>
                {(byteCount / 1_000).toFixed(1)} KB of 200 KB
              </span>
            </label>
            <label className="confirmation-option">
              <input
                checked={alertsEnabled}
                onChange={(event) => setAlertsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <b>Enable qualifying alerts after profile activation</b>
                <small>Daily caps, confidence, evidence, and cooldown gates always apply.</small>
              </span>
            </label>
            <label className="confirmation-option">
              <input required type="checkbox" />
              <span>
                <b>I confirm this document contains no credentials or private secrets</b>
                <small>Consera runs an additional secret screen before extraction.</small>
              </span>
            </label>
            {error && (
              <span className="form-error" role="alert">
                <CircleAlert aria-hidden="true" size={16} />
                {error}
              </span>
            )}
            <footer>
              <button className="secondary-button" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="button" disabled={!valid || submitting} type="submit">
                {submitting ? (
                  <>
                    <RefreshCw aria-hidden="true" className="is-spinning" size={18} />
                    Screening document
                  </>
                ) : (
                  <>
                    Create reviewed context <Plus aria-hidden="true" size={18} />
                  </>
                )}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}

const editableProfileLists = [
  ["Capabilities", "capabilities"],
  ["Target users", "targetUsers"],
  ["Differentiators", "differentiators"],
  ["Dependencies", "dependencies"],
  ["Providers", "providers"],
  ["Monitored topics", "monitoredTopics"],
  ["Constraints", "constraints"],
] as const;

function ProjectDialog({
  onActivate,
  onClose,
  project,
}: Readonly<{
  onActivate: (
    projectId: string,
    profile: ProjectProfile,
    expectedProjectVersion: number,
  ) => Promise<Project>;
  onClose: () => void;
  project: Project;
}>) {
  const [draft, setDraft] = useState<ProjectProfileDraft | null>(null);
  const [editableProfile, setEditableProfile] = useState<ProjectProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!project.activeProfile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project.activeProfile) {
      setLoading(false);
      return;
    }
    let active = true;
    let attempts = 0;
    let timer: number | undefined;

    async function loadDraft() {
      attempts += 1;
      try {
        const next = await conseraApi.getProfileDraft(project.id);
        if (!active) return;
        setDraft(next);
        setEditableProfile(next.profile);
        setLoading(false);
        setError("");
      } catch {
        if (!active) return;
        if (attempts < 20) {
          timer = window.setTimeout(() => void loadDraft(), 3_000);
          return;
        }
        setError(
          "Profile extraction is taking longer than expected. Close and check again shortly.",
        );
        setLoading(false);
      }
    }

    void loadDraft();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [project.activeProfile, project.id]);

  function updateList(field: (typeof editableProfileLists)[number][1], value: string) {
    setEditableProfile((current) =>
      current
        ? {
            ...current,
            [field]: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : current,
    );
  }

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !editableProfile) return;
    setSaving(true);
    setError("");
    try {
      await onActivate(project.id, editableProfile, draft.projectVersion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The profile could not be activated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      aria-label={`${project.name} project profile`}
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <article className="detail-drawer project-drawer">
        <header>
          <div className="project-monogram">{project.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <span>Project intelligence profile</span>
            <h2>{project.name}</h2>
          </div>
          <button aria-label="Close project profile" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        {project.activeProfile ? (
          <div className="project-detail-body">
            <p>{project.activeProfile.summary}</p>
            <div className="profile-metadata">
              <span>
                <ShieldCheck aria-hidden="true" size={18} />
                {formatPercent(project.activeProfile.completeness)} complete
              </span>
              <span>Active profile v{project.activeProfile.version}</span>
            </div>
            {[
              ["Capabilities", project.activeProfile.capabilities],
              ["Differentiators", project.activeProfile.differentiators],
              ["Dependencies", project.activeProfile.dependencies],
              ["Providers", project.activeProfile.providers],
              ["Monitored topics", project.activeProfile.monitoredTopics],
              ["Constraints", project.activeProfile.constraints],
            ].map(([title, values]) => (
              <section key={title as string}>
                <h3>{title}</h3>
                <ul>
                  {(values as string[]).map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : loading ? (
          <div className="empty-panel project-review-state">
            <RefreshCw aria-hidden="true" className="is-spinning" size={25} />
            <b>Extracting structured project context</b>
            <p>
              Snowflake is screening the admitted document and preparing editable, evidence-backed
              facts. This drawer will update automatically.
            </p>
          </div>
        ) : draft && editableProfile ? (
          <form className="profile-review-form" onSubmit={(event) => void activate(event)}>
            <div className="review-introduction">
              <div>
                <span>Human review required</span>
                <h3>Confirm what Consera should treat as authoritative</h3>
                <p>
                  Edit, remove, or add any fact below. Monitoring cannot begin until you approve
                  this version.
                </p>
              </div>
              <span className="profile-confidence">
                {formatPercent(editableProfile.completeness)} extracted
              </span>
            </div>

            <label>
              Product summary
              <textarea
                maxLength={1_200}
                onChange={(event) =>
                  setEditableProfile((current) =>
                    current ? { ...current, summary: event.target.value } : current,
                  )
                }
                rows={4}
                value={editableProfile.summary}
              />
            </label>

            <div className="profile-review-grid">
              {editableProfileLists.map(([label, field]) => (
                <label key={field}>
                  {label}
                  <textarea
                    aria-describedby={`${field}-hint`}
                    onChange={(event) => updateList(field, event.target.value)}
                    rows={5}
                    value={editableProfile[field].join("\n")}
                  />
                  <small id={`${field}-hint`}>One reviewed fact per line</small>
                </label>
              ))}
            </div>

            <aside className="profile-evidence">
              <div>
                <BookOpen aria-hidden="true" size={20} />
                <span>
                  <b>{draft.evidence.label}</b>
                  <small>Exact admitted source excerpt</small>
                </span>
              </div>
              <blockquote>{draft.evidence.excerpt}</blockquote>
            </aside>

            {error && (
              <span className="form-error" role="alert">
                <CircleAlert aria-hidden="true" size={16} />
                {error}
              </span>
            )}

            <footer>
              <span>
                Activating creates a new immutable profile version. The extracted draft remains in
                the audit trail.
              </span>
              <button
                className="button"
                disabled={
                  saving ||
                  editableProfile.summary.trim().length === 0 ||
                  editableProfile.capabilities.length === 0
                }
                type="submit"
              >
                {saving ? (
                  <>
                    <RefreshCw aria-hidden="true" className="is-spinning" size={18} />
                    Activating profile
                  </>
                ) : (
                  <>
                    <ShieldCheck aria-hidden="true" size={18} />
                    Approve and begin monitoring
                  </>
                )}
              </button>
            </footer>
          </form>
        ) : (
          <div className="empty-panel project-review-state">
            <CircleAlert aria-hidden="true" size={25} />
            <b>Profile extraction is not ready</b>
            <p>{error || "Close this drawer and check again shortly."}</p>
          </div>
        )}
      </article>
    </div>
  );
}

function VerdictDialog({ onClose, verdict }: Readonly<{ onClose: () => void; verdict: Verdict }>) {
  const scores = [
    ["Relevance", verdict.relevance],
    ["Opportunity", verdict.opportunity],
    ["Threat", verdict.threat],
    ["Replacement pressure", verdict.replacementPressure],
    ["Urgency", verdict.urgency],
    ["Confidence", verdict.confidence],
  ] satisfies readonly (readonly [string, number])[];

  return (
    <div
      aria-label={`${verdict.projectName} consequence dossier`}
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <article className="detail-drawer verdict-drawer">
        <header>
          <div>
            <span className={`impact-pill ${verdict.impactType.toLowerCase()}`}>
              {formatImpactType(verdict.impactType)}
            </span>
            <h2>{verdict.headline}</h2>
            <p>
              {verdict.projectName} · Published {formatDateTime(verdict.publishedAt)}
            </p>
          </div>
          <button aria-label="Close consequence dossier" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="verdict-detail-body">
          <section className="verdict-summary">
            <span>What this means</span>
            <p>{verdict.summary}</p>
          </section>
          <div className="score-grid">
            {scores.map(([label, rawValue]) => {
              const value = rawValue;
              return (
                <div key={label}>
                  <span>
                    <b>{label}</b>
                    <strong>{formatPercent(value)}</strong>
                  </span>
                  <i>
                    <span style={{ width: `${Math.round(value * 100)}%` }} />
                  </i>
                </div>
              );
            })}
          </div>
          <div className="dossier-columns">
            <section>
              <h3>Recommended actions</h3>
              <ol>
                {verdict.recommendations.map((recommendation, index) => (
                  <li key={recommendation}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {recommendation}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3>What protects the project</h3>
              <ul>
                {verdict.protectiveFactors.map((factor) => (
                  <li key={factor}>
                    <ShieldCheck aria-hidden="true" size={17} />
                    {factor}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section className="score-contributions">
            <h3>Why the score looks this way</h3>
            {verdict.contributions.map((contribution) => (
              <div key={contribution.component}>
                <span>
                  <b>{contribution.component}</b>
                  <small>
                    {formatPercent(contribution.rawValue)} ×{" "}
                    {formatPercent(Math.abs(contribution.weight))}
                  </small>
                </span>
                <p>{contribution.explanation}</p>
              </div>
            ))}
          </section>
          <section className="dossier-evidence">
            <h3>Evidence record</h3>
            {verdict.evidence.map((item, index) => (
              <article key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{item.label}</b>
                  <p>{item.excerpt}</p>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                      Open original source
                    </a>
                  )}
                </div>
              </article>
            ))}
          </section>
          <section className="uncertainty-note">
            <CircleAlert aria-hidden="true" size={20} />
            <div>
              <b>Uncertainty and limitation</b>
              <p>{verdict.uncertainty}</p>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
