"use client";

import { ArrowRight, CircleAlert, LockKeyhole, Mail } from "lucide-react";
import { useMemo, useState } from "react";

import { conseraApi, ConseraApiError } from "../lib/api";
import { Brand, ConseraMark } from "./brand";

function safeDestination(): "/" | "/console" {
  if (typeof window === "undefined") return "/";
  return new URLSearchParams(window.location.search).get("next") === "/console" ? "/console" : "/";
}

export function AccessGate() {
  const destination = useMemo(safeDestination, []);
  const [error, setError] = useState("");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/u.test(passcode)) {
      setError("Enter the four-digit passkey from your invitation.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await conseraApi.unlockAccess(passcode);
      window.location.replace(destination);
    } catch (caught) {
      setError(
        caught instanceof ConseraApiError && caught.code === "ACCESS_RATE_LIMITED"
          ? "Too many attempts. Wait one minute, then try again."
          : "That passkey was not accepted. Check the code and try again.",
      );
      setPasscode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="access-page" id="main-content">
      <div aria-hidden="true" className="grain" />
      <div aria-hidden="true" className="access-radar">
        <i />
        <i />
        <i />
        <ConseraMark />
      </div>

      <header className="access-header">
        <Brand />
        <span>
          <LockKeyhole aria-hidden="true" size={15} />
          Protected workspace
        </span>
      </header>

      <section className="access-panel" aria-labelledby="access-title">
        <p className="eyebrow">Private review access</p>
        <h1 id="access-title">Enter the signal room.</h1>
        <p className="access-introduction">
          Consera uses live Snowflake resources. This short access check keeps the workspace
          available for invited reviewers.
        </p>

        <form onSubmit={(event) => void unlock(event)}>
          <label htmlFor="access-passcode">Four-digit passkey</label>
          <div className="access-input-row">
            <input
              aria-describedby="access-help"
              autoComplete="one-time-code"
              autoFocus
              id="access-passcode"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setPasscode(event.target.value.replace(/\D/gu, "").slice(0, 4))}
              pattern="[0-9]{4}"
              placeholder="••••"
              type="password"
              value={passcode}
            />
            <button className="button" disabled={submitting || passcode.length !== 4} type="submit">
              <span>{submitting ? "Checking" : "Open Consera"}</span>
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
          <p id="access-help">Use the passkey included in your private judging invitation.</p>
          {error && (
            <div className="form-error" role="alert">
              <CircleAlert aria-hidden="true" size={18} />
              <span>{error}</span>
            </div>
          )}
        </form>

        <footer>
          <Mail aria-hidden="true" size={19} />
          <p>
            Did not receive the four-digit passkey? Contact owner GrimNej at{" "}
            <a href="mailto:ginej.neupane@grimnej.com">ginej.neupane@grimnej.com</a>.
          </p>
        </footer>
      </section>

      <p className="access-footnote">
        The passkey is checked at the Cloudflare edge and is never included in this page.
      </p>
    </main>
  );
}
