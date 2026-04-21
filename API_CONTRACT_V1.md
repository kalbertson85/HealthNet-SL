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
      "dashboard.summary",
      "visits.summary",
      "appointments.summary",
      "prescriptions.summary",
      "patients.workflow",
      "patients.summary",
      "billing.insurance",
      "billing.summary",
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

## `GET /api/v1/session`

Purpose:
- Return authenticated user session context for client bootstrap.

Access:
- Requires `dashboard.view`.

Response fields:
- `session.user_id`
- `session.role`
- `session.facility_id`
- `session.permissions[]`
- `api.version`

## `GET /api/v1/dashboard/summary`

Purpose:
- Return a compact dashboard snapshot suitable for mobile and desktop landing screens.

Access:
- Requires `dashboard.view`.

Response fields:
- `dashboard.patients_total`
- `dashboard.visits_active`
- `dashboard.invoices_open`
- `dashboard.invoices_open_balance`

## `GET /api/v1/patients/summary`

Purpose:
- Return patient volume summary for selected range.

Access:
- Requires `reports.view`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `patients.total`
- `patients.created_in_range`

## `GET /api/v1/visits/summary`

Purpose:
- Return visit activity mix for selected range for dashboard trend tiles.

Access:
- Requires `reports.view`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `visits.total_in_range`
- `visits.active`
- `visits.pending`
- `visits.completed_or_discharged`

## `GET /api/v1/appointments/summary`

Purpose:
- Return appointment lifecycle totals for selected range.

Access:
- Requires `appointments.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `appointments.total_in_range`
- `appointments.scheduled_or_confirmed`
- `appointments.completed`
- `appointments.cancelled`

## `GET /api/v1/prescriptions/summary`

Purpose:
- Return prescription processing totals for selected range.

Access:
- Requires `prescriptions.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `prescriptions.total_in_range`
- `prescriptions.pending`
- `prescriptions.dispensed`
- `prescriptions.other`

## `GET /api/v1/billing/summary`

Purpose:
- Return billing totals and open-invoice indicators for selected range.

Access:
- Requires `billing.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)
- `payer_type` (optional: `all | patient | company`)

Response fields:
- `billing.invoice_count`
- `billing.total_amount`
- `billing.paid_amount`
- `billing.outstanding_balance`
- `billing.open_invoice_count`

## Cross-Platform Guidance

- Mobile/desktop clients should call `/api/v1/meta` on startup and cache:
  - `api.version`
  - `api.capabilities`
- Unsupported capabilities should gracefully degrade in UI.
- Shared typed client helper is available at `lib/api/v1-client.ts`.

## Change Policy

- Backward-compatible additions are allowed in `v1`.
- Breaking changes require `v2` endpoint namespace.
