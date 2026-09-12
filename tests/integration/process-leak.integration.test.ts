/**
 * Process-leak guard for FirefoxCore.close().
 *
 * Repeatedly launches and tears down a real Firefox session, asserting after
 * every close that no processes created by that cycle survive. A failure here
 * almost always means cleanup in src/firefox/core.ts regressed (e.g. after a
 * selenium-webdriver upgrade changed its private internals).
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

function processIdsByName(name: string): Set<string> {
  const output = execSync(`pgrep -x ${name} || true`, { encoding: 'utf8' }).trim();
  return new Set(output ? output.split(/\s+/).filter(Boolean) : []);
}

function processIdsContaining(value: string): string[] {
  const output = execSync('ps -eo pid=,args=', { encoding: 'utf8' });
  return output
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .flatMap((match) => (match?.[2]?.includes(value) ? [match[1]] : []));
}

/** PIDs attributable to this test cycle, '' if none. */
function lingeringTestProcesses(profileDir: string, baselineGeckodriver: Set<string>): string {
  // Firefox is uniquely attributable to the cycle through its temporary
  // profile. Read the process table directly so the probe cannot match itself.
  const firefox = processIdsContaining(profileDir);

  // geckodriver does not include the Firefox profile in its command line.
  // Compare against the pre-launch process set so unrelated geckodriver
  // instances on a shared/parallel CI runner cannot create false positives.
  const geckodriver = [...processIdsByName('geckodriver')].filter(
    (pid) => !baselineGeckodriver.has(pid)
  );

  return [...firefox, ...geckodriver].join(' ');
}

async function expectNoLingeringProcesses(
  profileDir: string,
  baselineGeckodriver: Set<string>
): Promise<void> {
  const deadline = Date.now() + GRACE_PERIOD_MS;
  let lingering = lingeringTestProcesses(profileDir, baselineGeckodriver);
  while (lingering && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lingering = lingeringTestProcesses(profileDir, baselineGeckodriver);
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
      // Capture unrelated geckodriver processes before launching this cycle.
      // Only newly-created PIDs are eligible to be reported as leaks.
      const baselineGeckodriver = processIdsByName('geckodriver');
      const profileDir = mkdtempSync(join(tmpdir(), 'fdmcp-leak-'));
      try {
        const firefox = await createTestFirefox({ headless: true, profilePath: profileDir });

        // Prove the session is really alive before tearing it down, so a
        // "leak" failure cannot be a false positive from a failed launch.
        await firefox.refreshTabs();
        const tabs = firefox.getTabs();
        expect(tabs.length).toBeGreaterThan(0);

        await closeFirefox(firefox);
        await expectNoLingeringProcesses(profileDir, baselineGeckodriver);
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }
    }
  });
});
