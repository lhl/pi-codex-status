# pi-codex-status

Small ChatGPT Codex quota/status checker and [pi](https://pi.dev/) extension.

Pi can use OpenAI Codex models through the `openai-codex` provider with a ChatGPT Plus or Pro account. In pi, run `/login` and choose the ChatGPT Plus/Pro / OpenAI Codex login, then select an `openai-codex` model. See Pi's provider docs: [OpenAI Codex](https://pi.dev/docs/latest/providers#openai-codex).

This extension reads existing OAuth credentials from `~/.pi/agent/auth.json` first, then falls back to `~/.codex/auth.json`. No separate login is required if pi or Codex CLI is already authenticated.

## What it shows

- Main Codex 5-hour window
- Main Codex weekly window
- Credits balance
- Additional named/per-model limits such as `GPT-5.3-Codex-Spark`
- Reset times in local time

## How it works

Primary status data comes from ChatGPT's private Codex usage endpoint:

```text
https://chatgpt.com/backend-api/codex/usage
```

The endpoint returns server-reported `used_percent`, `reset_at`, `limit_window_seconds`, plan, credits, and additional named limits. `pi-codex-status` normalizes that into display fields:

- `leftPercent = 100 - used_percent`
- Reset timestamps are converted from Unix seconds to local time
- Window durations are preserved as seconds
- Credit balance is displayed as whole credits in the status box/statusline
- Additional limits are rendered from `additional_rate_limits[]`

The pi extension also listens to provider responses and opportunistically parses `x-codex-primary-used-percent`, `x-codex-secondary-used-percent`, and related `x-codex-*` headers to refresh the local cache without an extra endpoint call. A `codex.rate_limits` event parser is included for compatibility with Codex's websocket shape.

This is the same family of data Codex surfaces through usage status, `x-codex-*` headers, and `codex.rate_limits` events. The endpoint is private and may change. The official fallback is [ChatGPT Codex usage settings](https://chatgpt.com/codex/settings/usage).

## CLI

```bash
npm install
npm run build
npm link

pi-codex-status
pi-codex-status status
pi-codex-status statusline
pi-codex-status json
pi-codex-status raw
```

Example:

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

Script-friendly output:

```bash
pi-codex-status json | jq '.defaultLimit.primary.leftPercent'
pi-codex-status statusline
```

`statusline` is self-cached through `~/.cache/pi-codex-status/usage.json` so it is safe to call from a prompt/status line. `pi-codex-usage` is kept as a backwards-compatible CLI alias.

Options:

```text
--auth-source auto|pi|codex
--auth-file PATH
--endpoint URL
--cache-file PATH
--max-age SECONDS
--no-cache
--timeout SECONDS
--no-box
```

## Pi extension

Install into pi:

```bash
pi install https://github.com/lhl/pi-codex-status
```

Commands:

```text
/status              # boxed quota summary
/status refresh      # bypass cache
/status json         # normalized JSON
/status raw          # raw backend response
/status statusline   # compact one-line output
/codex-status        # alias, in case another extension claims /status
```

The extension also sets a compact footer status such as:

```text
Codex 5h:95% left 7d:97% left pro reset:18:43 credits:553
```

On provider responses, it opportunistically parses `x-codex-primary-used-percent`, `x-codex-secondary-used-percent`, and related `x-codex-*` headers to refresh the local cache without an extra endpoint call.

## Development

```bash
npm install
npm run check
npm test
```

Release checklist: [`docs/PUBLISH.md`](docs/PUBLISH.md).
