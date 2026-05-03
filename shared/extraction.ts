import type { ExtractedFact } from "./types.js";

type RegexRule = {
  pattern: RegExp;
  fieldId: string;
  confidence: number;
  /** Use capture group 1 as string/number; special "bool_true" for boolean true */
  value: "match1" | "match1_num" | "match1_bool" | "match1_slash_pair" | "static";
  staticValue?: string | boolean;
};

function normalizeTranscript(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1. $2")
    .replace(/\s+/g, " ")
    .replace(
      /\b(patient name is|name is|date of birth is|date of birth|account name is|mrn|blood pressure is|blood pressure|heart rate is|heart rate|respiratory rate is|respiratory rate|temperature is|temperature|weight is|weight|chief complaint is|chief complaint)\b/gi,
      ". $1 "
    )
    .replace(/\.\s+\./g, ". ")
    .trim();
}

function parseNumberToken(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  const words: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12
  };
  if (cleaned in words) return words[cleaned];
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

const regexRules: RegexRule[] = [
  {
    pattern: /(?:patient name is|name is|patient is|i am|call me)\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)+)/,
    fieldId: "patient_legal_name",
    confidence: 0.82,
    value: "match1"
  },
  {
    pattern: /(?:date of birth|d\.?o\.?b\.?|born on)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+\d{1,2}\s+\d{4}|\d{4}\s+\d{4})/i,
    fieldId: "date_of_birth",
    confidence: 0.8,
    value: "match1"
  },
  {
    pattern: /(?:account name|account number|account)\s*(?:is|#|:)?\s*([A-Z0-9\-]{3,})/i,
    fieldId: "mrn",
    confidence: 0.76,
    value: "match1"
  },
  { pattern: /(?:mrn|medical record)\s*[#:]?\s*([A-Z0-9\-]{4,})/i, fieldId: "mrn", confidence: 0.78, value: "match1" },
  { pattern: /blood pressure\s+(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i, fieldId: "vital_bp", confidence: 0.85, value: "match1_slash_pair" },
  { pattern: /(?:bp|blood pressure)\s+(\d{2,3})\/(\d{2,3})/i, fieldId: "vital_bp", confidence: 0.85, value: "match1_slash_pair" },
  { pattern: /(?:heart rate|hr|pulse)\s*(?:is|of)?\s*(\d{2,3})\b/i, fieldId: "vital_hr", confidence: 0.84, value: "match1_num" },
  {
    pattern: /(?:respiratory rate|respirations|rr)\s*(?:is|of)?\s*(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
    fieldId: "vital_rr",
    confidence: 0.83,
    value: "match1_num"
  },
  { pattern: /(?:temp|temperature)\s*(?:is|of)?\s*(\d{2}(?:\.\d)?)\s*(?:f|degrees)?/i, fieldId: "vital_temp_f", confidence: 0.8, value: "match1_num" },
  { pattern: /(?:spo2|sat|oxygen)\s*(?:is|of)?\s*(\d{2,3})\s*%?/i, fieldId: "vital_spo2", confidence: 0.82, value: "match1_num" },
  { pattern: /(?:weight)\s*(?:is|of)?\s*(\d{2,3})\s*(?:pounds|lbs|kg)?/i, fieldId: "weight_kg", confidence: 0.72, value: "match1_num" },
  { pattern: /\b((?:c|t|l|s)\d+)\b/i, fieldId: "neuro_level_of_injury", confidence: 0.86, value: "match1" },
  { pattern: /asia\s*[:\s]*(a|b|c|d|e)\b/i, fieldId: "neuro_asia_grade", confidence: 0.8, value: "match1" },
  { pattern: /(?:spasticity|tone)\s+(?:is|noted|increased|decreased|normal)/i, fieldId: "neuro_spasticity_tone", confidence: 0.74, value: "static", staticValue: "Tone/spasticity discussed in encounter" },
  { pattern: /autonomic dysreflexia|dysreflexia/i, fieldId: "neuro_autonomic_dysreflexia_risk", confidence: 0.76, value: "match1_bool", staticValue: true },
  { pattern: /(?:breath sounds|lungs?)\s+(?:clear|diminished|crackles|wheezes)/i, fieldId: "resp_breath_sounds", confidence: 0.72, value: "static", staticValue: "Respiratory exam language captured" },
  { pattern: /secretions|suction/i, fieldId: "resp_secretions", confidence: 0.7, value: "static", staticValue: "Secretions / airway care discussed" },
  { pattern: /incentive spirometry|spirometry/i, fieldId: "resp_incentive_spirometry", confidence: 0.75, value: "static", staticValue: "Incentive spirometry discussed" },
  { pattern: /cough assist|mechanical insufflation/i, fieldId: "resp_cough_assist", confidence: 0.75, value: "static", staticValue: "Cough assist discussed" },
  { pattern: /edema|pitting/i, fieldId: "cv_edema", confidence: 0.7, value: "static", staticValue: "Edema assessment discussed" },
  { pattern: /dvt prophylaxis|lovenox|heparin|compression stockings/i, fieldId: "cv_dvt_prophylaxis", confidence: 0.74, value: "static", staticValue: "DVT prophylaxis discussed" },
  { pattern: /blood pressure management|antihypertensive/i, fieldId: "cv_bp_management", confidence: 0.7, value: "static", staticValue: "BP management discussed" },
  { pattern: /stage\s*\d|pressure injury|sacral redness|decubitus|wound care/i, fieldId: "skin_pressure_injury_notes", confidence: 0.78, value: "static", staticValue: "Skin / pressure injury findings discussed" },
  { pattern: /turn(?:ing)?\s+(?:q|every)/i, fieldId: "skin_turning_schedule", confidence: 0.72, value: "static", staticValue: "Turning schedule discussed" },
  { pattern: /bowel program|fecal|constipation|last bm|stool/i, fieldId: "gi_bowel_program", confidence: 0.76, value: "static", staticValue: "Bowel program / GI discussed" },
  { pattern: /intermittent catheter|straight cath|foley|suprapubic|bladder program/i, fieldId: "gu_bladder_method", confidence: 0.8, value: "static", staticValue: "Bladder program / catheterization discussed" },
  { pattern: /(?:uti|dysuria|cloudy urine|urgency)/i, fieldId: "gu_uti_symptoms", confidence: 0.72, value: "static", staticValue: "GU / UTI symptoms screened" },
  { pattern: /walker|cane|wheelchair|power chair|slide board|transfer/i, fieldId: "msk_mobility_devices_transfers", confidence: 0.78, value: "static", staticValue: "Mobility / transfers discussed" },
  { pattern: /\bFIM\b|functional independence/i, fieldId: "msk_fim_notes", confidence: 0.74, value: "static", staticValue: "FIM / functional status discussed" },
  { pattern: /fall risk|unsteady|balance/i, fieldId: "safety_fall_risk", confidence: 0.76, value: "static", staticValue: "Fall risk / safety discussed" },
  { pattern: /call light|bed alarm|sitter|one-to-one/i, fieldId: "safety_precautions", confidence: 0.7, value: "static", staticValue: "Safety precautions discussed" },
  { pattern: /mood|anxious|depressed|motivated|frustrated|cognition|memory/i, fieldId: "psych_mood_cognition", confidence: 0.7, value: "static", staticValue: "Psychosocial / cognition discussed" },
  { pattern: /family|support|home situation|caregiver/i, fieldId: "psych_support_system", confidence: 0.7, value: "static", staticValue: "Support system discussed" },
  { pattern: /\bIV\b|PICC|picc|midline|central line/i, fieldId: "lines_iv", confidence: 0.75, value: "static", staticValue: "IV access / lines discussed" },
  { pattern: /ng tube|peg|feeding tube/i, fieldId: "tubes_feeding", confidence: 0.75, value: "static", staticValue: "Feeding tubes discussed" },
  { pattern: /drain|jp\b|hemovac/i, fieldId: "drains", confidence: 0.72, value: "static", staticValue: "Drains discussed" },
  { pattern: /patient education|teach back|discharge plan|follow up|barrier/i, fieldId: "edu_discharge_planning", confidence: 0.74, value: "static", staticValue: "Education / discharge planning discussed" },
  { pattern: /pain\s*(?:score|level|rating)?\s*(?:is|of)?\s*(\d{1,2})\b/i, fieldId: "pain_score", confidence: 0.82, value: "match1_num" },
  {
    pattern: /spinal cord injury|SCI\b|paraplegia|quadriplegia|tetraplegia/i,
    fieldId: "chief_complaint",
    confidence: 0.82,
    value: "static",
    staticValue: "Spinal cord injury rehabilitation"
  },
  { pattern: /complaint|main issue|here for|admitted for/i, fieldId: "chief_complaint", confidence: 0.7, value: "static", staticValue: "Primary concern discussed (see transcript)" }
];

function resolveValue(rule: RegexRule, match: RegExpMatchArray): string | number | boolean {
  if (rule.value === "static") {
    return rule.staticValue as string | boolean;
  }
  if (rule.value === "match1_num") {
    return parseNumberToken(match[1] || "0");
  }
  if (rule.value === "match1_bool") {
    return true;
  }
  if (rule.value === "match1_slash_pair") {
    return `${match[1]}/${match[2]}`;
  }
  if (rule.value === "match1") {
    const raw = match[1] || match[0];
    if (rule.fieldId === "neuro_asia_grade") {
      return `ASIA ${String(match[1]).toUpperCase()}`;
    }
    if (rule.fieldId === "neuro_level_of_injury") {
      return String(raw).toUpperCase();
    }
    return String(raw).trim();
  }
  return match[0];
}

/** Pull structured facts from free text (demo-grade keyword / pattern matching). */
export function extractFactsFromTranscript(transcript: string): ExtractedFact[] {
  const text = normalizeTranscript(transcript.trim());
  if (!text) return [];

  const facts: ExtractedFact[] = [];

  for (const rule of regexRules) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    facts.push({
      fieldId: rule.fieldId,
      value: resolveValue(rule, match),
      confidence: rule.confidence,
      evidence: match[0]
    });
  }

  const byField = new Map<string, ExtractedFact>();
  for (const fact of facts) {
    const prev = byField.get(fact.fieldId);
    if (!prev || fact.confidence > prev.confidence) {
      byField.set(fact.fieldId, fact);
    }
  }

  return Array.from(byField.values());
}
