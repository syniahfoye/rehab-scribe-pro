import { extractFactsFromTranscript } from "../../shared/extraction";
import { rehabSciIrfAssessmentTemplate } from "../../shared/templates";
import type { ExtractedFact } from "../../shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSpeechCaption } from "./useSpeechCaption";

type Encounter = {
  id: string;
  status: string;
  draft?: {
    narrative: string;
    missingRequiredFields: string[];
    lowConfidenceFields: string[];
    extractedFacts: ExtractedFact[];
  };
};

const apiBase = import.meta.env.VITE_API_ORIGIN
  ? `${import.meta.env.VITE_API_ORIGIN.replace(/\/$/, "")}/api`
  : "/api";

const headers = {
  "Content-Type": "application/json",
  "x-user-role": "nurse",
  "x-user-id": "nurse-demo-1",
  "x-mfa-verified": "true"
};

/** For FormData uploads do not set Content-Type (browser sets multipart boundary). */
const headersMultipart: HeadersInit = {
  "x-user-role": "nurse",
  "x-user-id": "nurse-demo-1",
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
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [audioHint, setAudioHint] = useState(DEMO_TRANSCRIPT);
  const [message, setMessage] = useState("Start an encounter, verify consent, then use live listening or edit the transcript.");
  const [previewFacts, setPreviewFacts] = useState<ExtractedFact[]>([]);
  const [openSection, setOpenSection] = useState<string | null>(rehabSciIrfAssessmentTemplate.sections[0]?.id ?? null);
  const [openaiOnServer, setOpenaiOnServer] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [manualFieldEdits, setManualFieldEdits] = useState<Record<string, string>>({});
  const [confirmedFieldIds, setConfirmedFieldIds] = useState<Record<string, true>>({});
  const [guidedCaptureOn, setGuidedCaptureOn] = useState(true);
  const [guidedCursor, setGuidedCursor] = useState(0);
  const [reviewCursor, setReviewCursor] = useState(-1);
  const [activeReviewFieldId, setActiveReviewFieldId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const audioHintRef = useRef(audioHint);
  useEffect(() => {
    audioHintRef.current = audioHint;
  }, [audioHint]);

  const speech = useSpeechCaption({
    getBaseline: () => audioHintRef.current,
    setLiveTranscript: setAudioHint
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/speech/status`)
      .then((r) => r.json())
      .then((d: { openaiConfigured?: boolean }) => {
        if (!cancelled) setOpenaiOnServer(Boolean(d.openaiConfigured));
      })
      .catch(() => {
        if (!cancelled) setOpenaiOnServer(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function runStep(path: string, method: "POST" = "POST", body?: unknown, role: "nurse" | "physician" = "nurse") {
    if (!encounter && !path.endsWith("/start")) return;

    const target = path.endsWith("/start") ? `${apiBase}${path}` : `${apiBase}/encounters/${encounter?.id}${path}`;
    try {
      const res = await fetch(target, {
        method,
        headers: { ...headers, "x-user-role": role },
        body: body ? JSON.stringify(body) : undefined
      });

      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        setMessage(`Request failed (${res.status}). The API did not return JSON.`);
        return;
      }

      if (!res.ok) {
        const err = data.error;
        setMessage(typeof err === "string" ? err : "Request failed");
        return;
      }

      setEncounter((data.updated ?? data) as Encounter);
      if (path.endsWith("/start")) {
        setManualFieldEdits({});
        setConfirmedFieldIds({});
        setActiveReviewFieldId(null);
        setReviewCursor(-1);
        setGuidedCursor(0);
      }
      setMessage(`Step complete: ${path}`);
    } catch (e) {
      const hint = import.meta.env.VITE_API_ORIGIN
        ? "Check VITE_API_ORIGIN and that the API is reachable (TLS/CORS/network)."
        : "Start the API on port 8080 in another terminal: cd backend && npm run dev";
      setMessage(`Connection failed (${e instanceof Error ? e.message : "unknown error"}). ${hint}`);
    }
  }

  async function startMediaRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
      };
      rec.start(400);
      mediaRecorderRef.current = rec;
      setRecording(true);
      setMessage("Recording… click Stop, then Send to server.");
    } catch (e) {
      setMessage(`Microphone error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  function stopMediaRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.requestData();
    }
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setRecording(false);
    setMessage("Recording stopped. Click Send to server to transcribe.");
  }

  async function transcribeRecordingOnServer() {
    if (mediaChunksRef.current.length === 0) {
      setMessage("No recording in memory. Press Start recording, speak, then Stop.");
      return;
    }
    const blob = new Blob(mediaChunksRef.current, {
      type: mediaChunksRef.current[0]?.type || "audio/webm"
    });
    if (blob.size < 200) {
      setMessage("Recording is too short to transcribe.");
      return;
    }
    mediaChunksRef.current = [];
    const fd = new FormData();
    fd.append("file", blob, "visit.webm");
    setTranscribing(true);
    setMessage("Sending audio to your API for transcription…");
    try {
      const res = await fetch(`${apiBase}/speech/transcribe`, {
        method: "POST",
        headers: headersMultipart,
        body: fd
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setMessage(data.error || `Transcription failed (${res.status})`);
        return;
      }
      const text = data.text?.trim();
      if (text) {
        setAudioHint((prev) => (prev.trimEnd() ? `${prev.trimEnd()}\n\n` : "") + text);
        setMessage("Transcription added under your conversation text.");
      } else {
        setMessage("Transcription returned no text.");
      }
    } catch (e) {
      setMessage(`Transcription request failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setTranscribing(false);
    }
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
            <input value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          </label>
          <div className="actions">
            <button
              onClick={() =>
                runStep("/encounters/start", "POST", {
                  patientId,
                  clinicianId: "nurse-demo-1",
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
            <button disabled={!encounter} onClick={() => runStep("/draft")}>
              Generate draft
            </button>
          </div>

          <h3>Conversation (typed or dictated)</h3>
          <p className="help">
            Sections update from this text within about half a second.{" "}
            <strong>Start listening</strong> uses Google (often blocked on hospital Wi‑Fi).{" "}
            <strong>Record &amp; transcribe</strong> sends audio to the API running on your machine, then to OpenAI if you
            set OPENAI_API_KEY (see below).
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
          {speech.speechError ? (
            <p className="help server-speech-hint">
              Use <strong>Record &amp; transcribe</strong> below so audio goes to your app server instead of Google
              Chrome speech.
            </p>
          ) : null}

          <div id="server-transcribe" className="server-transcribe">
            <h3>Record &amp; transcribe (server)</h3>
            <p className="help">
              {openaiOnServer === null && "Checking server…"}
              {openaiOnServer === false &&
                "The API does not have OPENAI_API_KEY set. Add it to the backend environment and restart: export OPENAI_API_KEY=sk-... then npm run dev."}
              {openaiOnServer === true &&
                "OpenAI Whisper is configured on the server. Audio is sent to your API, then to OpenAI (not through Chrome speech). Use a BAA with OpenAI for PHI."}
            </p>
            <div className="actions">
              <button type="button" disabled={recording || transcribing} onClick={() => void startMediaRecording()}>
                Start recording
              </button>
              <button type="button" className="btn-danger" disabled={!recording || transcribing} onClick={stopMediaRecording}>
                Stop recording
              </button>
              <button type="button" disabled={transcribing || recording} onClick={() => void transcribeRecordingOnServer()}>
                {transcribing ? "Transcribing…" : "Send to server (Whisper)"}
              </button>
            </div>
          </div>

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
