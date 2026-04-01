# HMS – Visit Workflow & Billing Overview

This project is a hospital management system (HMS) built with Next.js (App Router) and Supabase. It implements a multi-stage visit workflow with billing, investigations, pharmacy, and basic notifications.

Hardening sign-off checklist: `HARDENING_STATUS.md`
Release execution checklist: `RELEASE_CHECKLIST.md`
Release notes draft: `RELEASE_NOTES_2026-03-31.md`
Security policy: `SECURITY.md`
Branch protection runbook: `BRANCH_PROTECTION.md`

## Visit & Billing Workflow

The core patient visit workflow is:

1. **Registration**
   - New patient registration creates a `patients` record.
   - A `visit` is automatically created with `visit_status = 'doctor_pending'`.
   - On an existing patient, the "Start Visit" action also creates a `doctor_pending` visit.

2. **Doctor** (`/dashboard/doctor`)
   - For `doctor_pending` visits, doctor records diagnosis and can:
     - Request investigations → visit moves to `lab_pending`.
     - Send directly to billing → visit moves to `billing_pending`.
   - For `doctor_review` visits, doctor reviews results, updates diagnosis and prescription notes, then moves the visit to `billing_pending`.

3. **Investigations** (`/dashboard/investigations`)
   - Displays visits with `visit_status = 'lab_pending'` and their `investigations`.
   - Each investigation can be marked `completed` with results.
   - When all investigations for a visit are completed, the visit moves to `doctor_review`.

4. **Billing** (`/dashboard/billing`)
   - Shows a "Visits awaiting billing" list for `visits` with `visit_status = 'billing_pending'`.
   - Each visit links to `/dashboard/billing/visit/[id]` where billing staff can:
     - Add invoice line items (services, lab, medications) and compute totals.
     - Choose payer: patient or company.
     - Save/update the invoice linked via `visit_id`.
   - When payment is confirmed, "Mark paid & send to Pharmacy" updates:
     - `invoices.paid_status = 'paid'`.
     - `visits.visit_status = 'pharmacy_pending'`.

5. **Pharmacy** (`/dashboard/pharmacy`)
   - Shows visits with `visit_status = 'pharmacy_pending'` as "Visits awaiting pharmacy".
   - Shows pending prescriptions and basic stock overview.
   - On the prescription detail page, dispensing:
     - Checks stock and writes `dispense_events`.
     - Updates `medication_stock` (atomic stock deduction).
     - Writes an `audit_logs` record.
     - Marks any `pharmacy_pending` visits for that patient as `completed`.

6. **Completed**
   - Once pharmacy dispensing is done, the visit is `completed` and no longer appears in queues.

### Visit Statuses

Visit statuses are centrally defined and used as a state machine in `lib/visits.ts`:

- `doctor_pending`
- `lab_pending`
- `doctor_review`
- `billing_pending`
- `pharmacy_pending`
- `completed`

Allowed transitions include:

- `doctor_pending` → `lab_pending` | `billing_pending`
- `lab_pending` → `doctor_review`
- `doctor_review` → `billing_pending`
- `billing_pending` → `pharmacy_pending`
- `pharmacy_pending` → `completed`

Tests in `tests/visits.test.ts` verify these transitions and ensure invalid jumps are rejected.

## Billing, Companies, and Hospital Settings

- **Invoices** are linked to visits via `visit_id` and contain `line_items`, `subtotal`, `tax`, `total`, and `paid_status`.
- **Companies** (`/dashboard/settings/companies`):
  - Admin/facility admin/cashier can configure corporate clients (name, contact details, terms).
  - Billing staff can assign a visit to a company payer.
- **Hospital Settings** (`/dashboard/settings/hospital`):
  - Admin/facility admin can configure `hospital_name` and `billing_logo_url` used on invoices.

### Invoice PDF

- `GET /api/invoices/[id]/pdf` generates a simple text-based PDF containing:
  - Hospital name and optional logo placeholder.
  - Invoice number, date, and status.
  - Bill-to section (company or patient).
  - Table-like list of line items (description, quantity, unit price, line total).
  - Subtotal, tax, and total.

A "PDF" button on the billing invoices table links to this endpoint.

## Notifications and Audit Logging

- **SMS helpers** (`lib/notifications/sms.ts`):
  - `shouldSendSms(userId, type)` respects notification preferences stored in `notification_preferences`.
  - `sendSms(phoneNumber, message)` talks to an external SMS API, controlled by `SMS_API_URL` and `SMS_API_KEY`. If not configured, SMS is skipped.
- **Mobile money webhook** (`POST /api/webhooks/mobile-money`):
  - Requires `MOBILE_MONEY_WEBHOOK_SECRET` to be set.
  - Requires `Content-Type: application/json`.
  - Requires both headers:
    - `X-Timestamp` (unix seconds/milliseconds or ISO timestamp).
    - `X-Signature` (hex SHA256 HMAC, optionally prefixed with `sha256=`).
  - Signature is computed as HMAC-SHA256 over: `X-Timestamp + "." + raw_request_body`.
  - Requests outside the replay window (default 5 minutes) are rejected.
  - Payload must be a JSON object with:
    - a valid `event_id` / `id` (max 128 chars),
    - `status` (non-empty string),
    - `amount` (non-negative number or numeric string).
  - Duplicate `event_id` / `id` values are deduplicated (idempotent `200` response).
  - Rejected requests are audit-logged with rejection reason and request fingerprint metadata.
  - Optional invoice mutation can be enabled with `ENABLE_MOBILE_MONEY_INVOICE_MUTATION=true` to auto-apply successful webhook payments to `invoices`.
  - Local mutation test helper:
    - `npm run webhook:test:local -- --invoice-id <invoice_uuid>`
    - Optional args: `--amount 25000.00 --event-id mm_evt_local_01`
  - If `SUPABASE_SERVICE_ROLE_KEY` is configured and migration `scripts/046_webhook_replay_events.sql` is applied, deduplication is also persisted in `webhook_replay_events` (survives restarts and multi-instance deployments).
  - Retention cleanup helper is available via `scripts/047_webhook_replay_events_retention.sql` (default 30 days).
- **Webhook monitor**:
  - Admin API: `GET /api/admin/webhook-events?limit=50`
  - Admin UI: `/dashboard/admin/webhook-events`
  - Shows recent accepted events (`webhook_replay_events`) and rejected webhook security logs (`audit_logs`).
- **Audit logging** (`lib/audit.ts`):
  - `logAuditEvent(event)` writes audit records to `audit_logs` with action, resource info, user, facility, and metadata.
  - Used in key flows like lab result entry and pharmacy dispensing.

## API Hardening Baseline

- Fixed-window per-IP rate limiting is applied to sensitive API/export/webhook endpoints.
- Sensitive export/PDF responses use no-store headers (`Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`).
- `proxy.ts` sets global browser security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Authenticated write APIs perform same-origin checks (when `Origin` header is present) to reduce CSRF risk.
- Patient photo uploads (`POST /api/patients/photo`) use user-scoped Supabase storage writes (not service-role) with strict MIME/size/patient facility checks.
- Apply `scripts/049_patient_photos_storage_policies.sql` in Supabase to enforce storage bucket/path/facility policy rules.

## Running the App

Install dependencies (example with pnpm):

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Then open the app (default `http://localhost:3000`).

Note: You may see a non-blocking warning about `baseline-browser-mapping` data age during builds. This does not affect functionality and resolves when upstream dataset packages are refreshed.

## Running Tests

Vitest is used for unit tests.

Run the entire test suite:

```bash
pnpm test
```

Run pre-deploy readiness checks (required env vars + tests + production build):

```bash
npm run predeploy:check
```

Run the full release gate (predeploy readiness, tests, build, then lint):

```bash
npm run release:check
```

Optional Sentry monitoring environment variables:

- `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN`) – DSN used for error reporting.
- `SENTRY_ENVIRONMENT` (or `NEXT_PUBLIC_SENTRY_ENVIRONMENT`) – environment tag (`development`, `staging`, `production`).
- `SENTRY_RELEASE` (or `NEXT_PUBLIC_SENTRY_RELEASE`) – release/version tag.
- `SENTRY_TRACES_SAMPLE_RATE` (or `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`) – tracing sample rate (`0` to `1`).

Current tests include:

- `tests/billing.test.ts` – invoice total calculation and edge cases.
- `tests/visits.test.ts` – visit status transitions and full workflow.
- `tests/pharmacy.test.ts` – stock deduction and insufficient stock handling.
- `tests/sms.test.ts` – SMS preferences logic and provider interaction outcomes.
- `tests/audit.test.ts` – audit logging payloads and error handling.
- `tests/permissions.test.ts` – role/permission error semantics (`401/403` behavior).
- `tests/sync-queue-validation.test.ts` – sync queue schema and payload-size guardrails.
- `tests/mobile-money-webhook.test.ts` – webhook signature and replay-window verification.
- `tests/mobile-money-webhook-route.test.ts` – webhook route error semantics (401/415/400) and stale timestamp handling.
- `tests/mobile-money-mutation.test.ts` – feature-flagged invoice mutation computation for webhook payments.
- `tests/replay-store.test.ts` – persistent replay-store fallback behavior.
- `tests/system-activity-export.test.ts` – system activity CSV header shape regression checks.

All of these are designed to validate the critical business logic around visits, billing, pharmacy, notifications, and auditing.
