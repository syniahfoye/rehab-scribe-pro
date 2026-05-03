import { randomUUID } from "node:crypto";
import type { DraftNote, EncounterStatus } from "../../shared/types.js";

export type Encounter = {
  id: string;
  patientId: string;
  clinicianId: string;
  discipline: string;
  templateId: string;
  status: EncounterStatus;
  consentVerified: boolean;
  transcript?: string;
  draft?: DraftNote;
  signedOffBy?: string;
  exportedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  encounterId: string;
  action: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type ConversationLog = {
  id: string;
  patientId: string;
  encounterId: string;
  clinicianId: string;
  discipline: string;
  text: string;
  timestamp: string;
};

const encounters = new Map<string, Encounter>();
const audits: AuditEvent[] = [];
const conversationLogs: ConversationLog[] = [
  {
    id: randomUUID(),
    patientId: "rehab-patient-123",
    encounterId: "seed-encounter-001",
    clinicianId: "nurse-demo-1",
    discipline: "nursing",
    text:
      "Patient name is Alex Rivera. Date of birth December 27, 2002. MRN ABC12345. Blood pressure 122 over 78, heart rate 74, respiratory rate 16, temperature 98.4, sat 96, weight 120. Chief complaint is spinal cord injury rehabilitation. Bowel program every other night with last bowel movement yesterday. Intermittent catheterization every four hours with no UTI symptoms.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  },
  {
    id: randomUUID(),
    patientId: "rehab-patient-123",
    encounterId: "seed-encounter-002",
    clinicianId: "ot-demo-2",
    discipline: "ot",
    text:
      "OT update: Transfers require moderate assist with slide board. Wheelchair positioning adjusted. Self-care ADL training completed for grooming and upper body dressing. Family support present and caregiver education performed for home setup barriers.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
  },
  {
    id: randomUUID(),
    patientId: "rehab-patient-123",
    encounterId: "seed-encounter-003",
    clinicianId: "pt-demo-3",
    discipline: "pt",
    text:
      "PT note: FIM mobility discussed. Fall risk remains high with unsteady balance during turns. Bed alarm and call light precautions reinforced. Tone and spasticity increased in bilateral lower extremities.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
  },
  {
    id: randomUUID(),
    patientId: "rehab-patient-123",
    encounterId: "seed-encounter-004",
    clinicianId: "rt-demo-4",
    discipline: "rt",
    text:
      "RT progress: Lungs clear. Secretions thin. Incentive spirometry hourly while awake. Cough assist reviewed. Respiratory effort stable with no acute distress.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString()
  },
  {
    id: randomUUID(),
    patientId: "rehab-patient-123",
    encounterId: "seed-encounter-005",
    clinicianId: "physician-demo-5",
    discipline: "physician",
    text:
      "Physician follow-up: T12 ASIA B spinal cord injury. Skin pressure injury stage 1 sacral redness with turning schedule every two hours. DVT prophylaxis with enoxaparin. PICC line in place. Mood anxious but engaged. Discharge barriers include equipment and home access; patient education and follow-up plan reviewed.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
  }
];

export const createEncounter = (input: {
  patientId: string;
  clinicianId: string;
  discipline: string;
  templateId: string;
}) => {
  const now = new Date().toISOString();
  const encounter: Encounter = {
    id: randomUUID(),
    patientId: input.patientId,
    clinicianId: input.clinicianId,
    discipline: input.discipline,
    templateId: input.templateId,
    status: "started",
    consentVerified: false,
    createdAt: now,
    updatedAt: now
  };
  encounters.set(encounter.id, encounter);
  return encounter;
};

export const getEncounter = (id: string) => encounters.get(id);

export const updateEncounter = (id: string, patch: Partial<Encounter>) => {
  const existing = encounters.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  encounters.set(id, updated);
  return updated;
};

export const appendAudit = (event: Omit<AuditEvent, "id" | "timestamp">) => {
  const item: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event
  };
  audits.push(item);
  return item;
};

export const listAudits = (encounterId?: string) =>
  encounterId ? audits.filter((a) => a.encounterId === encounterId) : audits;

export const appendConversationLog = (input: {
  patientId: string;
  encounterId: string;
  clinicianId: string;
  discipline: string;
  text: string;
}) => {
  const item: ConversationLog = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...input
  };
  conversationLogs.push(item);
  return item;
};

export const listConversationLogsForPatient = (patientId: string) =>
  conversationLogs.filter((entry) => entry.patientId === patientId);
