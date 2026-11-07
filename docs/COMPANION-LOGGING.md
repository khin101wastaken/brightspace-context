# Companion terminal diagnostics

Normal output uses short local-time status lines. It shows browser connection changes, one useful cache/sync outcome, offline queues and actionable warnings. Request IDs, internal event names, queue claims, cache misses and HTTP polling/timings are reserved for verbose mode.

```text
[09:00:01] NYU: Browser connected
[09:00:01] Demo: Browser connected
[09:00:03] NYU: Catalog synced (5/5 courses)
[09:00:05] Demo: Document cached (36 KB)
[09:00:07] Demo: Cache hit; no download
[09:00:09] NYU: Document queued; waiting for browser
[09:00:12] NYU: Warning: Document request failed (NEEDS_LOGIN) Sign into NYU Brightspace in Chrome, then retry.
```

A successful model request no longer prints separate queued, claimed, cache-miss, stored and ready messages at normal verbosity. A manual cache operation still reports its result. Completed discovery reports the semester count; completed scans report successful/total courses. Idle status/claim polling and heartbeats are silent. NYU/Demo labels distinguish the two libraries without printing private course titles. Identical authentication/pairing warnings are limited to one per provider/reason every 30 seconds.

Startup prints the local address, cache location/count/size, pairing code and demo URL once, with a pointer to verbose logging. Normal output omits duplicate structured ready/stopping events. The cache, pairing and request behavior are unchanged.

## Verbose mode

Stop the existing companion, then choose **Start menu → Brightspace Context → Troubleshooting → Companion (verbose logs)**. It starts the same companion with DEBUG logging. Full ISO timestamps, stable event names, provider, request/course/topic/semester IDs and allowlisted diagnostic fields remain available, including local HTTP method, route category, status and duration.

For a source checkout in PowerShell:

```powershell
$env:BRIGHTSPACE_LOG_LEVEL = 'debug'
npm.cmd run companion
```

Supported levels are `debug`, `info`, `warn`, `error` and `silent`. The ordinary launcher defaults to INFO. Restart after changing the code or level. `silent` suppresses diagnostic events; it does not hide the interactive startup/pairing prompt.

## Privacy and reliability

The logger accepts only known events and allowlisted fields. Neither mode prints request bodies/headers, bearer tokens, upload tickets, leases, document contents, course/document titles, descriptions or Brightspace resource URLs. Text fields are bounded and terminal control characters are removed. The cache directory and loopback URL are intentional startup fields; the pairing code appears once in the interactive prompt, outside diagnostic events. Logging failures cannot fail the underlying operation.

Logs go to the terminal only, without a persistent log file or upload. The STDIO MCP server still reserves stdout for JSON-RPC and does not use the companion terminal logger.

## Release status

The concise-output change ships in companion 0.9.4. The Chrome extension remains 0.9.3, and the previously frozen v0.9.3 installer/checksum remain available. No extension reload or Chrome package replacement is needed for this companion-only change once it is shipped. Starting an already installed older companion will keep its older logging behavior until that app is updated.
