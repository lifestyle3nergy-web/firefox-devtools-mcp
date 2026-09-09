# CI and Release

This project ships with ready-to-use GitHub Actions for CI, release, npm
publishing, and Docker images.

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | push to `main`, pull requests | Full matrix: **ubuntu + windows × Node 20 + 22**. install → production dependency audit (fail on high) → lint → format check → typecheck (src + tests) → build → install Firefox (`browser-actions/setup-firefox`) → `npm run test:coverage` (unit + integration). Integration tests are excluded on Windows (see [testing.md](testing.md)). Codecov upload and the `dist/` artifact run once (ubuntu, Node 20). |
| `pr-check.yml` | PR opened/updated/reopened | Fast unit gate on one runner: lint, format, typecheck (src + tests), unit tests, build. |
| `version-check.yml` | tag push `v*` | Fails if the tag version does not match `package.json`. Bump before tagging. |
| `release.yml` | tag push `v*` | Full checks with a real Firefox (audit, build, `npm run test:run`), then creates a GitHub Release with a `dist` tarball and the built `.mcpb` bundle. Publishing the release triggers `publish.yml`. |
| `publish.yml` | release published, manual dispatch | Re-runs checks, then publishes to npm: main package and the `-moz` variant. |
| `docker.yml` | push to `main`, PRs, release published | Builds the image, verifies the bundled Firefox (`firefox --version` ≥ 154), smoke-tests the entry point, and runs `--selftest` (launches Firefox inside the container). On release published it pushes to `ghcr.io/lifestyle3nergy-web/firefox-devtools-mcp` tagged with the release tag plus `latest`. |

Dependency updates: `dependabot.yml` opens weekly npm PRs (production
dependencies only) and monthly GitHub Actions PRs.

## CI design notes

- **The coverage gate is the vitest threshold** in `vitest.config.ts`
  (statements/branches/functions/lines floor), enforced on every
  `test:coverage` run. The Codecov upload is informational only and is
  configured with `fail_ci_if_error: false` so a missing `CODECOV_TOKEN`
  never breaks CI (important for forks).
- **Firefox is installed explicitly** (`browser-actions/setup-firefox`)
  everywhere integration tests run — never relying on the runner image's
  preinstalled browser.
- **macOS is not in the matrix** yet: a known Firefox-startup crash there is
  upstream and Firefox-side, not in this codebase (see [testing.md](testing.md)).
- **Windows** runs the full pipeline with integration tests excluded
  (selenium-webdriver hangs under vitest's process isolation).
- The production **dependency audit** (`npm audit --omit=dev
  --audit-level=high`) runs in `ci.yml` and both release workflows.

## Secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `NPM_TOKEN` | optional | Fallback npm auth: an npm automation token with publish rights on the `@lifestyle3nergy-web` scope. Only needed if you do **not** use trusted publishing. |
| `CODECOV_TOKEN` | optional | Codecov upload in `ci.yml`. The upload is informational and never fails CI. |

Publishing uses **npm trusted publishing (OIDC)** by default — no secret
required. Configure it once in npmjs.com (Access → Publishing → Trusted
publishing) for this repository; `publish.yml` then publishes with
`--provenance`. If `NPM_TOKEN` is set, it is used instead (no provenance).

## Release flow

1. **Bump the version** and commit:
   ```
   node scripts/bump-version.mjs 0.11.0
   git commit -am "chore: release 0.11.0"
   ```
   (`bump-version.mjs` updates `package.json` and `manifest.mcpb.json`.)
2. **Tag and push** (the tag must match `package.json`):
   ```
   git tag v0.11.0 && git push origin v0.11.0
   ```
3. `version-check` validates tag ↔ package.json parity.
4. `release` runs the full test suite with a real Firefox, then creates the
   GitHub Release (dist tarball + `.mcpb`).
5. Publishing the release triggers `publish` (npm, main + `-moz`) and
   `docker` pushes the image to GHCR.

Re-run a failed publish manually: Actions → `Publish to npm` → Run workflow
(uses the release-published state of the selected ref).

## Fork notes

- npm **trusted publishing is configured per repository**; re-add it after
  forking (or fall back to `NPM_TOKEN`).
- The `@lifestyle3nergy-web` npm scope must exist (and the token/trusted
  publisher have publish rights on it) before `publish` can succeed.
- `ghcr.io/lifestyle3nergy-web` requires the GitHub organization/user to
  exist; image visibility is set there (public by default for this project).
