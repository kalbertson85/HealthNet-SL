# Live Supabase RLS Testing

This project includes an opt-in live integration test:

- `tests/live-supabase-rls.test.ts`

Run it with:

```bash
pnpm run test:live:rls
```

To force live execution in environments where test commands do not set flags automatically:

```bash
pnpm run test:live:rls:enabled
```

The test is skipped unless:

- `LIVE_RLS_TESTS_ENABLED=true`

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVE_RLS_PRIMARY_FACILITY_ID`
- `LIVE_RLS_SECONDARY_FACILITY_ID`
- `LIVE_RLS_USER_CASES_JSON`
- `LIVE_RLS_TABLE_PROBES_JSON` (optional but recommended)

`LIVE_RLS_USER_CASES_JSON` format:

```json
[
  {
    "label": "facility_admin_primary",
    "email": "facility-admin@example.com",
    "password": "your-password",
    "primaryFacilityExpected": true,
    "secondaryFacilityExpected": false,
    "expectedFacilityId": "00000000-0000-0000-0000-000000000001"
  },
  {
    "label": "global_admin",
    "email": "global-admin@example.com",
    "password": "your-password",
    "primaryFacilityExpected": true,
    "secondaryFacilityExpected": true,
    "expectedFacilityId": null
  }
]
```

What this validates:

1. `anon` cannot execute authenticated-only helper RPCs.
2. Authenticated users can/cannot access facility scope according to expected matrix.
3. `current_user_facility_id()` returns expected facility context where asserted.
4. Optional table probes validate row-level visibility for real records across facilities.

`LIVE_RLS_TABLE_PROBES_JSON` format:

```json
[
  {
    "table": "visits",
    "idInPrimaryFacility": "11111111-1111-4111-8111-111111111111",
    "idInSecondaryFacility": "22222222-2222-4222-8222-222222222222"
  },
  {
    "table": "invoices",
    "idInPrimaryFacility": "33333333-3333-4333-8333-333333333333",
    "idInSecondaryFacility": "44444444-4444-4444-8444-444444444444"
  }
]
```

Security notes:

- Do not commit real credentials to git.
- Prefer dedicated non-production test accounts.
- Rotate test credentials periodically.
