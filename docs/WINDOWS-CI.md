# Windows CI and MCP subprocess checks

The failed Checks runs introduced with encrypted storage were real cross-process failures. In-process vault tests passed, but a freshly launched MCP server could not unlock the same synthetic Windows-protected key. The generic pairing error then caused downstream retrieval assertions and timeouts.

The Windows runner reproduced the issue using the TypeScript SDK's default filtered subprocess environment. Restoring `PSModulePath` made its key-unlock diagnostic pass; restoring `PROGRAMDATA` or `COMSPEC` alone did not. The original bridge depended on PowerShell cmdlet/module discovery through `Add-Type`, `ConvertFrom-Json` and `New-Object`. The SDK environment behavior is also documented in the [upstream issue](https://github.com/modelcontextprotocol/typescript-sdk/issues/2037).

The bridge now calls the same .NET CurrentUser DPAPI and directory ACL APIs directly, without those PowerShell cmdlets. The private stdin protocol is an operation line followed by base64 data. Keys still cross anonymous pipes only; no secret moves into arguments, environment variables or logs, and the vault encryption/key format is unchanged. No test is skipped and no CI secret or real browser pairing is required.

`node scripts/check-key-protection.js` protects a synthetic key, then verifies it in separate processes under the SDK-default and inherited environments. Its output contains only environment-variable names, pass/fail status and timing. The normal STDIO integration suite remains the end-to-end regression check. Never archive a real cache or broaden permissions to diagnose a failure.

CI runs generated-bundle verification, the full Windows suite, syntax checks and Chrome package validation. Older runs on broken commits remain failed history; verify the run attached to the exact current commit before merging. Source PRs do not publish installers or submit the Chrome extension. Release acceptance and immutable artifact records remain separate.
