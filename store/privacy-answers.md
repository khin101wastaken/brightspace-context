# Privacy practices: v0.9.1

Copy the single purpose and permission explanations from [SUBMISSION.md](SUBMISSION.md). Privacy policy: https://brightspace-context.khin101.chatgpt.site/ .

## Remote code

Select **No, I am not using remote code**. All executable extension JavaScript is packaged in the ZIP. Brightspace and the local companion supply metadata, notifications and requested document bytes, not executable extension code. Locally bundling a parser or validator is not remote code.

## Data usage

Disclose **Website content**: course/semester metadata, module structure and notes, resource titles/URLs and selected file contents. Disclose **Authentication information**: the extension stores and uses a local companion pairing token. It uses the browser's existing NYU session without exporting school passwords or cookie values.

This mapping reflects the implemented data flow; compare the dashboard's current category definitions before certifying. Do not choose “no user data”: local processing and storage count. The extension does not collect general browsing history, unrelated browsing activity, health or financial records, location, personal communications, or personal profiles as separate features. Course files are user-selected website content and may themselves contain personal information; do not claim that all course content is anonymous.

Catalog metadata and requested PDF/PPTX/DOCX bytes can move from the extension to the paired loopback companion and then the user's chosen MCP/AI client. AI-provider processing is controlled by that client and its settings. The publisher receives no course data through an application backend. Support correspondence sent voluntarily to the published email address and ordinary static-host request handling are explained in the public policy.

## Certifications

Review and certify the dashboard statements truthfully: user data is not sold; transfers are limited to providing the stated functionality; data is not used for creditworthiness or lending decisions. Do not interpret “no sale” as “no transfer”: requested context can go to the user's selected AI client/provider. No advertising or application analytics code is included.

If a dashboard field does not match this description, resolve it before clicking Submit for Review rather than selecting an inaccurate checkbox.

## Official references

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
