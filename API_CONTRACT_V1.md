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
      "lab.summary",
      "radiology.summary",
      "pharmacy.summary",
      "queue.summary",
      "emergency.summary",
      "inpatient.summary",
      "surgery.summary",
      "nursing.summary",
      "doctor.summary",
      "triage.summary",
      "records.summary",
      "notifications.summary",
      "admin.summary",
      "reports.summary",
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

## `GET /api/v1/lab/summary`

Purpose:
- Return lab test workload totals for selected range.

Access:
- Requires `lab.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `lab.total_in_range`
- `lab.pending`
- `lab.in_progress`
- `lab.completed`
- `lab.cancelled`

## `GET /api/v1/radiology/summary`

Purpose:
- Return radiology request workload totals for selected range.

Access:
- Requires `lab.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `radiology.total_in_range`
- `radiology.pending`
- `radiology.scheduled`
- `radiology.completed`
- `radiology.cancelled`

## `GET /api/v1/pharmacy/summary`

Purpose:
- Return pharmacy queue and stock-risk counters for operational dashboards.

Access:
- Requires `pharmacy.manage`.

Response fields:
- `pharmacy.pending_prescriptions`
- `pharmacy.low_stock_items`
- `pharmacy.expiring_soon_items`
- `pharmacy.expired_items`

## `GET /api/v1/queue/summary`

Purpose:
- Return queue workflow totals for selected range.

Access:
- Requires `queue.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `queue.total_in_range`
- `queue.waiting`
- `queue.in_progress`
- `queue.completed`
- `queue.cancelled`

## `GET /api/v1/emergency/summary`

Purpose:
- Return emergency and triage workload totals for selected range.

Access:
- Requires `emergency.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `emergency.total_in_range`
- `emergency.pending`
- `emergency.in_treatment`
- `emergency.admitted`
- `emergency.discharged_or_transferred`
- `emergency.critical_or_emergency`

## `GET /api/v1/inpatient/summary`

Purpose:
- Return inpatient admission/discharge totals for selected range.

Access:
- Requires `inpatient.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `inpatient.total_in_range`
- `inpatient.admitted_or_active`
- `inpatient.discharged`
- `inpatient.other`

## `GET /api/v1/surgery/summary`

Purpose:
- Return surgical workload totals for selected range.

Access:
- Requires `inpatient.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `surgery.total_in_range`
- `surgery.scheduled_or_pending`
- `surgery.in_progress`
- `surgery.completed`
- `surgery.other`

## `GET /api/v1/nursing/summary`

Purpose:
- Return nursing workload and ward medication request totals for selected range.

Access:
- Requires `inpatient.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `nursing.active_visits`
- `nursing.notes_in_range`
- `nursing.pending_ward_requests_in_range`

## `GET /api/v1/doctor/summary`

Purpose:
- Return doctor-facing open case workload counters.

Access:
- Requires `dashboard.view`.

Response fields:
- `doctor.total_open_cases`
- `doctor.doctor_pending`
- `doctor.doctor_review`
- `doctor.lab_pending`

## `GET /api/v1/triage/summary`

Purpose:
- Return triage throughput and acuity totals for selected range.

Access:
- Requires `emergency.manage`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `triage.total_in_range`
- `triage.pending`
- `triage.in_treatment`
- `triage.critical_or_emergency`
- `triage.red`
- `triage.orange`

## `GET /api/v1/records/summary`

Purpose:
- Return records workflow totals for selected range.

Access:
- Requires `patients.view`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `records.total_in_range`
- `records.active`
- `records.completed`
- `records.discharged`

## `GET /api/v1/notifications/summary`

Purpose:
- Return user notification counters and live alert counts.

Access:
- Requires `dashboard.view`.

Response fields:
- `notifications.total`
- `notifications.unread`
- `notifications.live_alerts`

## `GET /api/v1/admin/summary`

Purpose:
- Return admin operations counters (staff, facilities, audit activity).

Access:
- Requires `admin.settings.manage`.

Response fields:
- `admin.total_staff_profiles`
- `admin.active_staff_profiles`
- `admin.blocked_staff_profiles`
- `admin.total_facilities`
- `admin.audit_events_24h`

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

## `GET /api/v1/reports/summary`

Purpose:
- Return high-level reports KPIs for selected range with RPC/fallback source indicator.

Access:
- Requires `reports.view`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `range.from`
- `range.to`
- `reports.monthly_revenue`
- `reports.new_patients`
- `reports.completed_visits`
- `reports.pending_lab_tests`
- `reports.source` (`rpc | fallback`)

## `GET /api/v1/audit/trail`

Purpose:
- Return recent audit events for administrative traceability.

Access:
- Requires `admin.settings.manage`.

Query parameters:
- `limit` (optional, `1..200`, default `50`)
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)

Response fields:
- `filters.limit`
- `filters.from`
- `filters.to`
- `audit.events[].id`
- `audit.events[].occurred_at`
- `audit.events[].action`
- `audit.events[].resource_type`
- `audit.events[].resource_id`
- `audit.events[].actor_user_id`
- `audit.events[].actor_role`
- `audit.events[].facility_id`

## `GET /api/v1/reports/company-billing`

Purpose:
- Return top outstanding company balances for selected range.

Access:
- Requires `reports.view`.

Query parameters:
- `from` (optional, `YYYY-MM-DD`)
- `to` (optional, `YYYY-MM-DD`)
- `limit` (optional, `1..50`, default `5`)

Response fields:
- `range.from`
- `range.to`
- `company_billing.companies[].company_id`
- `company_billing.companies[].company_name`
- `company_billing.companies[].outstanding`
- `company_billing.source` (`rpc | fallback`)

## Cross-Platform Guidance

- Mobile/desktop clients should call `/api/v1/meta` on startup and cache:
  - `api.version`
  - `api.capabilities`
- Unsupported capabilities should gracefully degrade in UI.
- Shared typed client helper is available at `lib/api/v1-client.ts`.

## Change Policy

- Backward-compatible additions are allowed in `v1`.
- Breaking changes require `v2` endpoint namespace.
