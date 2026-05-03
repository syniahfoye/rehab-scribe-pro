export type UserRole = "nurse" | "physician" | "admin" | "auditor";

export type EncounterStatus =
  | "started"
  | "consent_verified"
  | "transcribed"
  | "draft_ready"
  | "signed_off"
  | "exported";

export type ExtractedFact = {
  fieldId: string;
  value: string | number | boolean;
  confidence: number;
  evidence: string;
};

export type DraftNote = {
  narrative: string;
  extractedFacts: ExtractedFact[];
  missingRequiredFields: string[];
  lowConfidenceFields: string[];
};
