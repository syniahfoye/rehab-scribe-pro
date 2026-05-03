# Mobile Companion (Planned)

This folder defines the mobile-first responsibilities for the MVP companion app.

## MVP mobile scope

- Secure sign-in with MFA
- Start/stop encounter capture
- Consent confirmation
- Quick review of drafted assessment
- Sign-off support for authorized clinician roles

## Security requirements

- Device-level encryption and secure storage for tokens
- Session timeout and forced re-authentication
- No local persistence of PHI beyond short buffered capture windows

## API contract usage

Mobile uses the same backend endpoints as web.
