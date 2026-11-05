# Contributing

Check the [roadmap](docs/ROADMAP.md) and [release checklist](docs/RELEASE-CHECKLIST.md) before starting a feature. Chrome Web Store submission is the current priority. The tested release targets NYU Brightspace, Chrome and a local Windows companion.

Use Node.js 22+, run `npm ci`, load `extension/` as an unpacked Chrome extension, then run `npm run companion`. See the README for pairing and MCP setup.

Run `npm test` and `npm run check` before submitting changes, and `npm run package:extension` after browser changes. After editing `assets/rich-text.js` or `assets/document-formats.js`, regenerate the checked-in modules with `npm run build:rich-text`; `npm run build:rich-text -- --check` verifies them. Commit generated files with their source changes.

Describe the problem, resulting behavior and relevant validation in pull requests. Use synthetic fixtures. Include versions and sanitized error codes in bug reports when useful.

Keep downloaded material, real catalogs, pairing files, cookies, browser profiles, tokens and build output out of commits and issue attachments. Inspect the staged diff as well as ignore rules. Only request course content the signed-in user can access. Preserve third-party license notices.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) and report privately rather than posting exploit details in a public issue.
