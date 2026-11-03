# Companion terminal diagnostics

The companion prints timestamped diagnostic events at INFO level by default. Each line has a stable event name, a short explanation and a small set of relevant fields.

Normal events cover:

- Startup: process ID, Node version, resolved cache directory, listen address and cached-PDF count.
- Pairing success/failure and rejected connections, distinguishing missing pairing, browser-origin mismatch and token mismatch.
- Authenticated browser worker connect/disconnect, without logging keepalive traffic.
- Catalog sync counts and semester ID.
- Queued/claimed/ready/failed retrievals with request, course and topic IDs, plus failure codes such as `NETWORK_ERROR` or `NEEDS_LOGIN`.
- Cache hit/miss, stored byte count and eviction count.
- Interrupted requests requeued on startup and explicit login retries.
- Shutdown when a handled SIGINT/SIGTERM is received, and startup failures such as an occupied port.

Example shape (IDs abbreviated here):

```text
2026-11-03T12:00:00.000Z INFO app.ready Companion ready url="http://127.0.0.1:47653" files=5 bytes=10842281
2026-11-03T12:00:02.000Z INFO retrieval.queued PDF request queued requestId="..." courseId="607472" topicId="14117220" workerConnected=true
2026-11-03T12:00:03.000Z WARN retrieval.failed PDF request failed requestId="..." courseId="607472" topicId="14117220" code="NETWORK_ERROR"
```

Normal idle status/claim polling is silent. Identical authentication/pairing warnings are limited to one line per reason every 30 seconds. Log-output failures cannot fail pairing or document operations.

## Verbose mode

Stop the existing companion, then use **Start menu → Brightspace Context → Troubleshooting → Companion (verbose logs)** in the v0.8.4 installer. It starts the same companion with DEBUG logging, adding local HTTP method, route category, response status and duration. It does not log request bodies or headers.

For a source checkout in PowerShell:

```powershell
$env:BRIGHTSPACE_LOG_LEVEL = 'debug'
npm.cmd run companion
```

Supported levels are `debug`, `info`, `warn`, `error` and `silent`. The ordinary launcher defaults to INFO. Restart the process after changing its level. An already running companion does not reload updated code or environment settings.

## Data included

The diagnostic logger uses an explicit event/field allowlist. It never dumps request objects, error stacks, authentication headers, bearer tokens, pairing codes, upload tickets, leases, PDF contents, course/document titles, descriptions or Brightspace resource URLs. Text fields are bounded and terminal control characters are stripped. The local cache directory and loopback URL are intentional startup fields.

The pairing code is still displayed once in the existing interactive setup prompt, outside diagnostic event lines. This implementation writes diagnostics to the terminal only; it does not create or upload persistent log files. The STDIO MCP server remains quiet except for its JSON-RPC transport.
