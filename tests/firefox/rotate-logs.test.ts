/**
 * Tests for default output-capture log rotation (src/firefox/core.ts).
 */

import { mkdtempSync, writeFileSync, readdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { rotateFirefoxLogs } from '@/firefox/core.js';

describe('rotateFirefoxLogs', () => {
  it('keeps only the newest 5 firefox-*.log files and leaves others alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fdmcp-rotate-'));
    try {
      const now = Date.now();
      // 7 captured logs, 1 second apart (i=6 is the newest).
      for (let i = 0; i < 7; i++) {
        const file = join(dir, `firefox-2026-09-09T00-00-0${i}.log`);
        writeFileSync(file, 'log data');
        utimesSync(file, new Date(now - (7 - i) * 1000), new Date(now - (7 - i) * 1000));
      }
      // An unrelated file in the same directory must never be touched.
      writeFileSync(join(dir, 'notes.txt'), 'keep me');

      rotateFirefoxLogs(dir);

      expect(readdirSync(dir).sort()).toEqual(
        [
          'firefox-2026-09-09T00-00-02.log',
          'firefox-2026-09-09T00-00-03.log',
          'firefox-2026-09-09T00-00-04.log',
          'firefox-2026-09-09T00-00-05.log',
          'firefox-2026-09-09T00-00-06.log',
          'notes.txt',
        ].sort()
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps everything when fewer than 5 files exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fdmcp-rotate-'));
    try {
      writeFileSync(join(dir, 'firefox-a.log'), 'x');
      writeFileSync(join(dir, 'firefox-b.log'), 'x');
      rotateFirefoxLogs(dir);
      expect(readdirSync(dir).sort()).toEqual(['firefox-a.log', 'firefox-b.log']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw for a missing directory (best effort)', () => {
    expect(() => rotateFirefoxLogs(join(tmpdir(), 'definitely-missing-dir-xyz'))).not.toThrow();
  });
});
