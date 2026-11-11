/** Real Chromium UI/PUT smoke against controlled HTTP fixtures, not deployment qualification. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.WEBAPP_BASE_URL ?? 'http://localhost:3105';
const output = path.resolve('.test-results/neo-browser', String(Date.now()));
const source = path.resolve('../firebim-api-server/tests/fixtures/neo/semantic.ifc');
const input = await readFile(source);
const hash = createHash('sha256').update(input).digest('hex');
const failures = [];
const requests = [];
let received;
let signed;
let ready = false;
let empty = false;
let failed = false;
let authenticated = true;
let putCount = 0;
let loginCallback;

const storage = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', new URL(base).origin);
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  try {
    assert.equal(req.method, 'PUT');
    assert.equal(req.headers['content-type'], 'application/octet-stream');
    assert.equal(Number(req.headers['content-length']), input.length);
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = Buffer.concat(chunks);
    assert.deepEqual(received, input);
    putCount++;
    res.writeHead(200).end();
  } catch (error) {
    failures.push(error.message);
    res.writeHead(400).end();
  }
});
storage.listen(0, '127.0.0.1');
await new Promise((resolve) => storage.once('listening', resolve));
signed = `http://127.0.0.1:${storage.address().port}/signed-private-object`;

const revision = {
  profile_id: 'profile',
  profile_name: 'Semantic fixture',
  revision_id: 'revision',
  revision_digest: 'digest',
  published_at: '2026-10-27T00:00:00Z',
};
function job() {
  return {
    id: failed ? 'reprocess' : 'job',
    model_id: 'model',
    status: failed ? 'failed' : ready ? 'succeeded' : 'running',
    stage: failed ? 'validation' : ready ? 'published' : 'mapping',
    profile_id: 'profile',
    revision_id: 'revision',
    revision_digest: 'digest',
    raw_size: input.length,
    source_schema: 'IFC4',
    dispatch_generation: 1,
    attempt_count: 1,
    max_attempts: 3,
    retryable: false,
    cancellation_requested: false,
    result_graph_id: ready && !failed ? 'neo_ready' : null,
    created_at: '2026-10-27T00:00:00Z',
    updated_at: '2026-10-27T00:01:00Z',
  };
}
function model() {
  return {
    id: 'model',
    filename: 'semantic.ifc',
    user_id: 'owner',
    ingestion_backend: 'neo',
    status: job().status,
    size: input.length,
    latest_job_id: job().id,
    latest_successful_graph_id: ready ? 'neo_ready' : null,
    created_at: job().created_at,
  };
}
function response(url, method, body) {
  const route = new URL(url).pathname;
  if (route === '/api/auth/session')
    return authenticated
      ? {
          user: { id: 'owner', name: 'Browser test', email: 'test@example.org' },
          expires: '2099-01-01T00:00:00Z',
        }
      : {};
  if (route === '/api/auth/providers')
    return {
      authentik: {
        id: 'authentik',
        name: 'Authentik',
        type: 'oauth',
        signinUrl: `${base}/api/auth/signin/authentik`,
      },
    };
  if (route === '/api/auth/csrf') return { csrfToken: 'fixture-csrf' };
  if (route === '/api/auth/signin/authentik') {
    assert.equal(method, 'POST');
    const payload = new URLSearchParams(body);
    assert.equal(payload.get('csrfToken'), 'fixture-csrf');
    loginCallback = payload.get('callbackUrl');
    return { url: `${base}/oidc-fixture` };
  }
  if (route.endsWith('/ingestion-revisions'))
    return {
      revisions: [revision],
      count: 1,
      max_input_bytes: 225635,
      runtime_fingerprint: 'fingerprint',
    };
  if (route.endsWith('/uploads') && method === 'POST') {
    const payload = JSON.parse(body);
    assert.equal(payload.sha256, hash);
    assert.equal(payload.size_bytes, input.length);
    assert.equal(payload.profile_id, 'profile');
    assert.equal(payload.revision_id, 'revision');
    return { id: 'upload', model_id: 'model', status: 'uploading', upload_url: signed };
  }
  if (route.endsWith('/uploads/upload/complete')) {
    assert.deepEqual(received, input);
    return job();
  }
  if (route.endsWith('/jobs/job/report') || route.endsWith('/jobs/reprocess/report'))
    return {
      job_id: job().id,
      report_version: 'neo-ingestion/2',
      diagnostics: failed
        ? [{ code: 'semantic_rejection', message: 'Unsupported relationship endpoint' }]
        : [],
      attempts: [],
    };
  if (route.endsWith('/jobs/job') || route.endsWith('/jobs/reprocess')) return job();
  if (route.endsWith('/model/jobs')) return [job()];
  if (route.endsWith('/model')) return model();
  if (route.endsWith('/ifc-models')) return [model()];
  if (route.endsWith('/graphs/neo_ready')) {
    assert(ready);
    return {
      graph_id: 'neo_ready',
      graph_uri: 'urn:neo:ready',
      backend: 'neo',
      immutable: true,
      revision_id: 'revision',
      total_triples: empty ? 0 : 1200,
      total_nodes: empty ? 0 : 900,
      total_edges: empty ? 0 : 1200,
      preview_triples: empty ? 0 : 1,
      truncated: !empty,
      nodes: empty
        ? []
        : [
            {
              id: 'https://one.example/wall',
              kind: 'Resource',
              label: 'Wall one',
              metadata: { iri: 'https://one.example/wall' },
            },
            {
              id: 'https://two.example/wall',
              kind: 'Resource',
              label: 'Wall two',
              metadata: { iri: 'https://two.example/wall' },
            },
          ],
      edges: [],
      ttl: '',
    };
  }
  if (route.endsWith('/graphs'))
    return {
      graphs: ready
        ? [
            {
              graph_id: 'neo_ready',
              graph_uri: 'urn:neo:ready',
              backend: 'neo',
              immutable: true,
              label: 'Semantic fixture',
              triple_count: empty ? 0 : 1200,
            },
          ]
        : [],
    };
  if (route.endsWith('/rules') || route.endsWith('/rules/list')) return { rules: [], count: 0 };
  if (route.endsWith('/health')) return { status: 'ok', storage_connected: true };
  throw Error(`Unexpected browser API request: ${method} ${route}`);
}

await mkdir(output, { recursive: true });
const profile = path.join(output, 'profile');
const chrome = spawn(
  process.env.CHROMIUM_PATH ?? 'chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90_000 },
);
let browserLog = '';
chrome.stderr.on('data', (chunk) => {
  browserLog += chunk;
});
chrome.on('error', (error) => failures.push(error.message));
let socket;
let closeBrowser = async () => {};
try {
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      port = Number(
        (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0],
      );
      break;
    } catch {
      await delay(50);
    }
  }
  assert(port, `Chromium did not start: ${browserLog}`);
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  let id = 0;
  const pending = new Map();
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  }
  closeBrowser = () => cdp('Browser.close');
  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(Error(message.error.message));
      else entry?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown')
      failures.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      failures.push(message.params.args.map((item) => item.value ?? item.description).join(' '));
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      requests.push({ url: new URL(request.url).pathname, method: request.method });
      try {
        if (new URL(request.url).pathname === '/oidc-fixture') {
          await cdp('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
            body: Buffer.from(
              '<!doctype html><title>Fixture sign-in</title><body>Fixture sign-in</body>',
            ).toString('base64'),
          });
          return;
        }
        const payload = response(request.url, request.method, request.postData);
        await cdp('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        });
      } catch (error) {
        failures.push(error.message);
        await cdp('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      }
    }
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Fetch.enable', {
    patterns: [{ urlPattern: `${base}/api/*` }, { urlPattern: `${base}/oidc-fixture` }],
  });
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.equal(failures.length, 0, failures.join('\n'));
      if (await evaluate(`!!document.body && (${expression})`)) return;
      await delay(100);
    }
    throw Error(
      `Timed out: ${expression}\n${await evaluate('document.body?.innerText ?? "No document body"')}`,
    );
  }
  async function screenshot(name, width = 1024) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    if (name.startsWith('rulebook')) {
      assert.equal(
        await evaluate(`(() => {
        const select = document.querySelector('#stored-building-graph');
        const load = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Load graph');
        if (!select || !load) return false;
        const a = select.getBoundingClientRect(), b = load.getBoundingClientRect();
        return a.width > 0 && a.left >= 0 && a.right <= innerWidth && b.left >= 0 && b.right <= innerWidth
          && (a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      })()`),
        true,
        `Graph selection/load controls must be visible without overlap at ${width}px`,
      );
    }
    const image = await cdp('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(path.join(output, `${name}-${width}.png`), Buffer.from(image.data, 'base64'));
  }
  await cdp('Page.navigate', { url: `${base}/ifc-models/upload` });
  await until(`!!document.querySelector('#ingestion-revision option[value="revision"]')`);
  for (const width of [320, 768, 1024, 1440]) await screenshot('upload', width);
  await evaluate(
    `(() => {const select = document.querySelector('#ingestion-revision'); select.value='revision'; select.dispatchEvent(new Event('change', {bubbles:true}));})()`,
  );
  const document = await cdp('DOM.getDocument');
  const field = await cdp('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: '#raw-ifc',
  });
  await cdp('DOM.setFileInputFiles', { nodeId: field.nodeId, files: [source] });
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Upload raw IFC4').click()`,
  );
  await until(
    `location.pathname === '/ifc-models/model' && document.body.innerText.includes('Stage: mapping')`,
  );
  assert.equal(putCount, 1);
  assert.equal(await evaluate(`!!document.querySelector('a[href^="/rulebook?graph_id="]')`), false);
  await screenshot('processing');
  await cdp('Page.reload');
  await until(`document.body.innerText.includes('Stage: mapping')`);
  ready = true;
  await until(`!!document.querySelector('a[href="/rulebook?graph_id=neo_ready"]')`);
  await evaluate(`document.querySelector('a[href="/rulebook?graph_id=neo_ready"]').click()`);
  await until(
    `document.body.innerText.includes('Preview truncated; checks use the complete qualified server dataset.')`,
  );
  assert.equal(
    await evaluate(
      `Array.from(document.querySelectorAll('input[type="checkbox"]')).some(input => input.disabled && input.closest('label')?.textContent.includes('Derived persistence disabled'))`,
    ),
    true,
  );
  for (const width of [320, 768, 1024, 1440]) await screenshot('rulebook-truncated', width);
  empty = true;
  await cdp('Page.reload');
  await until(`document.body.innerText.includes('This ready graph has an empty preview')`);
  await screenshot('rulebook-empty');
  failed = true;
  await cdp('Page.navigate', { url: `${base}/ifc-models/model` });
  await until(
    `document.body.innerText.includes('Processing failed. No partial result was published.')`,
  );
  assert.equal(
    await evaluate(`!!document.querySelector('a[href="/rulebook?graph_id=neo_ready"]')`),
    true,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes('Retry transient failure')`),
    false,
  );
  await screenshot('reprocessing-failed');
  authenticated = false;
  await cdp('Page.navigate', { url: `${base}/rulebook?graph_id=neo_ready` });
  await until(`location.pathname === '/oidc-fixture'`);
  assert.equal(loginCallback, '/rulebook?graph_id=neo_ready');
  assert.equal(failures.length, 0, failures.join('\n'));
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        frontend_fixture_only: true,
        input_bytes: input.length,
        put_count: putCount,
        login_callback: loginCallback,
        requests,
        failures,
      },
      null,
      2,
    ),
  );
  console.log(`Chromium workflow passed: ${input.length} raw bytes; evidence: ${output}`);
} finally {
  await Promise.race([closeBrowser().catch(() => undefined), delay(3000)]);
  socket?.close();
  storage.close();
  await writeFile(path.join(output, 'chromium.log'), browserLog);
}
