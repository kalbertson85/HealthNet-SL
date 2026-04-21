# Key Rotation Runbook

Use this runbook whenever a key/token might be exposed or as part of periodic security maintenance.

## Rotation Scope

Rotate these first:

- Supabase service role key
- Supabase anon/public key
- Mobile money webhook secret
- SMS provider API key
- Any third-party API keys used in `.env*` or deployment secrets

## Sequence (Do Not Skip)

1. Inventory all active secrets by environment:
   - local `.env*` (do not commit)
   - deployment platform secrets
   - CI/CD secrets
2. Create replacement secrets from each provider dashboard.
3. Update deployment secrets first (staging, then production).
4. Update CI/CD secrets.
5. Update local developer `.env*` copies.
6. Deploy application changes if needed.
7. Invalidate old keys/tokens at provider side.
8. Verify critical flows end-to-end.

## Verification Checklist

- Login/auth works
- Protected API routes still authorize correctly
- Webhook signature validation works
- SMS/notification delivery works
- Billing PDF/export endpoints work
- CI pipeline remains green

## Incident Mode (Suspected Exposure)

If exposure is suspected:

1. Rotate affected secrets immediately.
2. Revoke old credentials.
3. Check audit trails (provider + app logs) for unauthorized usage.
4. Document incident timeline and affected systems.
5. Open follow-up hardening tasks.

## Operational Policy

- Never commit secrets or token-bearing config files.
- Use least-privilege credentials where supported.
- Rotate secrets on schedule (for example, every 90 days) and on staff offboarding.

