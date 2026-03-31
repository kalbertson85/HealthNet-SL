# HealthNet-SL Hardening Status

Last updated: 2026-03-31

## Findings Closure (8/8)

1. `P0` Invalid/missing roles become admin
- Status: Closed
- Notes: Unknown roles fail closed (`null`) and are denied by RBAC checks.

2. `P1` Authz failures can return 500 instead of 401/403
- Status: Closed
- Notes: Typed permission errors are mapped to `401/403` in route handlers.

3. `P1` Service-role storage upload path too permissive
- Status: Closed
- Notes:
  - Patient photo upload now uses user-scoped storage client writes.
  - Request-side validation enforced (UUID, MIME, size, permission, patient check).
  - Storage policies added for `patient-photos` bucket (`scripts/049_patient_photos_storage_policies.sql`).

4. `P2` Export CSV columns malformed
- Status: Closed
- Notes: Header/value parity fixed and regression-tested.

5. `P2` Webhook verification/logging weak
- Status: Closed
- Notes: HMAC + timestamp tolerance + replay protection + redacted logging + rejection audit logging.

6. `P2` Queue ingest endpoint unbounded/unvalidated
- Status: Closed
- Notes: Schema validation, request/body caps, operation limits, and rate limits added.

7. `P2` TypeScript build safety disabled
- Status: Closed
- Notes: Build safety restored (`ignoreBuildErrors` removed), project builds successfully with type checks.

8. `P3` Dependency version drift (`@supabase/ssr: latest`)
- Status: Closed
- Notes: Pinned version in `package.json`.

## Manual Verification Checklist (Run Now)

1. Patient photo upload UI check
- Log in as a role allowed to edit patients.
- Open any patient profile, upload a valid image (`jpg/png/webp`, <= 5MB).
- Confirm UI updates and photo displays.

2. DB verification for uploaded patient photo
```sql
select id, patient_number, full_name, photo_url
from public.patients
where photo_url is not null
order by updated_at desc nulls last
limit 20;
```

3. Webhook monitor check
- Open `/dashboard/admin/webhook-events`.
- Confirm sections render:
  - Accepted events
  - Rejected events
  - Invoice mutations

4. Pre-deploy gate
```bash
npm run predeploy:check
```

## Pending Before Production Deploy

1. Deploy app build.
2. Confirm production env vars are set.
3. Run production webhook replay/idempotency test against deployed URL.
4. Optionally schedule replay cleanup function via `pg_cron`.
