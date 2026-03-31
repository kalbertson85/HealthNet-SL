# Release Notes - 2026-03-31

Version: `0.1.0` hardening release

## Security

- Fixed RBAC fail-open behavior for unknown/missing roles.
- Standardized authorization error handling to return proper `401/403`.
- Hardened mobile-money webhook:
  - HMAC signature verification
  - timestamp replay window
  - persistent + in-memory idempotency
  - payload schema/content-type/size validation
  - structured rejected-attempt audit logging
- Hardened sync queue endpoint with schema and payload limits.
- Applied broader API hardening: rate limits, same-origin checks, and secure response headers.
- Switched patient photo upload from service-role storage writes to user-scoped writes.
- Added storage policies for `patient-photos`.

## Reliability / Correctness

- Fixed system activity CSV shape/header alignment issue.
- Restored TypeScript build safety and resolved surfaced issues.
- Added bounded in-memory rate-limit cleanup behavior.

## Observability / Admin

- Added admin webhook events monitor:
  - accepted events
  - rejected events
  - invoice mutation events
- Added audit index for faster webhook-related audit queries.

## Developer Experience

- Normalized app/package naming to `HealthNet-SL`.
- Added pre-deploy gate:
  - `npm run predeploy:check`
- Added local webhook mutation test helper:
  - `npm run webhook:test:local -- --invoice-id <uuid>`
- Added hardening sign-off reference:
  - `HARDENING_STATUS.md`
