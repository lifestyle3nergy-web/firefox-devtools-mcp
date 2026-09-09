# Operations

Runbook for deploying, monitoring, and troubleshooting the Firefox DevTools MCP
server. For developer-oriented details see the other documents in this folder;
for the security model see [SECURITY.md](../SECURITY.md).

## Architecture in one paragraph

An MCP client (Claude, an IDE agent, ...) spawns this server as a child
process and talks to it over stdio. The server manages a Firefox session
through geckodriver: WebDriver for lifecycle and navigation, CDP/BiDi for
the higher-level tools. Everything runs locally on one machine (or in one
container); there is no network server component.

Local state lives in the server process's home directory:

| What | Where |
| --- | --- |
| Browser profiles (auto-created, per session group) | `~/.firefox-devtools-mcp/profiles/` |
| Captured Firefox stdout/stderr | `~/.firefox-devtools-mcp/output/firefox-<timestamp>.log` |
| geckodriver binary (auto-downloaded) | `~/.cache/selenium/geckodriver/` (platform-specific) |

## Health checks

- **Startup self-test** — `node dist/index.js --selftest --headless` builds the
  toolset, launches (or connects to) Firefox, verifies the BiDi connection,
  and exits `0` on success / `1` on failure without starting the MCP server.
  This is the canonical environment check and is what CI runs against both
  the built package and the Docker image.
- **Version smoke** — `node dist/index.js --version` (also the Docker
  `HEALTHCHECK`).
- **Runtime status** — once connected, the `get_firefox_info` tool reports
  version, profile path, log file, and preferences; `get_firefox_output`
  tails the captured browser output.

## Logs and diagnostics

Two independent log streams:

1. **Server log** (MCP protocol + tool execution). Enable with `--log-file
   <path>`; set `DEBUG=*` in the server environment for verbose debug output.
2. **Firefox output** (browser stdout/stderr, including crashes and stack
   traces). Captured automatically for every session the server launches, to
   `~/.firefox-devtools-mcp/output/firefox-<timestamp>.log`. The directory is
   rotated on each launch, keeping the 5 newest capture files. Override the
   location with `--output-file <path>`. Read it from the agent with the
   `get_firefox_output` tool (`lines`, `grep`, `since` filters).

   Connect-existing and Android sessions are not captured (the browser was
   not launched by the server); the tool says so explicitly.

## Docker deployment

Images are built from the `Dockerfile` (Mozilla APT repo, Firefox ≥ 154
verified at build time, non-root user, `basic` preset default).

- **Local build:** `docker build -t firefox-devtools-mcp .`
- **Compose:** `docker compose up` (stdin/tty passthrough; named volume
  `firefox-mcp-data` holds `~/.firefox-devtools-mcp`).
- **Published images:** `ghcr.io/lifestyle3nergy-web/firefox-devtools-mcp`
  tagged with the release tag plus `latest`, pushed when a GitHub Release is
  published (see [ci-and-release.md](ci-and-release.md)).

Operational notes:

- Run `docker run --rm <image> node dist/index.js --selftest --headless`
  after any change to the image or environment; add `--shm-size=1g` if you
  see Firefox crash on startup in constrained runtimes (CI uses this).
- The image sets `FIREFOX_HEADLESS=true`, `TOOL_PRESET=basic`,
  `AUTO_PROFILE=true` by default; override via environment or CLI flags.
- Point `HOME` (or the compose volume) at persistent storage if you want
  profiles and captured logs to survive container recreation.

## Choosing a configuration

| Need | Setting |
| --- | --- |
| Minimum Firefox for the default preset | 154 (script tools are gated at build/launch time; 153 works for non-script tool sets) |
| Run in CI / servers | `--headless` (or `FIREFOX_HEADLESS=true`) |
| Smallest agent capability | `--tool-preset slim` |
| Debugging/network work | `--tool-preset developer` |
| Firefox-internal work (privileged context) | `--tool-preset mozilla` + `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` — Mozilla build only, isolated environments only |
| Attach to a running browser | `--connect-existing` (+ `--marionette-port`) — use a dedicated profile for that browser |

Details and the full flag list: `node dist/index.js --help` and the README.

## Troubleshooting

**"Firefox version ... is not supported" at launch** — the server gates
script tools on Firefox ≥ 154. Install a newer Firefox, or use a tool set
that does not include `script`.

**geckodriver auto-download fails (offline air-gapped host)** — install
geckodriver manually where the selenium manager cache expects it, or pre-populate
`~/.cache/selenium/geckodriver/`.

**Marionette port already in use** — another Firefox with a Marionette port
open on the host. Close it or use a different `--marionette-port`.

**`get_firefox_output` says "no output capture"** — the session was attached
with `--connect-existing` or is an Android session; browser output goes to
wherever that Firefox's own stdout went.

**Leftover Firefox/geckodriver processes after a crash** — on Unix:
`pkill -f "firefox.*marionette"` and `pkill -f geckodriver` (use the
`-P` child-kill pattern from `tests/setup.ts` for safety). A recurring leak
is a bug — the `process-leak` integration test exists for exactly this.

**Windows** — integration tests are excluded on Windows (selenium-webdriver
hang, tracked upstream); unit tests and the built server work.

**macOS** — CI does not run on macOS yet because of a Firefox startup crash
that is upstream, not in this codebase (see `docs/testing.md`).

**Docker container Firefox won't start** — check `--shm-size`, that the
image self-test still passes, and the captured output file in the data
volume.

## Data and retention

- **Profiles** under `~/.firefox-devtools-mcp/profiles/` accumulate; delete
  them to reset automation state (do not run the server against your real
  browser profile).
- **Captured logs** keep the 5 newest files per output directory (rotation
  happens on launch; `--output-file` bypasses the default directory).
- **Downloads** saved via tools respect the save-path restriction (relative
  to CWD, absolute only under `~/.firefox-devtools-mcp`) unless
  `--unrestricted-save-paths` is set — see SECURITY.md.

## Security operations

The server authenticates nothing and is stdio-only: the security boundary is
your OS process isolation (dedicated user / container / VM). Read
[SECURITY.md](../SECURITY.md) before enabling any of the risky flags
(`--unrestricted-save-paths`, `--connect-existing`, `--accept-insecure-certs`)
or the privileged modules, and use a dedicated profile for every deployment.

## Release operations (owners)

Version bump → tag → release → publish is fully automated; see
[ci-and-release.md](ci-and-release.md). The short version:

1. `node scripts/bump-version.mjs <next-version>` (updates `package.json` and
   `manifest.mcpb.json`), commit.
2. `git tag v<next-version> && git push origin v<next-version>`.
3. CI validates tag ↔ package.json parity, runs the full test matrix with
   Firefox, builds, creates the GitHub Release, then publishes to npm (main
   + `-moz`) and pushes the Docker image to `ghcr.io/lifestyle3nergy-web`.
