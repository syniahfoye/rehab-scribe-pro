import { extractFactsFromTranscript } from "../../shared/extraction";
import { rehabSciIrfAssessmentTemplate } from "../../shared/templates";
import type { ExtractedFact } from "../../shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSpeechCaption } from "./useSpeechCaption";

type Encounter = {
  id: string;
  status: string;
  consentVerified?: boolean;
  discipline?: string;
  draft?: {
    narrative: string;
    missingRequiredFields: string[];
    lowConfidenceFields: string[];
    extractedFacts: ExtractedFact[];
  };
};

type ConversationHistoryItem = {
  id: string;
  patientId: string;
  encounterId: string;
  clinicianId: string;
  discipline: string;
  text: string;
  timestamp: string;
};

const apiBase = import.meta.env.VITE_API_ORIGIN
  ? `${import.meta.env.VITE_API_ORIGIN.replace(/\/$/, "")}/api`
  : "/api";

const baseHeaders = {
  "x-user-role": "nurse",
  "x-mfa-verified": "true"
};

const DEMO_TRANSCRIPT = `Patient name is Alex Rivera. Date of birth 03/15/1990. MRN ABC12345. Blood pressure 122 over 78, heart rate 74, respiratory rate 16, temperature 98.4, sat 96 on room air.
T12 spinal cord injury, ASIA B. Spasticity increased in legs. Autonomic dysreflexia education given.
Lungs clear. Secretions thin. Incentive spirometry every hour while awake. Cough assist reviewed.
No edema. DVT prophylaxis with enoxaparin. Blood pressure management per protocol.
Stage 1 sacral redness. Turning every two hours.
Bowel program every other night, last bowel movement yesterday. Intermittent catheterization every four hours. No UTI symptoms.
Wheelchair for mobility, transfers require moderate assist. FIM scoring discussed with therapy.
Fall risk high, bed alarm on. Call light within reach.
Mood anxious but engaged. Family at bedside and supportive.
PICC line placed Monday. No drains.
Spinal cord injury education and discharge barriers discussed including equipment and home access.`;

function factMap(facts: ExtractedFact[]): Map<string, ExtractedFact> {
  return new Map(facts.map((f) => [f.fieldId, f]));
}

function formatFieldValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function fieldKeywords(label: string, hint?: string): string[] {
  const source = `${label} ${hint ?? ""}`.toLowerCase();
  const stopWords = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "while"]);
  return Array.from(
    new Set(
      source
        .split(/[^a-z0-9]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopWords.has(w))
    )
  );
}

type GuidedTarget = {
  fieldId: string;
  sectionId: string;
  label: string;
  hint?: string;
};

export function App() {
  const [patientId, setPatientId] = useState("rehab-patient-123");
  const [clinicianId, setClinicianId] = useState("nurse-demo-1");
  const [discipline, setDiscipline] = useState("nursing");
  const [historyFilterDiscipline, setHistoryFilterDiscipline] = useState("all");
  const [patientHistory, setPatientHistory] = useState<ConversationHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [audioHint, setAudioHint] = useState(DEMO_TRANSCRIPT);
  const [message, setMessage] = useState("Start an encounter, verify consent, then use live listening or edit the transcript.");
  const [previewFacts, setPreviewFacts] = useState<ExtractedFact[]>([]);
  const [openSection, setOpenSection] = useState<string | null>(rehabSciIrfAssessmentTemplate.sections[0]?.id ?? null);
  const [manualFieldEdits, setManualFieldEdits] = useState<Record<string, string>>({});
  const [confirmedFieldIds, setConfirmedFieldIds] = useState<Record<string, true>>({});
  const [guidedCaptureOn, setGuidedCaptureOn] = useState(true);
  const [guidedCursor, setGuidedCursor] = useState(0);
  const [reviewCursor, setReviewCursor] = useState(-1);
  const [activeReviewFieldId, setActiveReviewFieldId] = useState<string | null>(null);
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const audioHintRef = useRef(audioHint);
  useEffect(() => {
    audioHintRef.current = audioHint;
  }, [audioHint]);

  const speech = useSpeechCaption({
    getBaseline: () => audioHintRef.current,
    setLiveTranscript: setAudioHint
  });

  async function loadPatientHistory(targetPatientId: string) {
    const trimmed = targetPatientId.trim();
    if (!trimmed) {
      setPatientHistory([]);
      setSelectedHistoryId(null);
      setAudioHint("");
      return;
    }
    setHistoryLoading(true);
    try {
      const query = historyFilterDiscipline === "all" ? "" : `?discipline=${encodeURIComponent(historyFilterDiscipline)}`;
      const res = await fetch(`${apiBase}/patients/${encodeURIComponent(trimmed)}/history${query}`, {
        headers: { ...baseHeaders, "x-user-id": clinicianId }
      });
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: ConversationHistoryItem[] };
      const entries = data.entries ?? [];
      setPatientHistory(entries);
      if (entries.length > 0) {
        const latest = entries[entries.length - 1];
        setSelectedHistoryId(latest.id);
        setAudioHint(latest.text);
        setMessage(`Loaded ${entries.length} saved conversation entr${entries.length === 1 ? "y" : "ies"} for patient ${trimmed}.`);
      } else {
        setSelectedHistoryId(null);
        setAudioHint("");
        setMessage(`No saved conversation history for patient ${trimmed} yet.`);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadPatientHistory(patientId);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [historyFilterDiscipline, patientId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPreviewFacts(extractFactsFromTranscript(audioHint));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [audioHint]);

  const displayFacts = useMemo(() => {
    if (encounter?.draft?.extractedFacts?.length) {
      return encounter.draft.extractedFacts;
    }
    return previewFacts;
  }, [encounter?.draft, previewFacts]);

  const factsById = useMemo(() => factMap(displayFacts), [displayFacts]);
  const lowConfidence = useMemo(() => {
    const fromServer = encounter?.draft?.lowConfidenceFields;
    const base = fromServer?.length
      ? new Set(fromServer)
      : new Set(previewFacts.filter((f) => f.confidence < 0.75).map((f) => f.fieldId));
    Object.keys(manualFieldEdits).forEach((fieldId) => {
      if (manualFieldEdits[fieldId]?.trim()) {
        base.delete(fieldId);
      }
    });
    return base;
  }, [encounter?.draft?.lowConfidenceFields, manualFieldEdits, previewFacts]);

  const requiredFieldIds = useMemo(
    () =>
      rehabSciIrfAssessmentTemplate.sections.flatMap((section) =>
        section.fields.filter((field) => field.required).map((field) => field.id)
      ),
    []
  );
  const currentFieldValues = useMemo(() => {
    const values = new Map<string, string>();
    displayFacts.forEach((fact) => {
      const text = formatFieldValue(fact.value).trim();
      if (text) values.set(fact.fieldId, text);
    });
    Object.entries(manualFieldEdits).forEach(([fieldId, value]) => {
      const text = value.trim();
      if (text) values.set(fieldId, text);
    });
    return values;
  }, [displayFacts, manualFieldEdits]);
  const currentMissingRequired = useMemo(
    () => requiredFieldIds.filter((fieldId) => !currentFieldValues.has(fieldId)),
    [currentFieldValues, requiredFieldIds]
  );

  const canSignOff = useMemo(() => {
    if (!encounter) return false;
    return currentMissingRequired.length === 0;
  }, [currentMissingRequired, encounter]);
  const missingRequiredCount = encounter?.draft?.missingRequiredFields.length ?? 0;
  const missingRequiredDisplayCount = encounter ? currentMissingRequired.length : missingRequiredCount;
  const lowConfidenceCount = lowConfidence.size;
  const guidedTargets = useMemo<GuidedTarget[]>(
    () =>
      rehabSciIrfAssessmentTemplate.sections.flatMap((section) =>
        section.fields.map((field) => ({
          fieldId: field.id,
          sectionId: section.id,
          label: field.label,
          hint: field.hint
        }))
      ),
    []
  );
  const lowConfidenceReviewTargets = useMemo(
    () =>
      rehabSciIrfAssessmentTemplate.sections.flatMap((section) =>
        section.fields
          .filter((field) => lowConfidence.has(field.id))
          .map((field) => ({ fieldId: field.id, label: field.label, sectionId: section.id }))
      ),
    [lowConfidence]
  );

  function focusField(fieldId: string, sectionId: string) {
    setOpenSection(sectionId);
    setActiveReviewFieldId(fieldId);
    window.requestAnimationFrame(() => {
      const target = fieldInputRefs.current[fieldId];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    });
  }

  useEffect(() => {
    if (!activeReviewFieldId) return;
    if (!lowConfidence.has(activeReviewFieldId)) {
      setActiveReviewFieldId(null);
      setReviewCursor(-1);
    }
  }, [activeReviewFieldId, lowConfidence]);

  function reviewNextLowConfidenceField() {
    if (lowConfidenceReviewTargets.length === 0) {
      setMessage("No low-confidence fields to review right now.");
      return;
    }

    const nextIndex = (reviewCursor + 1) % lowConfidenceReviewTargets.length;
    const nextTarget = lowConfidenceReviewTargets[nextIndex];

    setReviewCursor(nextIndex);
    focusField(nextTarget.fieldId, nextTarget.sectionId);
    setMessage(`Review ${nextIndex + 1}/${lowConfidenceReviewTargets.length}: ${nextTarget.label}`);
  }

  function confirmField(fieldId: string) {
    setConfirmedFieldIds((prev) => ({ ...prev, [fieldId]: true }));
    setMessage("Field confirmed.");
    const currentTarget = guidedTargets[guidedCursor];
    if (guidedCaptureOn && currentTarget?.fieldId === fieldId) {
      const nextCursor = Math.min(guidedCursor + 1, guidedTargets.length - 1);
      setGuidedCursor(nextCursor);
      const nextTarget = guidedTargets[nextCursor];
      if (nextTarget) {
        focusField(nextTarget.fieldId, nextTarget.sectionId);
      }
    }
  }

  useEffect(() => {
    if (!guidedCaptureOn || !speech.listening) return;
    const currentTarget = guidedTargets[guidedCursor];
    if (currentTarget) {
      focusField(currentTarget.fieldId, currentTarget.sectionId);
      setMessage(`Guided capture active: ${currentTarget.label}`);
    }
  }, [guidedCaptureOn, guidedCursor, guidedTargets, speech.listening]);

  useEffect(() => {
    if (!guidedCaptureOn || !speech.listening || !speech.caption?.trim()) return;
    const spoken = speech.caption.toLowerCase();
    let bestIdx: number | null = null;
    let bestScore = 0;
    guidedTargets.forEach((target, idx) => {
      const score = fieldKeywords(target.label, target.hint).reduce((acc, keyword) => acc + (spoken.includes(keyword) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx !== null && bestScore > 0) {
      const nextTarget = guidedTargets[bestIdx];
      setGuidedCursor(bestIdx);
      focusField(nextTarget.fieldId, nextTarget.sectionId);
      setMessage(`Detected topic: ${nextTarget.label}. Capture and confirm when ready.`);
    }
  }, [guidedCaptureOn, guidedTargets, speech.caption, speech.listening]);

  function advanceGuidedField() {
    const nextCursor = Math.min(guidedCursor + 1, guidedTargets.length - 1);
    setGuidedCursor(nextCursor);
    const nextTarget = guidedTargets[nextCursor];
    if (nextTarget) {
      focusField(nextTarget.fieldId, nextTarget.sectionId);
      setMessage(`Next field: ${nextTarget.label}`);
    }
  }

  async function runStep(path: string, method: "POST" = "POST", body?: unknown, role: "nurse" | "physician" = "nurse"): Promise<boolean> {
    if (!encounter && !path.endsWith("/start")) return false;

    const target = path.endsWith("/start") ? `${apiBase}${path}` : `${apiBase}/encounters/${encounter?.id}${path}`;
    try {
      const res = await fetch(target, {
        method,
        headers: { ...baseHeaders, "Content-Type": "application/json", "x-user-role": role, "x-user-id": clinicianId },
        body: body ? JSON.stringify(body) : undefined
      });

      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        setMessage(`Request failed (${res.status}). The API did not return JSON.`);
        return false;
      }

      if (!res.ok) {
        const err = data.error;
        setMessage(typeof err === "string" ? err : "Request failed");
        return false;
      }

      setEncounter((data.updated ?? data) as Encounter);
      if (path.endsWith("/start")) {
        setManualFieldEdits({});
        setConfirmedFieldIds({});
        setActiveReviewFieldId(null);
        setReviewCursor(-1);
        setGuidedCursor(0);
      }
      if (path.endsWith("/transcribe")) {
        void loadPatientHistory(patientId);
      }
      setMessage(`Step complete: ${path}`);
      return true;
    } catch (e) {
      const hint = import.meta.env.VITE_API_ORIGIN
        ? "Check VITE_API_ORIGIN and that the API is reachable (TLS/CORS/network)."
        : "Start the API on port 8080 in another terminal: cd backend && npm run dev";
      setMessage(`Connection failed (${e instanceof Error ? e.message : "unknown error"}). ${hint}`);
      return false;
    }
  }

  async function generateDraftFlow() {
    if (!encounter) {
      setMessage("Start an encounter first.");
      return;
    }
    if (!encounter.consentVerified) {
      const consentOk = await runStep("/consent");
      if (!consentOk) return;
    }
    const transcribeOk = await runStep("/transcribe", "POST", { audioHint });
    if (!transcribeOk) return;
    await runStep("/draft");
  }

  return (
    <main className="container layout-wide">
      <header className="page-header">
        <div className="page-header-copy">
          <h1>Secure Documentation Rehab Scribe Pro</h1>
          <p className="subtitle">SCI / IRF clinical documentation dashboard with live transcript mapping</p>
        </div>
        <div className="page-header-meta">
          <span className="meta-pill">Patient: {patientId}</span>
          {encounter ? <span className="meta-pill">Status: {encounter.status}</span> : <span className="meta-pill">No active encounter</span>}
        </div>
      </header>

      <section className="kpi-grid" aria-label="Encounter dashboard metrics">
        <article className="kpi-card">
          <p className="kpi-label">Encounter</p>
          <p className="kpi-value">{encounter ? "Active" : "Not started"}</p>
          <p className="kpi-sub">{encounter ? encounter.id : "Start encounter to begin workflow"}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Mapped fields</p>
          <p className="kpi-value">{displayFacts.length}</p>
          <p className="kpi-sub">{previewFacts.length} detected from live transcript</p>
        </article>
        <article className={`kpi-card ${missingRequiredDisplayCount > 0 ? "kpi-warning" : "kpi-good"}`}>
          <p className="kpi-label">Required missing</p>
          <p className="kpi-value">{missingRequiredDisplayCount}</p>
          <p className="kpi-sub">{missingRequiredDisplayCount === 0 ? "Ready for sign-off" : "Complete required items"}</p>
        </article>
        <button
          type="button"
          className={`kpi-card kpi-card-button ${lowConfidenceCount > 0 ? "kpi-warning" : "kpi-good"}`}
          onClick={reviewNextLowConfidenceField}
          disabled={lowConfidenceCount === 0}
          title={
            lowConfidenceCount > 0
              ? "Jump to each low-confidence field for review"
              : "No low-confidence fields to review"
          }
        >
          <p className="kpi-label">Confidence alerts</p>
          <p className="kpi-value">{lowConfidenceCount}</p>
          <p className="kpi-sub">{lowConfidenceCount === 0 ? "No review flags" : "Review highlighted fields"}</p>
        </button>
      </section>

      <div className="grid-two">
        <section className="panel">
          <h2>Encounter</h2>
          <label>
            Patient ID (account)
            <input
              value={patientId}
              onChange={(e) => {
                const nextPatientId = e.target.value;
                setPatientId(nextPatientId);
                setEncounter(null);
                setAudioHint("");
                setPatientHistory([]);
                setSelectedHistoryId(null);
                setManualFieldEdits({});
                setConfirmedFieldIds({});
                setActiveReviewFieldId(null);
                setReviewCursor(-1);
                setGuidedCursor(0);
              }}
            />
          </label>
          <div className="grid-inline">
            <label>
              Clinician ID
              <input value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} />
            </label>
            <label>
              Current discipline
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                <option value="nursing">Nursing</option>
                <option value="ot">OT</option>
                <option value="pt">PT</option>
                <option value="rt">RT</option>
                <option value="physician">Physician</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button
              onClick={() =>
                runStep("/encounters/start", "POST", {
                  patientId,
                  clinicianId,
                  discipline,
                  templateId: "rehab_sci_irf_assessment_v1"
                })
              }
            >
              Start encounter
            </button>
            <button disabled={!encounter} onClick={() => runStep("/consent")}>
              Verify consent
            </button>
            <button disabled={!encounter} onClick={() => runStep("/transcribe", "POST", { audioHint })}>
              Save transcript
            </button>
            <button disabled={!encounter} onClick={() => void generateDraftFlow()}>
              Generate draft
            </button>
          </div>

          <h3>Conversation (typed or dictated)</h3>
          <div className="history-head">
            <h4>Patient conversation history</h4>
            <label className="history-filter">
              Filter
              <select value={historyFilterDiscipline} onChange={(e) => setHistoryFilterDiscipline(e.target.value)}>
                <option value="all">All disciplines</option>
                <option value="nursing">Nursing</option>
                <option value="ot">OT</option>
                <option value="pt">PT</option>
                <option value="rt">RT</option>
                <option value="physician">Physician</option>
              </select>
            </label>
          </div>
          <div className="history-box">
            {historyLoading ? (
              <p className="muted small">Loading history...</p>
            ) : patientHistory.length === 0 ? (
              <p className="muted small">No saved conversation history for this patient yet.</p>
            ) : (
              patientHistory.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`history-item ${selectedHistoryId === entry.id ? "history-item-selected" : ""}`}
                  onClick={() => {
                    setSelectedHistoryId(entry.id);
                    setAudioHint(entry.text);
                    setMessage(`Loaded conversation by ${entry.clinicianId} (${entry.discipline.toUpperCase()}).`);
                  }}
                >
                  <p className="history-meta">
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    <span>{entry.discipline.toUpperCase()}</span>
                    <span>{entry.clinicianId}</span>
                  </p>
                  <p className="history-text">{entry.text}</p>
                </button>
              ))
            )}
          </div>
          <p className="help">
            Sections update from this text within about half a second.{" "}
            <strong>Start listening</strong> uses browser speech recognition, and <strong>Save transcript</strong> stores this note under
            the current patient/clinician history.
          </p>
          <textarea
            className="transcript"
            value={audioHint}
            onChange={(e) => setAudioHint(e.target.value)}
            rows={14}
            spellCheck
          />

          <div className="actions mic-row">
            {!speech.supported ? (
              <span className="muted">Speech recognition is not available in this browser. Type or paste the visit instead.</span>
            ) : speech.listening ? (
              <>
                <button type="button" className="btn-danger" onClick={() => speech.stop()}>
                  Stop listening
                </button>
                <span className="caption" aria-live="polite">
                  {speech.caption ? `Hearing: ${speech.caption}` : "Listening… keep talking; words appear as you go."}
                </span>
              </>
            ) : (
              <button type="button" onClick={() => speech.start()}>
                Start listening
              </button>
            )}
          </div>
          <div className="actions guided-row">
            <button type="button" onClick={() => setGuidedCaptureOn((v) => !v)}>
              {guidedCaptureOn ? "Guided capture on" : "Guided capture off"}
            </button>
            <button type="button" disabled={!guidedCaptureOn} onClick={advanceGuidedField}>
              Next documentation field
            </button>
            <span className="muted small">
              Target: {guidedTargets[guidedCursor]?.label ?? "None"}
            </span>
          </div>
          {speech.speechError ? <p className="speech-error">{speech.speechError}</p> : null}

          <div className="actions">
            <button
              disabled={!canSignOff}
              onClick={() =>
                runStep("/signoff", "POST", {
                  manualFieldEdits: Object.fromEntries(
                    Object.entries(manualFieldEdits).filter(([, value]) => value.trim())
                  )
                })
              }
            >
              Sign off
            </button>
            <button onClick={() => runStep("/export", "POST", undefined, "physician")}>
              Export
            </button>
          </div>

          <h3>Workflow status</h3>
          <p className="status-line">{message}</p>
          {encounter && (
            <p className="muted small">
              Encounter <code>{encounter.id}</code> · {encounter.status}
            </p>
          )}
        </section>

        <section className="panel assessment-panel">
          <div className="assessment-head">
            <h2>Assessment (preview)</h2>
            <p className="muted small">
              {displayFacts.length} mapped fields · {previewFacts.length} live from transcript
              {encounter?.draft ? ` · server draft: ${encounter.draft.extractedFacts.length} facts` : ""}
            </p>
            <p className="muted small">You can manually edit any field below during clinical review.</p>
          </div>

          <div className="accordion">
            {rehabSciIrfAssessmentTemplate.sections.map((section) => {
              const open = openSection === section.id;
              return (
                <div key={section.id} className="accordion-item">
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={open}
                    onClick={() => setOpenSection(open ? null : section.id)}
                  >
                    <span className="accordion-title-row">
                      <span className="accordion-title">{section.title}</span>
                      <span className="chevron" aria-hidden>
                        {open ? "▼" : "▶"}
                      </span>
                    </span>
                    {section.subtitle ? <span className="accordion-sub">{section.subtitle}</span> : null}
                  </button>
                  {open && (
                    <div className="accordion-body">
                      <div className="field-grid">
                        {section.fields.map((field) => {
                          const fact = factsById.get(field.id);
                          const valueText = manualFieldEdits[field.id] ?? (fact ? formatFieldValue(fact.value) : "");
                          const warn = lowConfidence.has(field.id);
                          const missing = currentMissingRequired.includes(field.id);
                          const manuallyEdited = manualFieldEdits[field.id] !== undefined;
                          const confirmed = Boolean(confirmedFieldIds[field.id]);
                          return (
                            <label
                              key={field.id}
                              className={`field-cell ${missing ? "field-missing" : ""} ${
                                activeReviewFieldId === field.id ? "field-review-active" : ""
                              }`}
                            >
                              <span className="field-label">
                                {field.label}
                                {field.required ? <span className="req"> *</span> : null}
                                {warn ? <span className="badge-warn">review</span> : null}
                                {missing ? <span className="badge-missing">required</span> : null}
                                {manuallyEdited ? <span className="badge-edited">edited</span> : null}
                                {confirmed ? <span className="badge-confirmed">confirmed</span> : null}
                              </span>
                              {field.hint ? <span className="field-hint">{field.hint}</span> : null}
                              <input
                                value={valueText}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setManualFieldEdits((prev) => {
                                    const next = { ...prev };
                                    if (!nextValue.trim()) delete next[field.id];
                                    else next[field.id] = nextValue;
                                    return next;
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && lowConfidenceReviewTargets.length > 0) {
                                    e.preventDefault();
                                    reviewNextLowConfidenceField();
                                  }
                                }}
                                placeholder={field.required ? "Say or type details — maps here when heard" : "Optional — maps when mentioned"}
                                ref={(node) => {
                                  fieldInputRefs.current[field.id] = node;
                                }}
                              />
                              {manuallyEdited ? (
                                <span className="evidence">
                                  Manual entry captured · confidence 100%
                                </span>
                              ) : fact?.evidence ? (
                                <span className="evidence">
                                  Heard: <em>{fact.evidence}</em> · confidence {(fact.confidence * 100).toFixed(0)}%
                                </span>
                              ) : null}
                              <div className="field-actions">
                                <button
                                  type="button"
                                  className="btn-confirm"
                                  disabled={!valueText.trim()}
                                  onClick={() => confirmField(field.id)}
                                >
                                  Confirm entry
                                </button>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {encounter?.draft?.narrative && (
            <div className="narrative-box">
              <h3>Draft narrative</h3>
              <p>{encounter.draft.narrative}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
