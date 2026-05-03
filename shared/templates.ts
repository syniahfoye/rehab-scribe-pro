export type TemplateField = {
  id: string;
  label: string;
  required: boolean;
  type: "text" | "number" | "boolean";
  /** Short context for clinicians (shown in UI). */
  hint?: string;
};

export type AssessmentTemplate = {
  id: string;
  name: string;
  setting: "rehab_clinic";
  sections: {
    id: string;
    title: string;
    subtitle?: string;
    fields: TemplateField[];
  }[];
};

/** SCI / IRF-oriented nursing assessment with Medicare IRF-PAI (FIM) touchpoints. */
export const rehabSciIrfAssessmentTemplate: AssessmentTemplate = {
  id: "rehab_sci_irf_assessment_v1",
  name: "Rehab Nursing Assessment (SCI / IRF)",
  setting: "rehab_clinic",
  sections: [
    {
      id: "demographics_vitals",
      title: "1. Patient identity, vitals & general",
      fields: [
        { id: "patient_legal_name", label: "Legal name", required: true, type: "text" },
        { id: "date_of_birth", label: "Date of birth", required: true, type: "text" },
        { id: "mrn", label: "MRN / account", required: false, type: "text" },
        { id: "vital_bp", label: "Blood pressure (e.g. 120/80)", required: true, type: "text" },
        { id: "vital_hr", label: "Heart rate", required: false, type: "number" },
        { id: "vital_rr", label: "Respiratory rate", required: false, type: "number" },
        { id: "vital_temp_f", label: "Temperature (°F)", required: false, type: "number" },
        { id: "vital_spo2", label: "SpO₂ (%)", required: false, type: "number" },
        { id: "weight_kg", label: "Weight (lb or kg as stated)", required: false, type: "number" },
        { id: "general_appearance", label: "General appearance / baseline", required: false, type: "text" },
        { id: "chief_complaint", label: "Chief complaint / focus today", required: true, type: "text" },
        { id: "pain_score", label: "Pain (0–10)", required: false, type: "number" }
      ]
    },
    {
      id: "neurological",
      title: "2. Neurological assessment",
      fields: [
        { id: "neuro_level_of_injury", label: "Neurologic level of injury (NLI)", required: true, type: "text", hint: "e.g. C5, T12" },
        { id: "neuro_asia_grade", label: "ASIA impairment scale (AIS)", required: false, type: "text" },
        { id: "neuro_sensory_motor_key", label: "Key sensory / motor findings", required: false, type: "text" },
        { id: "neuro_spasticity_tone", label: "Tone / spasticity", required: false, type: "text" },
        { id: "neuro_autonomic_dysreflexia_risk", label: "Autonomic dysreflexia education / risk", required: false, type: "boolean" }
      ]
    },
    {
      id: "respiratory",
      title: "3. Respiratory assessment",
      fields: [
        { id: "resp_breath_sounds", label: "Breath sounds / work of breathing", required: false, type: "text" },
        { id: "resp_secretions", label: "Secretions / airway clearance", required: false, type: "text" },
        { id: "resp_incentive_spirometry", label: "Incentive spirometry / lung expansion", required: false, type: "text" },
        { id: "resp_cough_assist", label: "Cough assist / MI-E", required: false, type: "text" }
      ]
    },
    {
      id: "cardiovascular",
      title: "4. Cardiovascular assessment",
      fields: [
        { id: "cv_edema", label: "Edema / perfusion", required: false, type: "text" },
        { id: "cv_dvt_prophylaxis", label: "VTE / DVT prophylaxis", required: false, type: "text" },
        { id: "cv_bp_management", label: "BP management (autonomic / orthostatic)", required: false, type: "text" }
      ]
    },
    {
      id: "skin_wound",
      title: "5. Skin & wound assessment",
      subtitle: "High-frequency in SCI",
      fields: [
        { id: "skin_pressure_injury_notes", label: "Pressure injury / skin integrity", required: true, type: "text" },
        { id: "skin_turning_schedule", label: "Turning / offloading schedule", required: false, type: "text" },
        { id: "skin_wound_locations", label: "Wound locations / dressings", required: false, type: "text" }
      ]
    },
    {
      id: "gi_bowel",
      title: "6. GI / bowel program",
      subtitle: "Daily SCI documentation",
      fields: [
        { id: "gi_bowel_program", label: "Bowel program / regimen", required: false, type: "text" },
        { id: "gi_last_bm", label: "Last bowel movement", required: false, type: "text" },
        { id: "gi_stool_consistency", label: "Stool / continence notes", required: false, type: "text" }
      ]
    },
    {
      id: "gu_bladder",
      title: "7. GU / bladder program",
      subtitle: "Every catheterization",
      fields: [
        { id: "gu_bladder_method", label: "Bladder method (ICV, Foley, SP, etc.)", required: true, type: "text" },
        { id: "gu_catheterization_frequency", label: "Catheterization frequency / volumes", required: false, type: "text" },
        { id: "gu_uti_symptoms", label: "UTI symptoms / screening", required: false, type: "text" }
      ]
    },
    {
      id: "msk_mobility",
      title: "8. Musculoskeletal & mobility (FIM)",
      subtitle: "Medicare IRF-PAI required",
      fields: [
        { id: "msk_mobility_devices_transfers", label: "Devices, weight bearing, transfers", required: false, type: "text" },
        { id: "msk_fim_notes", label: "FIM / functional mobility (IRF-PAI)", required: false, type: "text" },
        { id: "msk_adl_self_care", label: "Self-care / ADLs", required: false, type: "text" }
      ]
    },
    {
      id: "safety_fall",
      title: "9. Safety & fall risk",
      fields: [
        { id: "safety_fall_risk", label: "Fall risk / mobility safety", required: false, type: "text" },
        { id: "safety_precautions", label: "Precautions (alarms, call light, 1:1)", required: false, type: "text" }
      ]
    },
    {
      id: "psychosocial",
      title: "10. Psychosocial & functional cognition",
      fields: [
        { id: "psych_mood_cognition", label: "Mood / coping / cognition", required: false, type: "text" },
        { id: "psych_support_system", label: "Support system / caregiver", required: false, type: "text" }
      ]
    },
    {
      id: "lines_tubes",
      title: "11. Lines, tubes & drains",
      fields: [
        { id: "lines_iv", label: "IV / vascular access", required: false, type: "text" },
        { id: "tubes_feeding", label: "NG / PEG / feeding tubes", required: false, type: "text" },
        { id: "drains", label: "Drains", required: false, type: "text" }
      ]
    },
    {
      id: "education_discharge",
      title: "12. Patient education & discharge planning",
      fields: [
        { id: "edu_discharge_planning", label: "Education / barriers / next steps", required: false, type: "text" }
      ]
    }
  ]
};

/** @deprecated Use rehabSciIrfAssessmentTemplate */
export const rehabNursingAssessmentTemplate = rehabSciIrfAssessmentTemplate;
