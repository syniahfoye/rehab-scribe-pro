import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { buildDraft, transcribeAudio } from "./clinical.js";
import { transcribeWithOpenAIWhisper } from "./openaiTranscribe.js";
import { requireMfaHeader, requireRole } from "./security.js";
import { appendAudit, createEncounter, getEncounter, listAudits, updateEncounter } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const speechUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "secure-rehab-docs-backend" });
});

app.get("/api/speech/status", (_req, res) => {
  res.json({ openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()) });
});

app.post(
  "/api/speech/transcribe",
  requireMfaHeader,
  requireRole("nurse"),
  speechUpload.single("file"),
  async (req, res) => {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      res.status(501).json({
        error:
          "Server transcription is off. Set OPENAI_API_KEY in the backend environment and restart the API (audio goes to OpenAI Whisper, not Google Chrome)."
      });
      return;
    }
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "Missing audio file. Send multipart field name: file" });
      return;
    }
    try {
      const text = await transcribeWithOpenAIWhisper({
        buffer: file.buffer,
        filename: file.originalname || "visit.webm",
        mimeType: file.mimetype || "audio/webm"
      });
      if (!text) {
        res.status(422).json({ error: "Transcription returned empty text." });
        return;
      }
      res.json({ text });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : "Transcription failed" });
    }
  }
);

const startSchema = z.object({
  patientId: z.string().min(1),
  clinicianId: z.string().min(1),
  templateId: z.string().default("rehab_sci_irf_assessment_v1")
});

app.post("/api/encounters/start", requireMfaHeader, requireRole("nurse"), (req, res) => {
  const input = startSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.flatten() });
    return;
  }

  const encounter = createEncounter(input.data);
  appendAudit({ encounterId: encounter.id, action: "encounter_started", actor: input.data.clinicianId });
  res.status(201).json(encounter);
});

app.post("/api/encounters/:id/consent", requireMfaHeader, requireRole("nurse"), (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  const updated = updateEncounter(encounter.id, { consentVerified: true, status: "consent_verified" });
  appendAudit({ encounterId: encounter.id, action: "consent_verified", actor: encounter.clinicianId });
  res.json(updated);
});

const transcribeSchema = z.object({
  audioHint: z.string().min(10)
});

app.post("/api/encounters/:id/transcribe", requireMfaHeader, requireRole("nurse"), async (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (!encounter.consentVerified) return res.status(400).json({ error: "Consent must be verified first" });

  const input = transcribeSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.flatten() });
    return;
  }

  const transcript = await transcribeAudio(input.data.audioHint);
  const updated = updateEncounter(encounter.id, { transcript, status: "transcribed" });
  appendAudit({ encounterId: encounter.id, action: "transcribed", actor: encounter.clinicianId });
  res.json(updated);
});

app.post("/api/encounters/:id/draft", requireMfaHeader, requireRole("nurse"), (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (!encounter.transcript) return res.status(400).json({ error: "Transcript required" });

  const draft = buildDraft(encounter.transcript);
  const updated = updateEncounter(encounter.id, { draft, status: "draft_ready" });
  appendAudit({
    encounterId: encounter.id,
    action: "draft_generated",
    actor: encounter.clinicianId,
    metadata: { lowConfidenceFields: draft.lowConfidenceFields }
  });
  res.json(updated);
});

app.post("/api/encounters/:id/signoff", requireMfaHeader, requireRole("nurse"), (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (!encounter.draft) return res.status(400).json({ error: "Draft required" });
  const manualFieldEditsRaw = req.body?.manualFieldEdits;
  const manualFieldEdits: Record<string, string> =
    manualFieldEditsRaw && typeof manualFieldEditsRaw === "object" ? (manualFieldEditsRaw as Record<string, string>) : {};
  const requiredMissingAfterManual = encounter.draft.missingRequiredFields.filter(
    (fieldId) => !String(manualFieldEdits[fieldId] ?? "").trim()
  );
  if (requiredMissingAfterManual.length > 0) {
    return res.status(400).json({ error: "Cannot sign off with missing required fields", missingRequiredFields: requiredMissingAfterManual });
  }

  const signerId = String(req.header("x-user-id") || encounter.clinicianId);
  const updated = updateEncounter(encounter.id, {
    status: "signed_off",
    signedOffBy: signerId,
    draft: { ...encounter.draft, missingRequiredFields: requiredMissingAfterManual }
  });
  appendAudit({ encounterId: encounter.id, action: "signed_off", actor: signerId });
  res.json(updated);
});

app.post("/api/encounters/:id/export", requireMfaHeader, requireRole("physician"), (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (encounter.status !== "signed_off") return res.status(400).json({ error: "Sign-off required before export" });

  const exportedAt = new Date().toISOString();
  const updated = updateEncounter(encounter.id, { status: "exported", exportedAt });
  appendAudit({ encounterId: encounter.id, action: "exported", actor: String(req.header("x-user-id") || "system") });

  res.json({
    encounterId: encounter.id,
    exportedAt,
    format: "FHIR_DocumentReference_stub",
    payload: {
      narrative: encounter.draft?.narrative,
      facts: encounter.draft?.extractedFacts
    },
    updated
  });
});

app.get("/api/encounters/:id/audits", requireMfaHeader, requireRole("auditor"), (req, res) => {
  const encounter = getEncounter(req.params.id);
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  res.json(listAudits(encounter.id));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`secure-rehab-docs-backend listening on ${port}`);
});
