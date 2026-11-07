# Contributing

Check the [roadmap](docs/ROADMAP.md) and [release checklist](docs/RELEASE-CHECKLIST.md) before starting a feature. Chrome Web Store submission is the current priority. The tested release targets NYU Brightspace, Chrome and a local Windows companion.

Use Node.js 22.13+, run `npm ci`, load `extension/` as an unpacked Chrome extension, then run `npm run companion`. See the README for pairing and MCP setup.

For code changes, run `npm test` and `npm run check`. Run `npm run package:extension` after browser changes. After editing `assets/`, the bundle builder, or bundled dependencies, regenerate the checked-in browser and companion modules and support assets with `npm run build:rich-text`. Verify them with `npm run build:rich-text -- --check`. Commit generated files and upstream licenses with their source changes.

Describe the problem, resulting behavior and relevant validation in pull requests. Use synthetic fixtures. Include versions and sanitized error codes in bug reports when useful.

## Keeping GitHub current

Commit small, low-risk changes such as README corrections directly to `main` after checking the diff and running any relevant validation. Check GitHub Actions after pushing.

Use a short `codex/` branch and a pull request for changes that substantially affect behavior, security, packaging or CI. Run the relevant checks locally and verify that GitHub Actions passes on the PR's latest commit before merging. Commit verified milestones and keep unrelated work in separate commits.

Keep `main` as the public source baseline. Once a PR is green and reviewed, merge it, confirm the resulting main-branch check, and close the completed branch. Tag releases only after their versioned artifacts and acceptance records match the source commit. Keep published versioned downloads immutable; update setup/reviewer documentation with the corresponding release, not with an untested local patch.

When a Windows-only failure occurs in an MCP subprocess, use the key-protection preflight and the real STDIO integration tests. They use synthetic keys and private temporary test directories, and report status/timing rather than key material. Never upload a real cache or broaden CI permissions as a debugging shortcut.

Keep downloaded material, real catalogs, pairing files, cookies, browser profiles, tokens and build output out of commits and issue attachments. Inspect the staged diff as well as ignore rules. Only request course content the signed-in user can access. Preserve third-party license notices.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) and report privately rather than posting exploit details in a public issue.
