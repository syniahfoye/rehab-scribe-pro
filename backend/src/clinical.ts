import { extractFactsFromTranscript } from "../../shared/extraction.js";
import { rehabSciIrfAssessmentTemplate, type TemplateField } from "../../shared/templates.js";
import type { DraftNote, ExtractedFact } from "../../shared/types.js";

export const transcribeAudio = async (audioHint: string): Promise<string> => {
  return `Patient encounter transcript: ${audioHint}`;
};

export const extractFacts = (transcript: string): ExtractedFact[] => extractFactsFromTranscript(transcript);

export const buildDraft = (transcript: string): DraftNote => {
  const facts = extractFactsFromTranscript(transcript);
  const requiredFields = rehabSciIrfAssessmentTemplate.sections.flatMap((section) =>
    section.fields.filter((field: TemplateField) => field.required).map((field: TemplateField) => field.id)
  );

  const covered = new Set(facts.map((fact: ExtractedFact) => fact.fieldId));
  const missingRequiredFields = requiredFields.filter((fieldId: string) => !covered.has(fieldId));
  const lowConfidenceFields = facts.filter((fact: ExtractedFact) => fact.confidence < 0.75).map((fact: ExtractedFact) => fact.fieldId);

  const narrative = [
    "SCI / IRF nursing assessment draft generated from encounter transcript.",
    `Structured facts captured: ${facts.length}.`,
    missingRequiredFields.length
      ? `Missing required fields: ${missingRequiredFields.join(", ")}.`
      : "All required fields have a candidate value.",
    lowConfidenceFields.length
      ? `Low confidence fields require review: ${lowConfidenceFields.join(", ")}.`
      : "No low confidence fields detected."
  ].join(" ");

  return {
    narrative,
    extractedFacts: facts,
    missingRequiredFields,
    lowConfidenceFields
  };
};
