# Branch Protection Checklist (main)

Use this once in GitHub repository settings to enforce release governance.

## Repository Settings Path

`Settings -> Branches -> Branch protection rules -> Add rule`

## Rule Target

- Branch name pattern: `main`

## Recommended Required Options

- Require a pull request before merging
- Require approvals: `1` (or `2` if you have multiple maintainers)
- Dismiss stale pull request approvals when new commits are pushed
- Require review from Code Owners
- Require status checks to pass before merging
- Required checks:
  - `validate` (from `.github/workflows/ci.yml`)
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Do not allow force pushes
- Do not allow deletions

## Optional (Recommended if available on your plan)

- Require signed commits
- Require merge queue
- Restrict who can push to matching branches

## Merge Strategy Recommendation

`Settings -> General -> Pull Requests`

- Allow squash merge: enabled
- Allow merge commit: disabled
- Allow rebase merge: disabled
- Automatically delete head branches: enabled
