/**
 * Tests for --selftest CLI parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../src/cli.js';

describe('--selftest parsing', () => {
  it('defaults to false', () => {
    const args = parseArguments('1.0.0', ['node', 'script']);
    expect(args.selftest).toBe(false);
  });

  it('enables self-test mode when passed', () => {
    const args = parseArguments('1.0.0', ['node', 'script', '--selftest', '--headless']);
    expect(args.selftest).toBe(true);
    expect(args.headless).toBe(true);
  });
});
