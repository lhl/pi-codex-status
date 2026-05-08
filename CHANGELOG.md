# Changelog

All notable changes to `pi-codex-status` will be documented here.

## Unreleased

- Prefer the active MultiCodex managed account from `~/.pi/agent/codex-accounts.json` before falling back to pi or Codex CLI auth.
- Switch the default usage endpoint to ChatGPT's current `/backend-api/wham/usage` path.
- Condense `statusline` output to `5h:95% 7d:97% ↺6d18h` style.

## [0.1.0] - 2026-05-06

- Initial public GitHub release.
- Add `pi-codex-status` CLI with `status`, `statusline`, `json`, and `raw` output modes.
- Add pi extension commands `/status` and `/codex-status`.
- Render `/status` as a themed custom message in interactive pi instead of the default labeled markdown/code-block wrapper.
- Read existing OAuth credentials from `~/.pi/agent/auth.json` or `~/.codex/auth.json`.
- Fetch ChatGPT Codex 5h/weekly usage, credits, reset times, and additional named limits from the Codex usage endpoint.
- Parse `x-codex-*` rate-limit headers opportunistically from pi provider responses.
- Cache status data at `~/.cache/pi-codex-status/usage.json`.
- Document pi `openai-codex` provider setup with `/login` and ChatGPT Plus/Pro.
- Explain how status values are sourced and normalized from the Codex usage endpoint and `x-codex-*` headers.
- Add release checklist and agent guide for future polish/publish passes.
