/**
 * Process-leak guard for FirefoxCore.close().
 *
 * Repeatedly launches and tears down a real Firefox session, asserting after
 * every close that no test geckodriver/Firefox processes survive. A failure
 * here almost always means cleanup in src/firefox/core.ts regressed (e.g.
 * after a selenium-webdriver upgrade changed its private internals).
 *
 * Unix only: on Windows the integration tests are excluded by
 * vitest.config.ts (selenium-webdriver hangs; see docs/testing.md).
 * Run with: npm run test:integration
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createTestFirefox, closeFirefox } from '../helpers/firefox.js';

const CYCLES = 5;
const GRACE_PERIOD_MS = 10_000;
const POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** PIDs of test geckodriver / marionette Firefox processes, '' if none. */
function lingeringTestProcesses(profileDir: string): string {
  // Match the launched Firefox by its unique per-cycle profile path. Avoid
  // `pgrep -f "firefox.*marionette"`: the probe shell itself contains that
  // pattern and can therefore be reported as a false positive.
  const escapedProfile = profileDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const firefox = execSync(`pgrep -f "firefox.*${escapedProfile}" || true`, {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Match geckodriver by executable name rather than full command line. Using
  // `pgrep -f geckodriver` matches the shell and pgrep probe themselves.
  const geckodriver = execSync('pgrep -x geckodriver || true', { encoding: 'utf8' })
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return [...firefox, ...geckodriver].join(' ');
}

async function expectNoLingeringProcesses(profileDir: string): Promise<void> {
  const deadline = Date.now() + GRACE_PERIOD_MS;
  let lingering = lingeringTestProcesses(profileDir);
  while (lingering && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lingering = lingeringTestProcesses(profileDir);
  }
  expect(lingering, 'lingering test Firefox/geckodriver processes after close()').toBe('');
}

describe('Firefox process leak guard', () => {
  it('leaves no processes after repeated connect/close cycles', { timeout: 300_000 }, async () => {
    if (process.platform === 'win32') {
      console.log('skipping: integration tests are excluded on Windows');
      return;
    }

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      // Use a unique temp profile so the session is identifiable on the
      // process command line - the same shape as the production default
      // (auto-profile), where the server always launches with --profile.
      const profileDir = mkdtempSync(join(tmpdir(), 'fdmcp-leak-'));
      try {
        const firefox = await createTestFirefox({ headless: true, profilePath: profileDir });

        // Prove the session is really alive before tearing it down, so a
        // "leak" failure cannot be a false positive from a failed launch.
        // refreshTabs() must be called first: getTabs() returns the cached
        // list, which is empty until refreshed (and throws if the session
        // is dead).
        await firefox.refreshTabs();
        const tabs = firefox.getTabs();
        expect(tabs.length).toBeGreaterThan(0);

        await closeFirefox(firefox);
        await expectNoLingeringProcesses(profileDir);
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }
    }
  });
});
