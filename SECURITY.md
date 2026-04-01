# Security Policy

## Supported Versions

This project currently supports security fixes on:

- `main` (latest)

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected vulnerabilities.

Report privately by email to: `kalbertson85+healthnet-security@gmail.com`

Include:

- A clear description of the issue
- Steps to reproduce
- Impact assessment (data exposure, auth bypass, etc.)
- Suggested fix (if available)

## Response Targets

- Acknowledgement: within 72 hours
- Initial triage: within 7 days
- Fix timeline: based on severity and exploitability

## Scope Notes

Priority classes include:

- Authentication/authorization bypass
- Secret leakage and insecure key handling
- Unsafe file upload/storage policy gaps
- Webhook signature/replay validation weaknesses
- Injection and data exfiltration risks

## Disclosure Process

1. Report received and triaged privately.
2. Fix prepared and validated in CI.
3. Patch released to `main`.
4. Public disclosure after fix is available.

## Operational Hygiene

- Never commit `.env*` files or raw secrets.
- Rotate exposed secrets immediately (Supabase keys, webhook secrets, API tokens).
- Keep branch protection and required checks enabled for `main`.
