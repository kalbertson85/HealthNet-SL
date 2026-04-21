# Security Baseline - 2026-04-21

This document captures the current hardened baseline and the remaining operator actions required to keep production secure.

## Implemented Baseline

- CI validation requires:
  - repository hygiene check
  - secret scan
  - lint
  - tests
  - production build
- CI includes production dependency audit artifact and fails on high/critical vulnerabilities.
- Security guardrails for tracked files now block:
  - `.env*`, `.envrc`
  - cert/key formats (`.pem`, `.key`, `.p12`, `.pfx`, `.crt`, `.cer`, `.jks`, `.keystore`)
  - token-bearing config (`.npmrc`, `.pypirc`)
  - cloud/infra sensitive state (`.aws/`, `.kube/`, `*.tfstate*`, `*.tfvars*`)
- Secret scan includes expanded token/key patterns (GitHub, AWS, Google API-style, OpenAI-style, bearer/key forms).
- Next.js upgraded to patched `16.2.4`.

## Mandatory Operator Actions

1. Enforce branch protection in GitHub for `main` using `BRANCH_PROTECTION.md`.
2. Rotate production and CI secrets using `KEY_ROTATION_RUNBOOK.md`.
3. Verify rotated secret presence and quality in each environment:
   - `bash scripts/verify-key-rotation-env.sh`
4. Confirm branch protection via GitHub CLI (optional but recommended):
   - `bash scripts/check-branch-protection.sh <owner/repo> main`

## Post-Rotation Verification

- Login and RBAC flows
- Webhook signature validation
- Notification/SMS delivery
- Billing and PDF endpoints
- CI `validate` workflow green

## Notes

- Historical failed workflow runs remain red in GitHub history; only latest protected-branch checks determine merge safety.
