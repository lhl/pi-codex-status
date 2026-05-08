# pi-codex-status

ChatGPT Codex quota/status checker for [pi](https://pi.dev). Adds a `/status` command and a standalone `pi-codex-status` CLI so you can see Codex 5-hour limits, weekly limits, credits, and reset times before you hit a rate-limit error.

## Why

This replicates Codex' `/status` info that you otherwise can't see by default in pi.  It also provides the data so you can put it in your statusline or anywhere else you want to use it:

- **In pi** — `/status` renders a boxed, themed quota summary and updates a compact footer status.
- **In scripts** — `pi-codex-status statusline` prints a one-line summary suitable for prompts or status bars.
- **For automation** — `pi-codex-status json` returns normalized JSON for custom tooling.

## Features

- Shows the main Codex 5-hour and weekly windows
- Shows credits balance and reset times in local time
- Shows additional named/per-model limits when the backend reports them
- Reads existing MultiCodex, pi, or Codex CLI OAuth credentials; no separate login flow
- Self-caches status data for fast statusline calls
- Opportunistically refreshes the cache from `x-codex-*` provider response headers

## Requirements

- Node.js 20.6 or newer
- pi with the `openai-codex` provider, or Codex CLI, already authenticated
- A ChatGPT plan/account that can use Codex models

In pi, run `/login`, choose the ChatGPT Plus/Pro / OpenAI Codex login, then select an `openai-codex` model. See pi's provider docs: [OpenAI Codex](https://pi.dev/docs/latest/providers#openai-codex).

## Install

Install as a pi extension:

```bash
pi install npm:pi-codex-status
```

Or install directly from GitHub:

```bash
pi install https://github.com/lhl/pi-codex-status
```

Install the standalone CLI globally:

```bash
npm install -g pi-codex-status
```

## Quick Start

```text
/status              # boxed quota summary in pi
/status statusline   # compact one-line output in pi
/codex-status        # alias if another extension claims /status
```

```bash
pi-codex-status statusline
pi-codex-status json | jq '.defaultLimit.primary.leftPercent'
```

Example boxed output:

```text
╭────────────────────────────────────────────────────────────────────────────────────────╮
│ >_ Codex usage                                                                         │
│                                                                                        │
│ Visit https://chatgpt.com/codex/settings/usage for up-to-date                          │
│ information on rate limits and credits                                                 │
│                                                                                        │
│ Account:                    user@example.com (Pro)                                     │
│ Updated:                    5/6/2026, 12:34:56 PM                                      │
│                                                                                        │
│ 5h limit:                   [███████████████████░] 95% left (resets 18:43)             │
│ Weekly limit:               [███████████████████░] 97% left (resets 19:18 on 12 May)   │
│ Credits:                    553 credits                                                │
│                                                                                        │
│ GPT-5.3-Codex-Spark limit:                                                             │
│   5h limit:                 [████████████████████] 100% left (resets 20:26)            │
│   Weekly limit:             [██████████████████░░] 88% left (resets 17:27 on 9 May)    │
╰────────────────────────────────────────────────────────────────────────────────────────╯
```

Example statusline:

```text
5h:95% 7d:97% ↺6d18h
```

## Pi Commands

```text
/status              # boxed quota summary
/status refresh      # bypass the local cache
/status json         # normalized JSON
/status raw          # raw backend usage response
/status statusline   # compact one-line output
/codex-status        # alias if another extension claims /status
```

In interactive pi, `/status` renders as a themed custom message instead of a plain markdown code block. The extension also sets a compact footer status and refreshes the local cache from Codex rate-limit headers when provider responses include them.

## CLI

```bash
pi-codex-status
pi-codex-status status
pi-codex-status statusline
pi-codex-status json
pi-codex-status raw
```

Options:

```text
--auth-source auto|multicodex|pi|codex
--auth-file PATH
--endpoint URL
--cache-file PATH
--max-age SECONDS
--no-cache
--timeout SECONDS
--no-box
```

`statusline` is self-cached through `~/.cache/pi-codex-status/usage.json` so it is safe to call frequently from prompts and status bars.

## How It Works

Primary status data comes from ChatGPT's private Codex usage endpoint:

```text
https://chatgpt.com/backend-api/wham/usage
```

The endpoint returns server-reported `used_percent`, `reset_at`, `limit_window_seconds`, plan, credits, and additional named limits. pi-codex-status normalizes that into display fields:

- `leftPercent = 100 - used_percent`
- Reset timestamps are converted from Unix seconds to local time
- Window durations are preserved as seconds
- Credit balance is displayed as whole credits in the status box; statusline output stays compact
- Additional limits are rendered from `additional_rate_limits[]`

The pi extension also listens to provider responses and opportunistically parses `x-codex-primary-used-percent`, `x-codex-secondary-used-percent`, and related `x-codex-*` headers to refresh the local cache without an extra endpoint call. A `codex.rate_limits` event parser is included for compatibility with Codex's websocket shape.

The endpoint is private and may change. The official fallback is [ChatGPT Codex usage settings](https://chatgpt.com/codex/settings/usage).

## Auth and Cache

Auth lookup order:

1. `~/.pi/agent/codex-accounts.json` (MultiCodex active managed account)
2. `~/.pi/agent/auth.json` (`openai-codex` OAuth entry)
3. `~/.codex/auth.json` (Codex CLI OAuth entry)

Access tokens may be refreshed using the stored refresh token. Tokens are not printed, logged, or stored in the status cache.

Default cache path:

```text
~/.cache/pi-codex-status/usage.json
```

## Development

```bash
git clone https://github.com/lhl/pi-codex-status
cd pi-codex-status
npm install
npm run check
npm test
pi install .
```

Release checklist: [`docs/PUBLISH.md`](docs/PUBLISH.md).

## License

MIT
