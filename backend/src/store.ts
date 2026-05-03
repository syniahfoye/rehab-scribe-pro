import { randomUUID } from "node:crypto";
import type { DraftNote, EncounterStatus } from "../../shared/types.js";

export type Encounter = {
  id: string;
  patientId: string;
  clinicianId: string;
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

const encounters = new Map<string, Encounter>();
const audits: AuditEvent[] = [];

export const createEncounter = (input: {
  patientId: string;
  clinicianId: string;
  templateId: string;
}) => {
  const now = new Date().toISOString();
  const encounter: Encounter = {
    id: randomUUID(),
    patientId: input.patientId,
    clinicianId: input.clinicianId,
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
