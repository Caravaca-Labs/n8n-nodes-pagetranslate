# Native n8n Verification

The node was exercised in the real n8n 2.47.7 engine on 2026-11-14. Public,
sanitized evidence:

- [End-to-end report](e2e-20261114.json): binary PDF upload, pending quote,
  refusal of an unconfirmed start, confirmed start, completion and PDF download.
- [Published-package scan](scanner-published-20261114.json): provenance and
  security checks for npm version 0.1.1.
- [Source scan](scanner-source-20261114.json).
- [Review recording receipt](n8n-review-video-20261114.json): the genuine,
  uncut 299-second screen recording was submitted to n8n, which reported
  manual review UNDER REVIEW. This is not approval or n8n Cloud availability.

The review recording itself is uploaded directly to the Creator Portal, not
hosted in a separate tracking repository. Other platform evidence is public in
the [MCP integration guide](https://github.com/Caravaca-Labs/pagetranslate-mcp/blob/main/integrations/README.md).

## Repeat The E2E

Prerequisites: Node.js 22+, Docker, this repository checked out, and a verified
disposable PageTranslate account funded with existing words. The public fixture
contains 100 words. The account needs at least one existing translation for the
recent-jobs check. Do not use an account with private customer documents.

Failure cases covered: invalid authentication, malformed or missing binary
input, upload accidentally starting translation, an uncovered cash quote,
unconfirmed spending, terminal failures or polling timeout, invalid download
origin, and a response that is not actually a PDF. The runner tests the listed
workflow behavior; this list does not claim every possible error was simulated.

1. Run `npm ci` and `npm run build` in this checkout.
2. Create the ignored `private/` directory and an owner-only (0600)
   `private/e2e-account.json` containing `{"api_key":"YOUR_DEDICATED_TEST_KEY"}`.
   Provide the real key privately, never through a public issue or commit.
3. Start a dedicated local engine using the commands below. Use an unused local
   port if 5679 is occupied; do not replace another running container or its data.
4. Run the script once, inspect its report and translated PDF, then stop this
   test container. A successful run spends the fixture's words; no card is charged.

```bash
mkdir -p private/n8n-data
docker run -d --name pagetranslate-n8n-e2e --user root \
  -p 127.0.0.1:5679:5678 \
  -e N8N_CUSTOM_EXTENSIONS=/opt/custom \
  -e NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules \
  -e N8N_DIAGNOSTICS_ENABLED=false \
  -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -v "$PWD/private/n8n-data:/home/node/.n8n" \
  -v "$PWD/dist:/opt/custom:ro" \
  -v "$PWD/private:/fixtures" \
  n8nio/n8n:2.47.7
node scripts/verify-e2e.mjs
docker stop pagetranslate-n8n-e2e
```

The [runner](../scripts/verify-e2e.mjs) uses n8n's actual CLI and writes a dated
`report.json` and translated PDF with SHA-256 digest under ignored
`test-artifacts/`. Credentials, workflow inputs and raw CLI logs remain in
ignored `private/`, with secret-bearing files restricted to the owner. Do not
publish raw logs, credential JSON or the n8n database.

Restart the isolated container after rebuilding the node, because the build
replaces the bind-mounted `dist` directory. This documentation-only migration
does not change the submitted npm version or rerun a paid translation.
