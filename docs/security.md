# HIPAA-Grade Security Baseline

## Data protection

- TLS 1.2+ in transit
- AES-256 encryption at rest (managed KMS in production)
- Access token expiry + refresh with rotation

## Access control

- MFA required for all clinical users
- Role-based authorization: nurse, physician, admin, auditor
- Least-privilege endpoint enforcement

## Audit and monitoring

- Immutable audit records for read/update/sign-off/export
- Alerting on unusual access patterns and export spikes
- Full incident response runbook

## Data lifecycle

- PHI minimization by design
- Configurable retention/deletion policy by encounter age
- Secure deletion workflow

## Threat model focus

- Account takeover
- Prompt injection and unsafe generation
- Data exfiltration
- Insider misuse
