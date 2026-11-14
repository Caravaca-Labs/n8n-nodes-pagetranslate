import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const privateDir = resolve(root, 'private');
const account = JSON.parse(await readFile(resolve(privateDir, 'e2e-account.json'), 'utf8'));
const container = process.env.N8N_E2E_CONTAINER || 'pagetranslate-n8n-e2e';
const artifacts = resolve(root, 'test-artifacts', new Date().toISOString().replaceAll(':', '-'));
await mkdir(artifacts, { recursive: true });
const report = { engine: 'real n8n CLI', started_at: new Date().toISOString(), checks: [] };
let execution = 0;
async function cli(args) {
  const r = spawnSync('docker', ['exec', '-e', 'N8N_RUNNERS_BROKER_PORT=5681', container, 'n8n', ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 180000 });
  const log = (r.stdout || '') + (r.stderr || '');
  await writeFile(resolve(privateDir, `n8n-cli-${++execution}.log`), log, { mode: 0o600 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`n8n ${args[0]} failed; inspect private/n8n-cli-${execution}.log`);
  return r.stdout;
}
const credential = 'pagetranslate-e2e';
await writeFile(resolve(privateDir, 'credentials.json'), JSON.stringify([{ id: credential, name: 'PageTranslate E2E', type: 'pageTranslateApi', data: { apiKey: account.api_key } }]), { mode: 0o600 });
await cli(['import:credentials', '--input=/fixtures/credentials.json']);
async function execute(parameters, upload = false) {
  const trigger = { id: randomUUID(), name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };
  const source = { id: randomUUID(), name: 'Public PDF Fixture', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [200, 0], parameters: { url: 'https://raw.githubusercontent.com/Caravaca-Labs/pagetranslate-mcp/main/test/fixtures/sample.pdf', options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } };
  const node = { id: randomUUID(), name: 'PageTranslate', type: 'CUSTOM.pageTranslate', typeVersion: 1, position: [400, 0], parameters: { resource: 'document', ...parameters }, credentials: { pageTranslateApi: { id: credential, name: 'PageTranslate E2E' } } };
  const link = (name) => ({ main: [[{ node: name, type: 'main', index: 0 }]] });
  const workflow = { id: randomUUID(), name: 'PageTranslate integration E2E', active: false, settings: { executionOrder: 'v1' }, nodes: upload ? [trigger, source, node] : [trigger, node], connections: { 'Manual Trigger': link(upload ? 'Public PDF Fixture' : 'PageTranslate'), ...(upload ? { 'Public PDF Fixture': link('PageTranslate') } : {}) } };
  await writeFile(resolve(privateDir, 'workflow.json'), JSON.stringify(workflow), { mode: 0o600 });
  await cli(['import:workflow', '--input=/fixtures/workflow.json']);
  const text = await cli(['execute', `--id=${workflow.id}`, '--rawOutput']);
  let result;
  for (const match of text.matchAll(/(?:^|\n)(?=\{)/g)) {
    try { result = JSON.parse(text.slice(match.index + (match[0] === '\n' ? 1 : 0))); break; } catch { /* Startup log lines precede raw JSON. */ }
  }
  if (!result) throw new Error(`No JSON output; inspect private/n8n-cli-${execution}.log`);
  const data = result.data?.resultData ?? result.resultData;
  if (data?.error) throw new Error(data.error.message || 'Workflow execution failed');
  const output = data?.runData?.PageTranslate?.at(-1)?.data?.main?.[0];
  if (!output) throw new Error('PageTranslate did not execute in n8n');
  return output.map((item) => item.json);
}
try {
  const jobs = await execute({ operation: 'getMany', returnAll: false, limit: 2 });
  assert.ok(jobs.length > 0 && jobs.length <= 2);
  report.checks.push('Get Many executes in n8n and honors limit');
  const [uploaded] = await execute({ operation: 'upload', binaryPropertyName: 'data', targetLanguage: 'es' }, true);
  assert.match(uploaded.job_id, /^[a-f0-9]{24}$/i);
  assert.equal(uploaded.status, 'pending');
  assert.ok(uploaded.word_count > 0);
  assert.equal(uploaded.cost_cents, 0);
  report.job = { job_id: uploaded.job_id, word_count: uploaded.word_count, target_language: uploaded.requested_language };
  report.checks.push('Binary upload returns a quote and remains pending');
  assert.ok(await execute({ operation: 'start', jobId: uploaded.job_id, confirmStart: false }).then(() => false, () => true));
  assert.equal((await execute({ operation: 'get', jobId: uploaded.job_id }))[0].status, 'pending');
  report.checks.push('Unconfirmed start is rejected and job stays pending');
  await execute({ operation: 'start', jobId: uploaded.job_id, confirmStart: true });
  let completed;
  for (let attempt = 0; attempt < 10; attempt++) {
    const [job] = await execute({ operation: 'get', jobId: uploaded.job_id });
    if (job.status === 'completed') { completed = job; break; }
    if (['failed', 'cancelled', 'aborted'].includes(job.status)) throw new Error(`Translation ended ${job.status}`);
    await new Promise((r) => setTimeout(r, 30000));
  }
  assert.ok(completed, 'Translation must complete within bounded polling');
  const [link] = await execute({ operation: 'getDownloadLink', jobId: uploaded.job_id });
  assert.equal(link.expires_in, 3600);
  assert.equal(new URL(link.download_url).origin, 'https://api.pagetranslate.ai');
  const response = await fetch(link.download_url);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  await writeFile(resolve(artifacts, 'translated.pdf'), bytes);
  report.checks.push('Confirmed start, completed status and downloadable PDF succeed');
  report.output = { filename: 'translated.pdf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, artifact_directory: artifacts }, null, 2));
}
