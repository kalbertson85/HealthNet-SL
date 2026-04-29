# Live Supabase RLS Testing

This project includes an opt-in live integration test:

- `tests/live-supabase-rls.test.ts`

Run it with:

```bash
pnpm run test:live:rls
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

Security notes:

- Do not commit real credentials to git.
- Prefer dedicated non-production test accounts.
- Rotate test credentials periodically.
