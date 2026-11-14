# n8n-nodes-pagetranslate

Translate PDF, scanned PDF, DOCX, EPUB and images with [PageTranslate](https://pagetranslate.ai), preserving document layout. OCR handles scanned pages. PDF comes back as PDF, DOCX as DOCX and EPUB as EPUB.

This is a community integration, not an n8n-verified node until n8n completes verification. Unverified packages require self-hosted n8n.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

In self-hosted n8n, open Settings > Community Nodes and install `n8n-nodes-pagetranslate`. See the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/).

## Operations

| Document operation | Result |
| --- | --- |
| Upload | Sends a binary file and target language, then returns its word count, quote and status. Does not start translation. |
| Get | Returns one job's status and progress. |
| Get Many | Lists recent jobs, newest first, with an optional limit. |
| Start | Requires Confirm Spending Words; spends existing account word balance, never a card. |
| Get Download Link | Returns a one-hour link for a completed document with filename and expiry in seconds. |

## Credentials

Create a [PageTranslate account](https://pagetranslate.ai/signup), verify your email, and create your own key under [Dashboard > API Keys](https://pagetranslate.ai/dashboard/api-keys). Add a PageTranslate API credential in n8n and enter the key.

n8n encrypts credentials at rest. The key is sent only to the fixed `https://api.pagetranslate.ai` origin. The node has no runtime package dependencies, no telemetry, and does not read local files or environment variables.

## Compatibility

Uses n8n's community node API v1 and HTTP request helpers, with native multipart FormData. Upload requires binary workflow input; the node is not exposed as an agent tool.

Verified end to end in n8n 2.47.7 on 2026-11-14: real binary upload, quote, rejected unconfirmed start, confirmed start, completed status and byte-verified PDF download. The sanitized report is in `verification/e2e-20261114.json`.

## Usage

1. Obtain a binary file with an upload form, HTTP Request or storage node.
2. Choose Document > Upload. Set Input Binary Field and a target language code (`es`, `fr`, `de`, `pt-BR`, etc.).
3. Review `word_count` and `cost_cents`. If `cost_cents` is not zero, the existing word balance does not cover the job: do not start it.
4. Obtain user confirmation, then use Start with `job_id` and enable Confirm Spending Words. Starting consumes words and cannot be undone.
5. Use a Wait node (about 30 seconds) and Get to follow progress. Stop on completed, failed or cancelled. Bound the number of polls.
6. When `status` is `completed`, use Get Download Link. An HTTP Request node can fetch `download_url` as a file. The link expires after one hour.

A start may be refused if another job has spent the balance since upload. The error is reported without creating a checkout or retrying a charge. Never export real keys or signed download URLs in public workflows.

Supported formats: PDF (including scans), DOCX, EPUB, PNG, JPG/JPEG, WEBP, TIFF/TIF, BMP and GIF. Maximum 100 MB and 1,000 PDF pages. Use the original filename extension. Spreadsheets, slides, subtitles and pasted-text translation are not supported. Translation is AI-generated, not certified human translation.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [PageTranslate API documentation](https://pagetranslate.ai/api)
* [Support](https://pagetranslate.ai/contact)
* [Privacy](https://pagetranslate.ai/privacy)
* [Terms](https://pagetranslate.ai/terms)

## Version history

0.1.0: initial integration. See CHANGELOG.md.

## Development

Run `npm ci`, `npm run build`, `npm run lint` and `npm run dev`. Publishing is configured for GitHub Actions with npm provenance. Do not publish credentials or test artifacts.
