# pi-codex-status — Agent Guide

ChatGPT Codex quota/status CLI and pi extension. Shows 5h/weekly limits, credits, reset times, and additional named limits from existing pi/Codex OAuth credentials.

## Non-Negotiables

1. **Commit after every logical work unit.** Do not wait to be asked.
2. **Never use `git add .`, `git add -A`, or `git commit -a`.** Stage files explicitly by name.
3. **Do not print, log, commit, or paste OAuth tokens.** Auth files (`~/.pi/agent/auth.json`, `~/.codex/auth.json`) are secrets.
4. **Keep `dist/` in sync with `src/`.** This repo supports direct `pi install https://github.com/lhl/pi-codex-status`, so built files must be committed whenever source changes.

## Summary

- Primary purpose: pi package + standalone CLI (GitHub: `lhl/pi-codex-status`, npm package name reserved as `pi-codex-status`)
- Source-of-truth docs: `README.md` (user-facing docs), `docs/PUBLISH.md` (release checklist), `CHANGELOG.md` (release notes)
- Pi extension entry point: `dist/extension.js` generated from `src/extension.ts`
- CLI entry point: `dist/cli.js` generated from `src/cli.ts`

## Key Files

| Path | Purpose |
|---|---|
| `package.json` | Pi package manifest, CLI bin aliases, npm metadata |
| `src/cli.ts` | `pi-codex-status` / `pi-codex-usage` CLI |
| `src/extension.ts` | Pi extension: `/status`, `/codex-status`, footer status, header cache refresh |
| `src/usage.ts` | ChatGPT Codex usage endpoint fetch + normalization |
| `src/auth.ts` | pi/Codex OAuth auth-file lookup and refresh |
| `src/rate-limits.ts` | `x-codex-*` header and `codex.rate_limits` parser |
| `src/format.ts` | Boxed status, statusline, reset/bar formatting |
| `src/cache.ts` | Self-cache path and cache helpers |
| `test/format.test.mjs` | Node test suite |
| `dist/` | Built package consumed by direct pi GitHub installs |
| `docs/PUBLISH.md` | Release/publish checklist |

## Architecture

### Data Sources

1. Primary idle-time source: `GET https://chatgpt.com/backend-api/codex/usage`
2. Opportunistic in-session source: `x-codex-*` response headers parsed from pi's `after_provider_response` hook
3. Future/available parser: `codex.rate_limits` websocket event parsing in `src/rate-limits.ts`

The ChatGPT backend endpoint is private/reverse-engineered. Keep docs explicit that it may break and that the official fallback is `https://chatgpt.com/codex/settings/usage`.

### Auth Lookup

Lookup order:

1. `~/.pi/agent/auth.json` (`openai-codex` OAuth entry)
2. `~/.codex/auth.json` (Codex CLI OAuth entry)

Access tokens may be refreshed using the stored refresh token. Never expose token values in test output, logs, README examples, GitHub issues, or commits.

### Cache

Default cache path: `~/.cache/pi-codex-status/usage.json`.

The statusline path should remain safe to call frequently; prefer cached data and short timeouts for statusline-style integrations.

## Verification

| Scope | Check |
|---|---|
| Type check | `npm run check` passes |
| Tests/build | `npm test` passes (runs build + Node tests) |
| CLI | `node dist/cli.js statusline` works |
| JSON | `node dist/cli.js json | jq '.defaultLimit.primary.leftPercent'` works |
| Pi print mode | `pi --no-session --no-context-files --no-tools -p "/status statusline"` prints a line |
| Direct install | `pi install https://github.com/lhl/pi-codex-status` loads extension resources |
| Package contents | `npm pack --dry-run` includes `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` |

## Git Discipline

Same as devstack — commit immediately on logical completion, stage explicitly, conventional prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

For source changes, stage the matching `dist/` files in the same commit unless the change is docs-only.
