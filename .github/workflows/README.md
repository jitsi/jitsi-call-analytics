# GitHub Actions Workflows

This directory contains CI/CD workflows for the Jitsi Call Analytics project.

## Workflows

### 1. CI (`ci.yml`)
**Triggers:** Pull requests to `master`/`main` branches

**What it does:**
- Runs on Node.js 18.x and 20.x for compatibility testing
- Installs dependencies for backend, frontend, and shared modules
- Runs linting (non-blocking)
- Builds all components (shared → backend → frontend)
- Runs unit tests for backend and frontend
- Archives build artifacts for 7 days
- Reports build status

**Status:** Required check for PR merge

### 2. PR Checks (`pr-checks.yml`)
**Triggers:** Pull requests opened/updated/reopened on `master`/`main` branches

**What it does:**
- Validates PR title (minimum 10 characters)
- Checks for merge conflicts
- Analyzes changed files by area (backend/frontend/shared)
- Posts automated comment with PR analysis summary

**Status:** Optional informational check

### 3. Cleanup Merged Branches (`cleanup-branches.yml`)
**Triggers:** Pull request closed events

**What it does:**
- Automatically deletes the source branch after PR is merged
- Only runs if PR was actually merged (not just closed)
- Logs deletion for audit trail

**Status:** Automatic cleanup action

## Repository Settings

To enable automatic branch deletion, ensure these settings in your GitHub repository:

1. **Branch Protection Rules** (Settings → Branches):
   - Require status checks to pass before merging
   - Select "CI / Build and Test" as required check
   - Enable "Require branches to be up to date before merging"

2. **Actions Permissions** (Settings → Actions → General):
   - Allow read and write permissions for workflows
   - Enable "Allow GitHub Actions to create and approve pull requests"

3. **Auto-delete head branches** (Settings → General):
   - GitHub has a native option to delete branches on merge
   - Our workflow provides backup + logging if this is disabled

## Testing Workflows Locally

You can validate workflow syntax using `act`:

```bash
# Install act (if not already installed)
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Test the CI workflow
act pull_request -W .github/workflows/ci.yml

# Test the PR checks workflow
act pull_request -W .github/workflows/pr-checks.yml
```

## Workflow Status Badges

Add these to your main README.md:

```markdown
[![CI](https://github.com/jitsi/jitsi-call-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/jitsi/jitsi-call-analytics/actions/workflows/ci.yml)
[![PR Checks](https://github.com/jitsi/jitsi-call-analytics/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/jitsi/jitsi-call-analytics/actions/workflows/pr-checks.yml)
```

## Troubleshooting

### Build fails on `npm ci`
- Check that all `package.json` files have `package-lock.json` committed
- Ensure dependencies are compatible with Node.js 18.x and 20.x

### Tests fail
- Tests run with `continue-on-error: true` so they don't block PRs
- Remove this flag to make tests required once test coverage improves

### Branch deletion fails
- Ensure the branch is not protected
- Check that workflows have write permissions in repository settings

## Future Enhancements

Potential additions:
- Code coverage reporting
- Performance benchmarking
- Docker image building and pushing
- Deployment to staging environment
- Dependabot integration for dependency updates
