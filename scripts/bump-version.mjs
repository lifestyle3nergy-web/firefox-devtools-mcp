#!/usr/bin/env node
/**
 * Bumps the version in package.json and manifest.mcpb.json.
 *
 * Usage: node scripts/bump-version.mjs <new-version>
 * Example: node scripts/bump-version.mjs 0.11.0
 *
 * After bumping, update the [Unreleased] section in CHANGELOG.md manually,
 * commit, and tag with the same version (the Version Check workflow
 * enforces tag/package.json parity).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Usage: node scripts/bump-version.mjs <new-version>`);
  console.error(`Example: node scripts/bump-version.mjs 0.11.0`);
  process.exit(1);
}

const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'manifest.mcpb.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (pkg.version === version) {
  console.log(`package.json is already at ${version}; nothing to do.`);
  process.exit(0);
}

console.log(`package.json:       ${pkg.version} -> ${version}`);
console.log(`manifest.mcpb.json: ${manifest.version} -> ${version}`);

pkg.version = version;
manifest.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Bumped to ${version}. Remember to update CHANGELOG.md and commit.`);
