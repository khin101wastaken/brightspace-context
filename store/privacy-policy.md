# Brightspace Context privacy policy

Publisher: Khin Aung
Contact: khinaungwrk@gmail.com
Last updated: November 5, 2026

## Purpose and data handled

Brightspace Context helps users organize NYU Brightspace course resources, download selected files and optionally retrieve course PDF, PPTX and DOCX files through a paired local companion and desktop MCP client.

The extension handles semester and course names/IDs; module hierarchy; resource titles, links, descriptions and modification dates; browser preferences; download progress/errors; and a token for its local companion connection. Content-outline descriptions can include assignment-related titles or text supplied in that outline. The product does not request gradebook data, assignment submissions, feedback or dedicated assignment details.

The optional companion stores synced catalog metadata, pairing configuration, document-request state and selected PDF, PPTX and DOCX files in a bounded local cache. Its diagnostic events include local startup paths, identifiers, counts and result/error codes, while excluding document contents and authentication credentials from event fields.

## Where data goes

The extension requests course metadata/files directly from NYU Brightspace using the browser's existing session. Passwords and cookie values are not read or sent to the companion. Login remains between the browser and NYU.

The browser transfers catalog metadata and selected requested files to the paired companion on `127.0.0.1`. The publisher operates no hosted course-content service, advertising service or analytics endpoint for this product, and does not receive those catalogs or files through such a service.

When you connect and use an AI/MCP client, that client can receive catalog metadata and requested documents. Its own processing and retention practices, including any transmission to its AI provider, are governed by the provider and your settings. The extension's local storage architecture does not control the AI client's practices.

While the browser is paired and automatic retrieval is enabled, your connected MCP client can also request semester discovery and catalog refreshes through the extension. These refreshes use the existing browser session, update local course/module metadata and notes, and do not download every course file. You can pause automatic retrieval or disconnect the browser in the extension.

Course data and connection information are used to provide these user-facing features. They are not sold, used for advertising, or used to determine creditworthiness or lending eligibility. Data use and transfer comply with the Chrome Web Store User Data Policy, including its Limited Use requirements.

External resource links open their own websites when you choose to visit them. Those websites have their own privacy practices.

## Storage and removal

Extension data is stored in the Chrome profile. Companion files are stored locally; the current Windows default is `%USERPROFILE%\BrightspaceContext\cache`, or a location explicitly configured by the user. The product does not add application-level encryption to these local files. Access depends on the computer/account's protections.

Document cache entries can be replaced or evicted to enforce freshness and storage limits. Saved catalog and request metadata can remain until replaced or removed. Ordinary downloads remain wherever you saved them.

Disconnecting the browser stops its retrieval connection and forgets its extension-side pairing token; it does not erase course metadata, existing downloads, companion data or separate desktop MCP access. Companion uninstall preserves its data directory. To erase companion data, stop the companion and explicitly remove that directory. Remove the extension or clear its extension storage to remove browser-side saved data, and remove the MCP registration separately as needed.

## Support email and this policy website

If you contact khinaungwrk@gmail.com, your email address, message and any information you choose to include are processed to respond to your request. This correspondence is handled through the email provider and may be retained for support follow-up. You can email the same address to request deletion of support correspondence, subject to applicable retention obligations.

This website serves static privacy/setup information and companion installer downloads. It has no course-data upload, account-registration form, advertising or application analytics code. The hosting provider may process ordinary web-request information, such as IP address and browser information, to deliver and protect the page. Your Brightspace catalog and requested files are not sent to this website.

## Contact and changes

For questions or data-handling concerns, contact khinaungwrk@gmail.com. This policy will be updated if storage, transmission or distribution behavior changes. This product is independent of NYU and D2L.
