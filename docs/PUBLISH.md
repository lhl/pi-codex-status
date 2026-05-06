# Publish Checklist

Steps to publish a new version of `pi-codex-status`.

## Before You Start

- [ ] Decide on version bump (patch/minor/major)
- [ ] Make sure all changes are committed on `main`
- [ ] Make sure `git status -sb` is clean before the release bump
- [ ] Check that the previous version has a git tag and GitHub Release
- [ ] Confirm no secrets are present in docs, fixtures, logs, cache files, or examples

## Verify

- [ ] `npm run check` passes
- [ ] `npm test` passes (build + Node tests)
- [ ] `node dist/cli.js statusline` prints a compact line
- [ ] `node dist/cli.js json | jq '.defaultLimit.primary.leftPercent'` returns a number
- [ ] `node dist/cli.js raw --no-cache` returns raw backend usage JSON without token data
- [ ] `pi --no-session --no-context-files --no-tools -p "/status statusline"` prints statusline output
- [ ] `pi install https://github.com/lhl/pi-codex-status` loads extension resources without errors
- [ ] After install/reload in interactive pi, `/status` renders immediately while idle
- [ ] `/codex-status` alias works

## Review

- [ ] Review README for accuracy (install, CLI commands, slash commands, examples)
- [ ] Confirm README clearly says the ChatGPT backend usage endpoint is private and may change
- [ ] Update README if user-facing behavior changed
- [ ] Update CHANGELOG with the new version section and summary of changes
- [ ] Update `AGENTS.md` if file layout, verification commands, or conventions changed
- [ ] Update `docs/PUBLISH.md` if release process changed
- [ ] Confirm `package.json` metadata is correct: version, repository, files, bin aliases, keywords
- [ ] Confirm `package-lock.json` reflects package name/version changes

## Build Artifacts

This repo commits `dist/` so direct GitHub installs work:

- [ ] Run `npm run build`
- [ ] Stage matching `dist/` changes with source changes
- [ ] Confirm `dist/cli.js` is executable
- [ ] Run `npm pack --dry-run` and confirm package contents include:
  - [ ] `dist/`
  - [ ] `README.md`
  - [ ] `LICENSE`
  - [ ] `CHANGELOG.md`

## Commit and Tag

- [ ] Update `package.json` version
- [ ] Update `package-lock.json` version (`npm install --package-lock-only` if needed)
- [ ] Commit version bump and generated artifacts: `chore: bump version to vX.Y.Z`
- [ ] Tag the commit: `git tag vX.Y.Z`
- [ ] Push commit and tag: `git push && git push --tags`

## Publish

- [ ] `npm publish --dry-run`
- [ ] `npm publish`
- [ ] Create GitHub Release:
  ```bash
  gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(cat <<'EOF'
  <paste changelog section here>
  EOF
  )"
  ```

## After Publishing

- [ ] Verify on npm: `npm info pi-codex-status`
- [ ] Test registry install: `pi install npm:pi-codex-status`
- [ ] Test GitHub install still works: `pi install https://github.com/lhl/pi-codex-status`
- [ ] Verify CLI from a clean install: `pi-codex-status statusline`
- [ ] Update devstack `pi-setup.sh`, `README.md`, and `wiki/tools/pi-agent.md` if the install source changes from GitHub to npm

## Future Considerations

- Trusted publishing via GitHub Actions
- CI workflow for automated `npm run check`, `npm test`, and `npm pack --dry-run`
- Add mocked endpoint tests for token refresh and API response normalization
- Add an integration smoke test for interactive pi command rendering if pi exposes a stable harness
