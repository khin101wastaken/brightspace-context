# Brightspace Context - Development Roadmap

The unlisted Chrome extension 0.10.0 beta is live, and the public setup guide links to the Chrome Web Store. The extension supports standalone browsing and downloads for NYU and Hosted demo. A paired Windows companion adds encrypted caching and on-demand PDF, Word and PowerPoint retrieval and text reading in Codex. Windows companion 0.10.1 beta adds tray controls, a dashboard, guided Codex registration and cache/queue controls. Before the small NYU pilot, verify the store-installed Hosted demo in a clean Chrome profile and run the full Windows setup through a real course-file read. Hosted course-data access, indexing and OCR remain deferred.

**16 done | 3 in_progress | 2 next | 3 planned | 0 research | 9 deferred**

> Editable source: [roadmap.json](roadmap.json). Reusable structure: [roadmap.schema.json](roadmap.schema.json). Regenerate with `npm run roadmap`.

**Reading the chart:** green = completed with evidence; sky blue = partly implemented; purple = recommended next; blue-gray = planned; amber = research; dashed gray = deferred. Solid arrows are prerequisites. Dashed arrows are optional follow-ups, not release blockers. No dates or effort estimates are implied.

```mermaid
%% Generated from roadmap.json. Edit the source, then run npm run roadmap.
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Segoe UI, system-ui, sans-serif","fontSize":"14px","lineColor":"#94a3b8","clusterBkg":"#f8fafc","clusterBorder":"#cbd5e1","primaryTextColor":"#0f172a"},"flowchart":{"curve":"basis","nodeSpacing":24,"rankSpacing":42,"htmlLabels":true}}}%%
flowchart TB
  subgraph p_core["01 / Working foundation"]
    direction LR
    m_catalog["DONE<br/>Semester catalog + hierarchy"]:::done
    m_cache["DONE<br/>Bounded local document cache"]:::done
    m_retrieval["DONE<br/>On-demand desktop MCP retrieval"]:::done
    m_catalog_sync["DONE<br/>Model-initiated catalog refresh"]:::done
    m_formats["DONE<br/>PDF / PPTX / DOCX transport"]:::done
    m_module_notes["DONE<br/>Module landing-page context"]:::done
    m_document_text["DONE<br/>Paged document text + cache links"]:::done
  end
  subgraph p_readiness["02 / Ready for classmates"]
    direction LR
    m_lifecycle["IN PROGRESS<br/>Companion lifecycle"]:::in_progress
    m_onboarding["NEXT<br/>Verify fresh Windows setup and Codex"]:::next
    m_controls["DONE<br/>Retrieval and cache controls"]:::done
    m_hardening["IN PROGRESS<br/>Release reliability checks"]:::in_progress
    m_installer["DONE<br/>Windows installer preview"]:::done
    m_file_readers["DONE<br/>Real client file-reading checks"]:::done
    m_terminal_readability["DONE<br/>Readable companion terminal output"]:::done
    m_encrypted_storage["DONE<br/>Encrypted storage + explicit document handoff"]:::done
  end
  subgraph p_release["03 / Desktop beta and distribution"]
    direction LR
    m_pilot["PLANNED<br/>Small NYU student pilot"]:::planned
    m_desktop_release["IN PROGRESS<br/>Accessible desktop release"]:::in_progress
    m_store_assets["DONE<br/>Store ZIP + public privacy policy"]:::done
    m_beta_bundle["DONE<br/>0.10.0 beta: freeze, bundle + acceptance"]:::done
    m_store_listing["DONE<br/>Chrome Web Store listing published"]:::done
    m_store_install["NEXT<br/>Verify Chrome Web Store installation"]:::next
    m_review_demo["DONE<br/>Fictional LMS for reviewer testing"]:::done
  end
  subgraph p_web["Deferred / Hosted course-data access"]
    direction LR
    m_web_handoff["DEFERRED<br/>Prove hosted PDF handoff"]:::deferred
    m_remote_bridge["DEFERRED<br/>Authenticated extension relay"]:::deferred
    m_hosted_release["DEFERRED<br/>Hosted plugin pilot + release"]:::deferred
  end
  subgraph p_later["Later / Optional expansion"]
    direction LR
    m_firefox["DEFERRED<br/>Firefox port"]:::deferred
    m_platforms["DEFERRED<br/>More platforms + Brightspace tenants"]:::deferred
    m_indexing["DEFERRED<br/>Optional full-text search / RAG"]:::deferred
    m_ocr["DEFERRED<br/>OCR only if justified"]:::deferred
    m_mcp_install["PLANNED<br/>Local ChatGPT plugin package"]:::planned
    m_account_switching["DEFERRED<br/>Brightspace account switching"]:::deferred
    m_claude["PLANNED<br/>Claude Desktop package"]:::planned
    m_download_banner["DEFERRED<br/>Auto-dismiss the download banner"]:::deferred
  end
  m_catalog --> m_cache
  m_cache --> m_retrieval
  m_retrieval --> m_lifecycle
  m_retrieval --> m_controls
  m_retrieval --> m_hardening
  m_onboarding --> m_pilot
  m_controls --> m_pilot
  m_controls -.-> m_account_switching
  m_hardening --> m_pilot
  m_pilot --> m_desktop_release
  m_desktop_release -.-> m_web_handoff
  m_web_handoff --> m_remote_bridge
  m_remote_bridge --> m_hosted_release
  m_desktop_release -.-> m_firefox
  m_desktop_release -.-> m_platforms
  m_desktop_release -.-> m_indexing
  m_desktop_release -.-> m_ocr
  m_catalog --> m_module_notes
  m_cache --> m_formats
  m_retrieval --> m_installer
  m_installer --> m_mcp_install
  m_installer --> m_onboarding
  m_desktop_release -.-> m_mcp_install
  m_lifecycle -.-> m_onboarding
  m_formats --> m_file_readers
  m_file_readers --> m_pilot
  m_installer --> m_store_assets
  m_store_assets --> m_store_listing
  m_store_listing --> m_store_install
  m_store_listing --> m_onboarding
  m_store_install --> m_pilot
  m_installer -.-> m_claude
  m_catalog --> m_catalog_sync
  m_retrieval --> m_catalog_sync
  m_encrypted_storage --> m_store_listing
  m_review_demo --> m_store_listing
  m_formats --> m_document_text
  m_encrypted_storage --> m_document_text
  m_document_text --> m_beta_bundle
  m_installer --> m_beta_bundle
  m_review_demo --> m_beta_bundle
  m_terminal_readability --> m_beta_bundle
  m_store_assets --> m_beta_bundle
  m_beta_bundle --> m_store_listing
  m_file_readers --> m_beta_bundle
  classDef done fill:#e8f5ee,stroke:#319465,color:#164b33,stroke-width:1.5px;
  classDef in_progress fill:#e0f2fe,stroke:#0284c7,color:#075985,stroke-width:2px;
  classDef next fill:#ede9fe,stroke:#7c3aed,color:#4c1d95,stroke-width:3px;
  classDef planned fill:#eef3f9,stroke:#94a3b8,color:#334155,stroke-width:1px;
  classDef research fill:#fff4df,stroke:#d99a24,color:#783c0b,stroke-width:1.5px;
  classDef deferred fill:#f5f5f5,stroke:#b4b9c2,color:#626b79,stroke-dasharray:4 3;
```

## Update or reuse

1. Edit milestones in `roadmap.json`: keep each `id` stable, set its `status`, and describe its deliverable and acceptance criteria.
2. Add phases or dependencies as needed. Every edge references milestone IDs; the generator rejects missing references, duplicate edges and cycles.
3. Run `npm run roadmap`. Commit the source and regenerated files together.
4. For another project, copy the JSON/schema and run `node scripts/generate-roadmap.js path/to/roadmap.json output-directory`.

The schema supports editor validation. The generator performs structural and graph checks without adding project dependencies. The `.mmd` output can be used directly in Mermaid-compatible tools.

## 01 / Working foundation

### Semester catalog + hierarchy - DONE

Discover semesters and courses inside Resources, preserve all accessible nested modules and stable resource IDs, and expose catalog search through MCP.

Acceptance:

- A desktop chat can locate Science of Happiness readings across a synced semester without downloading every file.

Evidence:

- User confirmed 5/5 courses synced from Resources without navigating Brightspace tabs.
- A separate desktop chat located Science of Happiness readings.
- Inline Download and Save as support accessible NYU-hosted files across formats.

### Bounded local document cache - DONE

Pair Chrome with the local companion and cache individual PDF, PPTX and DOCX files with freshness checks, SHA-256 verification, a 500 MiB LRU budget per isolated NYU/demo library and a 50 MiB per-file limit.

Acceptance:

- First requests fetch original file bytes; repeats use the verified cache.
- Old PDF cache entries remain usable after adding Office formats.

Evidence:

- Chrome PDF first-fetch/cache-hit behavior confirmed live.
- Automated Office transport, invalid-package rejection, cache restart and PDF compatibility tests pass.
- The v0.8.8 packaged runtime passed PDF/PPTX/DOCX byte-equality, MIME-type and restart checks.

Prerequisites: Semester catalog + hierarchy.

### On-demand desktop MCP retrieval - DONE

Connect catalog requests to a durable queue, the signed-in Chrome worker and verified original files; answer content questions through bounded text pages without a default plaintext export.

Acceptance:

- A chat can request one catalogued file and receive verified original bytes, correct MIME/extension and an explicit reading route.
- PDF answers use actual document text; offline/login/failure states provide recovery steps. Normal retrieval creates no plaintext server file.

Evidence:

- Live uncached PDF fetch, document reading and repeat cache hits were verified through desktop MCP.
- The refreshed live connector read a real 10-page PDF completely: 20,454 characters in two responses, with no empty text pages and no plaintext export. User confirmed it works.
- 140 source tests pass, including browser-worker/cache/MCP integration, ordered Office text, PDF pagination, parser limits, expiring links and encrypted-storage recovery.

Prerequisites: Bounded local document cache.

### Model-initiated catalog refresh - DONE

Discover semesters and refresh one semester through durable MCP requests and the paired Chrome worker, without opening Resources.

Acceptance:

- A connected desktop model refreshes a live semester and searches its current readings with Resources closed.
- Expired sessions preserve partial results and resume through MCP after browser sign-in.

Evidence:

- Real STDIO MCP, authenticated companion/WebSocket and actual extension background integration tests pass with synthetic school responses.
- Shared leases, progress renewal, deduplication, rate limiting, login retry, pause at module boundaries and version-one queue migration are tested.
- November 6, 2026: user confirmed the requested live 2026 Fall refresh with Resources closed worked, and the companion terminal also reported success. No course count or refreshed timestamp was captured in this confirmation.
- Live signed-in refresh is accepted in the current setup. Session-expiry/partial-result retry has automated integration evidence; a live expired-session exercise is not claimed.

Prerequisites: Semester catalog + hierarchy; On-demand desktop MCP retrieval.

### PDF / PPTX / DOCX transport - DONE

Retrieve and cache original PDF, PPTX and DOCX files and return the correct extension and MIME type through MCP, without OCR or conversion.

Acceptance:

- Each format passes fetch, cache-hit, byte-equality and restart checks.
- Malformed/mismatched Office containers and login HTML do not become cached documents.

Evidence:

- 80 local tests passed, including full PPTX and DOCX browser-worker/MCP flows.
- The final Windows payload passed PDF/PPTX/DOCX handoff checks using its bundled runtime.
- The real Adolescence and Peers Fall 26 CC deck is recognized as a supported PPTX. The user separately confirmed live PPTX reading on November 6; the acceptance report did not name the tested deck.

Prerequisites: Bounded local document cache.

### Module landing-page context - DONE

Preserve module descriptions, readings, film references and links in the local catalog and return them through MCP; expose collapsed Module notes in Resources.

Acceptance:

- The real Topic 9 module text is visible in Resources and returned by MCP with its source URL.

Evidence:

- User confirmed the readings and Me, Earl and the Dying Girl appear in Module notes.
- A fresh MCP process returned the actual Topic 9 reading list, film reference and module URL.
- v0.8.8 search highlighting was verified in standalone Chrome: matching notes open with highlighted text and direct-match counts; the deepest filename match receives row emphasis.

Prerequisites: Semester catalog + hierarchy.

### Paged document text + cache links - DONE

Read existing PDF text layers and Word/PowerPoint XML in small checksum-bound pages; provide explicit expiring local download links to originals.

Acceptance:

- Supported formats have bounded original-text reading without OCR, host-installed parsers or default plaintext exports.
- Pagination is explicit and detects document changes; original-byte access remains available for visual or unsupported content.
- The actual desktop connector reads a complete real PDF; remaining client/format checks stay tracked separately.

Evidence:

- 140 tests pass. PDF parsing has worker deadlines/heap limits, bounded concurrent work, page/text limits and no runtime network fetching.
- The live connector read all 10 pages of a real PDF in two responses; the user accepted the retrieval pipeline. Real Word text was also read through MCP.
- Expiring links return byte-identical originals, bind to provider/file version/pairing and expire or revoke without a plaintext server file. PDF visual layout/images and scanned pages remain outside text-only coverage.

Prerequisites: PDF / PPTX / DOCX transport; Encrypted storage + explicit document handoff.

## 02 / Ready for classmates

### Companion lifecycle - IN PROGRESS

Provide start/stop controls, optional startup on sign-in, visible connection health and clean recovery after reboot or companion restart.

Acceptance:

- A user can start and recover the companion without a terminal.
- Restarting the computer preserves pairing, catalog and cache, and retrieval resumes when enabled.

Evidence:

- Companion 0.10.1 includes a tray menu, optional launch at Windows sign-in, a pairing-code popup, and a browser dashboard with connection status.
- The dashboard retains authorization on refresh in the same tab. The tray and dashboard link to the hosted setup guide.
- A full reboot test on a clean Windows setup still needs to verify launch at sign-in, pairing retention and retrieval recovery.

Prerequisites: On-demand desktop MCP retrieval.

### Verify fresh Windows setup and Codex - NEXT

Follow the public setup guide from a clean Windows setup using the store extension and the current companion candidate. Check pairing, Codex registration and a real NYU file read before choosing the installer for the pilot.

Acceptance:

- A fresh Windows account can install and connect without separately installing Node, cloning source or entering shell commands.
- The store extension pairs with the companion, Codex discovers the registered MCP connection after restart, and a real NYU file is retrieved and read.

Evidence:

- The public guide starts with Chrome Web Store installation and includes Hosted demo instructions.
- Companion 0.10.1 offers Connect to Codex in its dashboard, with manual setup available for other local MCP clients.
- The full first-time path with the store extension and local candidate is pending.

Prerequisites: Windows installer preview; Chrome Web Store listing published.

### Retrieval and cache controls - DONE

Provide course selection, retrieval pause and resume, browser disconnect, cached-file inspection and removal, and cancellation for queued retrievals.

Acceptance:

- A user can inspect and remove cached originals, pause retrieval, disconnect the browser and cancel requests that are still waiting.

Evidence:

- The extension supports course selection, retrieval pause and resume, browser disconnect and pairing reset.
- The local companion dashboard shows cached files and queued requests. It supports individual removal, clearing the selected library and cancelling requests that are still waiting. Management API and queue cancellation tests passed.

Prerequisites: On-demand desktop MCP retrieval.

### Release reliability checks - IN PROGRESS

Exercise the existing recovery behavior across real session expiry, course changes, permission loss, restarts and multiple tabs/profiles; improve actionable errors.

Acceptance:

- Signed-out, inaccessible, changed and unsupported resources produce clear recovery steps.
- A fresh-profile check covers scan, fetch, read, repeat and restart without mixing courses.

Evidence:

- 140 source tests cover existing retrieval, PDF/Office text reading, byte integrity, paging, parser limits, demo isolation, pairing, queue recovery and encrypted-storage behavior.
- The frozen 0.10.0 beta passed packaged-runtime smoke and an isolated upgrade from 0.9.4. The publisher confirmed live NYU retrieval and cache reuse.
- The isolated 0.10.0.10 to 0.10.0.11 upgrade passed with the tray and an MCP connection running. Pairing, encrypted cache and queued requests survived.
- The dashboard refresh fix passed in Chrome. Fresh setup, full reboot, and live sign-in and profile recovery checks remain open.

Prerequisites: On-demand desktop MCP retrieval.

### Windows installer preview - DONE

Provide a Windows x64 installer with pinned Node, production dependencies, a companion launcher, setup guide and uninstall support.

Acceptance:

- The packaged runtime starts, pairs, serves supported cached files through MCP and preserves them across restart.

Evidence:

- Published Windows companion 0.9.4 bundles its pinned Node runtime, production dependencies, MCP, companion and unpacked extension.
- Packaged-runtime smoke and isolated 0.9.3-to-0.9.4 upgrade checks passed; installer hashes and immutable release records are retained.
- The 0.10.0 beta installer is built and checksum-verified. Its packaged runtime and an isolated upgrade from 0.9.4 passed.
- Companion 0.10.1 adds hosted setup links in the tray menu and dashboard.

Prerequisites: On-demand desktop MCP retrieval.

### Real client file-reading checks - DONE

Record actual file-reading evidence for PDF, PPTX and DOCX in the current Windows desktop setup, using bounded local text tools and original-file fallback where visual inspection is needed.

Acceptance:

- A real PPTX is retrieved and its slide content is read in the supported desktop chat.
- A real DOCX is retrieved/read and repeated requests use the cache.
- The current Windows desktop setup has actual PDF, PPTX and DOCX reading evidence; other clients require their own acceptance checks.

Evidence:

- Live desktop PDF text reading is confirmed through the actual connector, including complete continuation across two responses.
- A real DOCX syllabus was read through the connector and installed-runtime checks; its original checksum and grading text were verified.
- November 6, 2026: user confirmed that live PPTX reading works. The tested deck title was not specified; this does not claim the named example deck, Claude or every desktop client was tested.

Prerequisites: PDF / PPTX / DOCX transport.

### Readable companion terminal output - DONE

Make ordinary companion output concise and readable, while retaining useful detail in verbose mode.

Acceptance:

- Normal output summarizes connection, sync and retrieval outcomes without flooding the terminal with IDs and repeated events.
- Login, failure and recovery actions remain clear; verbose mode retains structured diagnostic detail without exposing credentials or course contents.

Evidence:

- Compact normal logs, separate NYU/demo labels, useful sync/cache outcomes and actionable errors are implemented. Verbose mode retains structured diagnostics without file contents or credentials.
- Published companion 0.9.4 includes the change; packaged-runtime smoke and isolated 0.9.3-to-0.9.4 upgrade checks passed.

### Encrypted storage + explicit document handoff - DONE

Protect persistent companion and browser data with Windows-protected keys; read requested bytes/text in memory, gate temporary plaintext exports separately, and scope user-requested download links to one file version.

Acceptance:

- Verified migration preserves catalogs, original document bytes, pairing and pending requests.
- No plaintext path or persistent browser bearer/key is produced by normal retrieval.
- Packaged-runtime and installed-upgrade checks pass; live client acceptance is recorded separately.

Evidence:

- 128 source tests pass, including native key protection, corruption/key-loss/access-error preservation, origin-bound browser unlocking, port-before-migration startup and export revocation.
- The encrypted Windows runtime and isolated 0.9.1-to-0.9.2 migration/upgrade passed; historical artifact verification is recorded in store/RELEASE-0.9.2.md. Subsequent installed working-copy and live retrieval checks are recorded separately.
- Matching v0.9.2 public installer, setup guide and versioned privacy policy published as site version 6; the public installer SHA-256 matches the frozen tested artifact.
- Installed and live connector checks verified original cached bytes and bounded text reading without a plaintext server copy. Explicit five-minute download capabilities and separately enabled 15-minute filesystem exports retain different lifetimes and disclosures.

## 03 / Desktop beta and distribution

### Small NYU student pilot - PLANNED

Invite 3-5 classmates with different courses to try the single-account Windows and Chrome workflow. Observe setup and retrieval and collect consented, redacted bug reports.

Acceptance:

- Participants complete setup and retrieve/read their own supported course files without developer assistance.
- Pilot failures are recorded and resolved before broad distribution.

Prerequisites: Verify fresh Windows setup and Codex; Retrieval and cache controls; Release reliability checks; Real client file-reading checks; Verify Chrome Web Store installation.

### Accessible desktop release - IN PROGRESS

Prepare versioned installers, extension distribution, desktop plugin packaging, privacy disclosures, permission explanations and support instructions; complete applicable reviews.

Acceptance:

- A new user can follow a public installation guide and reach a successful document answer without terminal commands.
- Update, uninstall, data deletion and supported-platform boundaries are documented and verified.

Evidence:

- The unlisted 0.10.0 Chrome extension, the public setup guide and the public 0.10.1 Windows companion are available.
- Companion 0.10.1 packages the completed Windows changes. Store and fresh Windows acceptance precede the student pilot.

Prerequisites: Small NYU student pilot.

### Store ZIP + public privacy policy - DONE

Prepare a minimal browser ZIP, local readable JavaScript bundles, icons, listing/permission drafts and a public policy matching local file handling.

Acceptance:

- ZIP integrity and local dependency checks pass without including private runtime/course files.
- The privacy policy is publicly readable and covers PDF/PPTX/DOCX handling.

Evidence:

- The final 0.10.0 Chrome ZIP, icons, listing material and screenshots, including the actual Chrome popup, were prepared for submission.
- Public setup, reviewer and privacy pages match the beta. Public source is MIT-licensed.

Prerequisites: Windows installer preview.

### 0.10.0 beta: freeze, bundle + acceptance - DONE

Freeze current UI, demo, encrypted storage, logging and paged document-reading changes into matching 0.10.0 beta artifacts; verify the actual release build before publishing it.

Acceptance:

- Version metadata, source checkpoint, extension ZIP, Windows installer and artifact hashes identify the final candidate.
- Packaged-runtime smoke and isolated 0.9.4-to-beta upgrade checks pass against the frozen installer.
- Live NYU retrieval and cache reuse work on the beta. The final Chrome ZIP can sync, search and download fictional resources in a clean profile without pairing.
- Setup, reviewer and privacy materials match the beta.

Evidence:

- The frozen 0.10.0 beta was built with recorded hashes. Packaged-runtime smoke and isolated 0.9.4-to-beta upgrade checks passed.
- The publisher confirmed live NYU retrieval and cache reuse on 0.10.0.
- Hosted demo in the extracted final Chrome ZIP synced both courses, found a module note, and downloaded the original sample PDF in a clean profile without the companion.

Prerequisites: Paged document text + cache links; Windows installer preview; Fictional LMS for reviewer testing; Readable companion terminal output; Store ZIP + public privacy policy; Real client file-reading checks.

### Chrome Web Store listing published - DONE

Publish the 0.10.0 beta as an unlisted Chrome Web Store item and link to it from the public setup guide.

Acceptance:

- The store listing offers Add to Chrome and is linked from the public setup guide.

Evidence:

- The publisher completed submission on November 7, 2026. The published [Chrome Web Store listing](https://chromewebstore.google.com/detail/brightspace-context/iadmhandkbomngnaplppiopojmfkcodi) showed Add to Chrome.
- The deployed [public setup guide](https://brightspace-context.khin101.chatgpt.site/setup/) leads with the verified store link.

Prerequisites: Store ZIP + public privacy policy; Encrypted storage + explicit document handoff; Fictional LMS for reviewer testing; 0.10.0 beta: freeze, bundle + acceptance.

### Verify Chrome Web Store installation - NEXT

Install from the published listing in a clean Chrome profile and verify Hosted demo using that installed copy.

Acceptance:

- The listing installs 0.10.0 without Developer mode.
- Hosted demo opens, syncs, searches and downloads from the store-installed extension without the companion.

Evidence:

- Hosted demo passed with the final extracted extension ZIP. A clean install and demo run using the actual store listing remain pending.

Prerequisites: Chrome Web Store listing published.

### Fictional LMS for reviewer testing - DONE

Offer Hosted demo for companion-free extension testing and Local demo for testing the companion and MCP with fictional courses.

Acceptance:

- Reviewers can sync, search and download sample documents using Hosted demo without NYU credentials or the companion.
- Local demo exercises the companion and MCP pipeline with fictional files. Demo and NYU catalog and cache identities remain separate.
- Reviewer instructions distinguish hosted extension checks from local companion and real NYU checks.

Evidence:

- Hosted demo is in the final 0.10.0 Chrome ZIP. Resources > Advanced > Demo and testing provides an Open demo LMS link.
- The companion serves fictional LMS metadata and original PDF/PPTX/DOCX fixtures locally. Integration tests verify demo and NYU isolation, including colliding IDs and offline cached reads.

## Deferred / Hosted course-data access

### Prove hosted PDF handoff - DEFERRED

Validate one authenticated PDF transfer into the intended hosted ChatGPT surface and confirm the model can read the actual document.

Acceptance:

- A hosted chat answers from a test PDF without relying on a local filesystem path or a metadata-only link.
- Document delivery, consent, retention and client support are understood before selecting the cloud architecture.

Evidence:

- Deferred by the user: prioritize local installation and avoid operating a hosted course-data service. The static public privacy website hosts no course data.

### Authenticated extension relay - DEFERRED

Design and implement user/device authentication, isolated catalogs and queues, a secure browser connection and bounded document retention using the validated handoff.

Acceptance:

- Two test users cannot access each other's catalog, requests or files.
- Brightspace session credentials remain in each user's browser; device disconnect and deletion work.

Evidence:

- Deferred by the user: prioritize local installation and avoid operating a hosted course-data service. The static public privacy website hosts no course data.

Prerequisites: Prove hosted PDF handoff.

### Hosted plugin pilot + release - DEFERRED

Package the hosted integration for the chosen ChatGPT surface; validate access requirements, cost, review and support with a small pilot.

Acceptance:

- A supported hosted chat can discover and read a user's requested course PDF through the complete authenticated flow.
- Operational limits, costs, retention and publication requirements have been tested and documented.

Evidence:

- Deferred by the user: prioritize local installation and avoid operating a hosted course-data service. The static public privacy website hosts no course data.

Prerequisites: Authenticated extension relay.

## Later / Optional expansion

### Firefox port - DEFERRED

Adapt background execution, browser APIs, absolute request URLs and moz-extension origin pairing; package and test Firefox support.

Acceptance:

- Firefox passes scan, fetch, PDF read, cache repeat, sign-in recovery and popup-closed retrieval checks using its own session.

### More platforms + Brightspace tenants - DEFERRED

Expand installer/desktop support and parameterize tenant hosts and verified API behavior as demand justifies.

Acceptance:

- Each advertised OS and tenant has installation and end-to-end retrieval evidence; unsupported configurations remain explicit.

### Optional full-text search / RAG - DEFERRED

Evaluate document indexing, chunk search or embeddings against pilot needs, using existing on-demand PDF/Office text reading as the baseline. Text extraction itself is implemented; no persistent text index or RAG pipeline exists.

Acceptance:

- A measured evaluation demonstrates improved document discovery or context efficiency without requiring OCR.

### OCR only if justified - DEFERRED

Evaluate an explicit opt-in path for image-only documents if users need searchable text and the cost/quality tradeoff is acceptable.

Acceptance:

- Measured accuracy, latency, storage and compute costs justify the feature; OCR is not required for the core PDF handoff.

### Local ChatGPT plugin package - PLANNED

Package the existing MCP server for supported local ChatGPT plugin installation and guide users through installation and connection.

Acceptance:

- A fresh installation can register the local MCP without manually entering executable paths.
- ChatGPT discovers tools and retrieves a file using the existing paired browser and shared companion.

Evidence:

- Supported local-plugin installation was researched; the package and installer integration are not implemented yet.
- Public ChatGPT local-plugin distribution has separate eligibility/review requirements; local packaging is not public directory approval.
- The local Windows candidate can register the existing MCP server in Codex from its dashboard. The separate ChatGPT plugin package remains planned.

Prerequisites: Windows installer preview.

### Brightspace account switching - DEFERRED

Define how separate Brightspace accounts and browser profiles share a Windows device and its companion.

Acceptance:

- Switching school accounts on the same device cannot expose another account's catalog or cached files.

Evidence:

- The pilot is scoped to one Brightspace account per participant. NYU and demo isolation are already tested.

### Claude Desktop package - PLANNED

Bundle the existing MCP as a Claude Desktop MCPB and reuse the paired Chrome extension, companion and cache.

Acceptance:

- A fresh Claude installation discovers the MCP tools and retrieves a supported file.
- Actual PDF/PowerPoint/Word reading behavior is verified and unsupported host readers are clearly reported.

Evidence:

- The MCPB installation route was researched; no Claude package or live Claude test has been completed.
- This is an optional client expansion, not a prerequisite for the first ChatGPT pilot.

### Auto-dismiss the download banner - DEFERRED

Dismiss the Resources “Download started” banner after a short delay.

Acceptance:

- Download errors and per-file status remain visible.
