# HealthNet HMS API Contract (`v1`)

This document defines the first stable API contract surface for cross-platform clients (web, mobile, desktop).

## Versioning

- Contract version: `v1`
- Release channel: `beta`
- Discovery endpoint: `GET /api/v1/meta`

## Authentication

- Protected endpoints require authenticated session cookies/tokens.
- Endpoint-level RBAC is enforced server-side.
- No sensitive action may rely on client-side authorization alone.

## Response Envelope (Baseline)

- Success responses return typed JSON payloads.
- Error responses use structured error format via existing API helpers:
  - `code`
  - `message`
  - request metadata where applicable

## `GET /api/v1/meta`

Purpose:
- Provide clients a runtime capability contract and version discovery.

Access:
- Requires authenticated user with `reports.view` permission.

Response:
- `ok`
- `api.version`
- `api.release_channel`
- `api.capabilities`
- `app.name`
- `app.platforms`
- `server_time_utc`

Example:

```json
{
  "ok": true,
  "api": {
    "version": "v1",
    "release_channel": "beta",
    "capabilities": [
      "auth.session",
      "patients.workflow",
      "billing.insurance",
      "reports.company_billing",
      "audit.trail"
    ]
  },
  "app": {
    "name": "HealthNet HMS",
    "platforms": ["web", "mobile", "desktop"]
  },
  "server_time_utc": "2026-04-21T00:00:00.000Z"
}
```

## Cross-Platform Guidance

- Mobile/desktop clients should call `/api/v1/meta` on startup and cache:
  - `api.version`
  - `api.capabilities`
- Unsupported capabilities should gracefully degrade in UI.

## Change Policy

- Backward-compatible additions are allowed in `v1`.
- Breaking changes require `v2` endpoint namespace.

