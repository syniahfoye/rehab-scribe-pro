# API Contract (MVP)

## Security headers required

- `x-mfa-verified: true`
- `x-user-id: <actor id>`
- `x-user-role: nurse|physician|admin|auditor`

## Endpoints

### Start encounter
`POST /api/encounters/start`

Body:
```json
{
  "patientId": "rehab-patient-123",
  "clinicianId": "nurse-1",
  "templateId": "rehab_nursing_assessment_v1"
}
```

### Verify consent
`POST /api/encounters/:id/consent`

### Transcribe
`POST /api/encounters/:id/transcribe`

Body:
```json
{
  "audioHint": "Patient reports ..."
}
```

### Generate draft
`POST /api/encounters/:id/draft`

### Sign-off
`POST /api/encounters/:id/signoff`

Rules:
- Fails if required fields are still missing

### Export
`POST /api/encounters/:id/export`

Rules:
- Requires physician role
- Requires sign-off before export

### Audit list
`GET /api/encounters/:id/audits`
