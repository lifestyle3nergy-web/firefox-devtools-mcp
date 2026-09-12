/**
 * Protocol-level end-to-end test.
 *
 * Drives the BUILT server (dist/index.js) with a real MCP client over stdio,
 * exactly like an external MCP client would. This covers the actual shipped
 * surface (entry point + CLI + tool registry + server wiring), which the
 * other integration tests bypass by using the FirefoxClient class directly.
 *
 * Requires a prior `npm run build` and a working Firefox installation
 * (same as the other integration tests; CI builds before testing and
 * installs Firefox via browser-actions/setup-firefox).
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, it, expect } from 'vitest';
import { buildToolset } from '@/tools/registry.js';
import { MODULES } from '@/tools/index.js';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const serverPath = resolve(root, 'dist/index.js');

// Cold CI runs can take a while: geckodriver auto-download + Firefox startup.
const TEST_TIMEOUT = 180_000;

describe('MCP protocol e2e (built server over stdio)', () => {
  it('serves the basic toolset and executes a tool call', { timeout: TEST_TIMEOUT }, async () => {
    if (!existsSync(serverPath)) {
      throw new Error(
        'dist/index.js not found - run "npm run build" before the integration tests.'
      );
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath, '--headless', '--tool-preset', 'basic'],
      stderr: 'pipe',
    });

    const client = new Client({ name: 'protocol-e2e-test', version: '1.0.0' });
    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const expected = buildToolset({ preset: 'basic', allowPrivileged: false });

      // The served tool surface must match the registry exactly.
      expect(tools.map((t) => t.name).sort()).toEqual(
        expected.toolDefinitions.map((t) => t.name).sort()
      );

      // The public build must never expose privileged tools (derived from
      // the module catalog so renames cannot break this assertion).
      const servedNames = tools.map((t) => t.name);
      const privilegedToolNames = MODULES.filter((m) => m.privileged).flatMap((m) =>
        m.tools.map((t) => t.definition.name)
      );
      expect(privilegedToolNames.length).toBeGreaterThan(0);
      for (const name of privilegedToolNames) {
        expect(servedNames).not.toContain(name);
      }

      // Round-trip a real tool call (launches Firefox in the server process).
      const result = await client.callTool({ name: 'list_pages', arguments: {} });
      expect(result.isError ?? false).toBe(false);
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text'
      );
      expect(textBlock?.text?.length).toBeGreaterThan(0);
    } finally {
      // Closing the client closes the transport, which ends the server's
      // stdin; the server then cleans up the Firefox session itself.
      await client.close();
    }
  });
});
