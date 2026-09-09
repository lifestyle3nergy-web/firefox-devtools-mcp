# Testing

## Running tests

```bash
# Run all tests once (unit + integration)
npm run test:run

# Run only unit tests (fast, no Firefox needed)
npm run test:unit

# Run only integration tests (launches real Firefox in headless mode;
# requires a prior `npm run build` for the protocol e2e test)
npx vitest run tests/integration

# Run the e2e scenario suite
npx vitest run tests/integration/e2e-scenario.integration.test.ts

# Watch mode (re-runs on file changes)
npm test
```

The protocol e2e test
(`tests/integration/mcp-protocol.integration.test.ts`) spawns the **built**
server, so run `npm run build` first. The process-leak integration test
(`tests/integration/process-leak.integration.test.ts`) is the regression
guard for `close()` cleanup in `src/firefox/core.ts`.

**Windows:** integration tests are excluded automatically on Windows
(vitest config) because selenium-webdriver hangs under vitest's process
forking. If you need them locally, `npm run test:integration:win` runs the
integration tests directly through Node without vitest's isolation.

## E2E scenario tests

The file `tests/integration/e2e-scenario.integration.test.ts` contains end-to-end
tests that exercise the full `FirefoxClient` API against a realistic multi-page
web application (`tests/fixtures/e2e-app.html`).

The fixture app has three pages (Todo List, Search, Registration Form) plus
always-visible hover/double-click targets. Each `describe` block launches its own
headless Firefox instance and tears it down after the tests.

All tests are self-contained (no ordering dependencies) and use active polling
(`waitFor`) instead of fixed sleeps for async BiDi events.

### Design principles

- **Self-contained**: each test navigates to its own page, no inter-test dependencies
- **Active polling**: async events (console, network) use `waitFor` instead of fixed sleeps
- **Relative assertions**: viewport tests assert relative change, not exact pixel values (platform-dependent)
- **Isolated Firefox instances**: each `describe` block gets its own headless Firefox

## Known issues

- **Firefox 148 startup crash on macOS ARM64** ([Bug 2027228](https://bugzilla.mozilla.org/show_bug.cgi?id=2027228)): Intermittent SIGSEGV in `RegisterFonts` thread (`RWLockImpl::writeLock()` null pointer) when launching Firefox in headless mode via Selenium. The crash is a race condition in Firefox font initialization and does not affect test results — Selenium recovers automatically. More likely to occur under fast sequential startup/shutdown cycles. The CI matrix therefore excludes macOS until this is fixed upstream.
