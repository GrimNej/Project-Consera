"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  FileSearch,
  Fingerprint,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Brand, ConseraMark } from "./brand";

const principles = [
  {
    body: "Consera learns capabilities, providers, constraints, and differentiation from evidence you review.",
    icon: Fingerprint,
    index: "01",
    title: "Your project is the context",
  },
  {
    body: "Every external claim carries its source. Weak or contradictory evidence lowers confidence.",
    icon: FileSearch,
    index: "02",
    title: "Evidence travels with the verdict",
  },
  {
    body: "Most signals disappear quietly. Only material and actionable consequences can interrupt you.",
    icon: BellRing,
    index: "03",
    title: "Silence is a feature",
  },
] as const;

const flow = [
  {
    label: "Project profile",
    note: "Reviewed, versioned context",
  },
  {
    label: "Signal filtration",
    note: "Noise removed before deep analysis",
  },
  {
    label: "Consequence verdict",
    note: "Evidence, scores, protection, action",
  },
] as const;

export function LandingPage() {
  const reducedMotion = useReducedMotion();

  return (
    <main className="landing" id="main-content">
      <div aria-hidden="true" className="grain" />
      <nav aria-label="Primary navigation" className="landing-nav">
        <Brand />
        <div className="landing-nav__links">
          <a href="#product">Product</a>
          <a href="#method">Method</a>
          <a href="#trust">Trust</a>
        </div>
        <a className="button button--small" href="/console">
          Open Consera <ArrowRight aria-hidden="true" size={16} />
        </a>
      </nav>

      <section className="hero">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="hero-copy"
          initial={reducedMotion ? false : { opacity: 0, y: 22 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">
            <span className="live-dot" />
            Silence-first project intelligence
          </p>
          <h1>
            The market moves.
            <br />
            Know <em>what it means.</em>
          </h1>
          <p className="hero-copy__body">
            Consera understands your project, watches technology shifts, and explains only the
            consequences worth acting on.
          </p>
          <div className="hero-actions">
            <a className="button" href="/console">
              Enter intelligence <ArrowRight aria-hidden="true" size={17} />
            </a>
            <a className="text-action" href="#product">
              See the filtration path <ChevronDown aria-hidden="true" size={17} />
            </a>
          </div>
          <div className="hero-proof">
            <span>
              <ShieldCheck aria-hidden="true" size={17} />
              Evidence bound
            </span>
            <span>
              <Check aria-hidden="true" size={17} />
              Human reviewed
            </span>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label="A large volume of technology signals being filtered into one material project consequence"
          className="intelligence-scene"
          id="product"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 28 }}
          transition={{ delay: reducedMotion ? 0 : 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg aria-hidden="true" className="radar-field" viewBox="0 0 720 720">
            <defs>
              <linearGradient id="field-signal" x1="0" x2="1">
                <stop stopColor="#00ccf8" stopOpacity=".1" />
                <stop offset=".5" stopColor="#00ccf8" />
                <stop offset="1" stopColor="#00ffb7" />
              </linearGradient>
            </defs>
            <circle cx="360" cy="360" r="292" />
            <circle cx="360" cy="360" r="224" />
            <circle cx="360" cy="360" r="154" />
            <path
              className="radar-field__signal"
              d="M55 389 C178 278 230 473 332 354 S511 239 666 349"
            />
          </svg>
          <div aria-hidden="true" className="scene-halo" />
          <article className="intelligence-window">
            <header className="window-bar">
              <span className="window-brand">
                <ConseraMark className="consera-mark--mini" />
                Consera
              </span>
              <span className="window-state">
                <i />
                Monitoring 2 projects
              </span>
              <span aria-hidden="true" className="window-menu">
                •••
              </span>
            </header>
            <div className="window-body">
              <div className="window-title">
                <span>Material consequence found</span>
                <time>05:09</time>
              </div>
              <h2>Lower-cost model tier could improve agent margins</h2>
              <div className="signal-tally">
                <div>
                  <strong>247</strong>
                  <span>reviewed</span>
                </div>
                <i>
                  <span />
                </i>
                <div>
                  <strong>238</strong>
                  <span>dismissed</span>
                </div>
                <i>
                  <span />
                </i>
                <div className="is-active">
                  <strong>01</strong>
                  <span>worth attention</span>
                </div>
              </div>
              <a className="window-cta" href="/console">
                <span>Read the consequence dossier</span>
                <b>86% confidence</b>
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </div>
          </article>
          <div aria-hidden="true" className="float-card float-card--signal">
            <Radar size={18} />
            <span>
              <small>New signal</small>
              <b>Provider release</b>
            </span>
          </div>
          <div aria-hidden="true" className="float-card float-card--verdict">
            <Sparkles size={18} />
            <span>
              <b>Provider opportunity</b>
              <small>Evidence threshold passed</small>
            </span>
          </div>
        </motion.div>
      </section>

      <section aria-label="Product guarantees" className="principles" id="method">
        {principles.map(({ body, icon: Icon, index, title }) => (
          <article key={title}>
            <div>
              <span>{index}</span>
              <Icon aria-hidden="true" size={21} />
            </div>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="flow-statement">
        <div className="flow-copy">
          <p className="eyebrow">From context to consequence</p>
          <h2>
            Read less news.
            <br />
            Make <em>better decisions.</em>
          </h2>
          <p>
            Consera does the expensive thinking after deterministic filters establish plausible
            relevance. That protects attention, improves precision, and keeps cost bounded.
          </p>
        </div>
        <ol className="flow-list">
          {flow.map((item, index) => (
            <li key={item.label}>
              <span>0{index + 1}</span>
              <div>
                <b>{item.label}</b>
                <small>{item.note}</small>
              </div>
              {index < flow.length - 1 && <ArrowRight aria-hidden="true" size={20} />}
            </li>
          ))}
        </ol>
      </section>

      <section className="trust-statement" id="trust">
        <div aria-hidden="true" className="trust-radar">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">Intelligence that earns interruption</p>
        <h2>
          Evidence before certainty.
          <br />
          Context before <em>consequence.</em>
          <br />
          Silence before noise.
        </h2>
        <p>
          Every verdict shows what happened, why it matters to your project, what protects you, what
          remains uncertain, and what to do next.
        </p>
        <a className="button button--light" href="/console">
          Open your intelligence workspace <ArrowRight aria-hidden="true" size={17} />
        </a>
      </section>

      <footer className="landing-footer">
        <Brand />
        <p>Know what every technology shift means for your project.</p>
        <span>Evidence-bound consequence intelligence</span>
      </footer>
    </main>
  );
}
