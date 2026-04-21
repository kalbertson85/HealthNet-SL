# Release Baseline: `v1.0.0-beta`

Date: 2026-04-21

This baseline freezes a stable platform core for global web/mobile/desktop rollout.

## Scope Frozen in This Baseline

- Security hardening and CI gates
- Workflow integrity guards
- Insurance linkage audit + bulk apply + undo
- Company billing reconciliation queue and exports
- Versioned API discovery endpoint (`/api/v1/meta`)
- Shared domain export surface (`lib/domain`)

## Release Goals

1. Stabilize contracts used by clients outside the web app.
2. Minimize rework for mobile and desktop app channels.
3. Preserve current RBAC and data integrity behavior.

## Entry Criteria

- `pnpm run lint` passes
- `pnpm exec vitest run` passes
- `pnpm run build` passes
- CI workflow green on `main`
- Security gate (`audit:gate`) passes in CI

## Known Constraints

- `v1` is marked `beta` while API surface expands.
- Backward-compatible additive changes only.
- Breaking behavior changes must be versioned behind `v2`.

## Recommended Tag

- `v1.0.0-beta`

## Rollback

- Roll back to previous green tag/commit in `main`.
- Re-run DB scripts only if schema changes are part of rollback scope.

