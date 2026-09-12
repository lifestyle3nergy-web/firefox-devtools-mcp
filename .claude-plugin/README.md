# Firefox DevTools Plugin for Claude Code

Control Firefox for automated browsing, web testing, and debugging. Navigate pages, fill forms, click elements, take screenshots, and monitor console/network activity.

## What's Included

- **MCP Server** - Connects Claude Code to Firefox via WebDriver BiDi
- **Skill** - Auto-triggers for browser automation, testing, and debugging tasks
- **Agents** - Dedicated `e2e-tester` and `web-extractor` agents for focused tasks

## Installation

```bash
/plugin marketplace add lifestyle3nergy-web/firefox-devtools-mcp
/plugin install firefox-devtools-mcp@firefox-devtools-plugins
```

## Agents

Spawn agents to keep your main context clean:

```
spawn e2e-tester to test the login flow on https://app.example.com
spawn web-extractor to extract product prices from https://shop.example.com
```

## Usage Examples

The plugin works automatically when you ask about browser tasks:

- "Navigate to example.com and take a screenshot"
- "Fill out the login form and submit"
- "Check for JavaScript errors on this page"
- "Extract all product prices from this page"

## Key Workflow

1. `take_snapshot` - Creates DOM snapshot with UIDs (e.g., `e42`)
2. Interact using UIDs - `click_by_uid`, `fill_by_uid`, etc.
3. Re-snapshot after DOM changes

## Default Configuration

The plugin starts the server with (see `plugins/firefox-devtools-mcp/.claude-plugin/plugin.json`):

- **`--auto-profile`** — uses a persistent, dedicated profile under `~/.firefox-devtools-mcp/` instead of a fresh temporary profile per session.
- **`--tool-preset developer`** — enables the developer tool preset: JavaScript evaluation and debugging tools (`evaluate_script`, logpoints, network, console, profiler). Requires Firefox 153+ for the script tools.
- **`--pref remote.prefs.recommended=false`** — skips WebDriver's automation preferences so Firefox behaves closer to a regular browser session. See [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) for what those preferences do.

## Requirements

- Firefox 153+ (for script tools) or Firefox 120+ (without script tools)
- Node.js 20.19.0+

## Links

- [Repository](https://github.com/lifestyle3nergy-web/firefox-devtools-mcp)
- [Upstream (Mozilla)](https://github.com/mozilla/firefox-devtools-mcp)
- [npm](https://www.npmjs.com/package/@lifestyle3nergy-web/firefox-devtools-mcp)
