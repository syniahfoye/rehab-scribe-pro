# Threat Model

## Primary assets

- Patient conversations (audio/transcript)
- Draft/finalized clinical notes
- User credentials and sessions
- Audit logs

## Adversaries

- External attackers targeting PHI
- Malicious insiders abusing access
- Compromised client devices

## Risks and mitigations

- **Credential compromise** -> MFA, short session TTL, anomaly detection
- **Transcript leakage** -> encryption, strict RBAC, minimal access windows
- **LLM hallucination in note text** -> source-grounding and confidence warnings
- **Unauthorized export** -> sign-off gate + audit trail + role checks
