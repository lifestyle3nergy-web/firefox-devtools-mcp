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
import { describe, it, expect } from 'vitest';
import { createTestFirefox, closeFirefox } from '../helpers/firefox.js';

const CYCLES = 5;
const GRACE_PERIOD_MS = 10_000;
const POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** PIDs of test geckodriver / marionette Firefox processes, '' if none. */
function lingeringTestProcesses(): string {
  const firefox = execSync('pgrep -f "firefox.*marionette" || true', { encoding: 'utf8' }).trim();
  const geckodriver = execSync('pgrep -f geckodriver || true', { encoding: 'utf8' }).trim();
  return [firefox, geckodriver].join(' ').trim();
}

async function expectNoLingeringProcesses(): Promise<void> {
  const deadline = Date.now() + GRACE_PERIOD_MS;
  let lingering = lingeringTestProcesses();
  while (lingering && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lingering = lingeringTestProcesses();
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
      const firefox = await createTestFirefox();

      // Prove the session is really alive before tearing it down, so a
      // "leak" failure cannot be a false positive from a failed launch.
      const tabs = await firefox.getTabs();
      expect(tabs.length).toBeGreaterThan(0);

      await closeFirefox(firefox);
      await expectNoLingeringProcesses();
    }
  });
});
