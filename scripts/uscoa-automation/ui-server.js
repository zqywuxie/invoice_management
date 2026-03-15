'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');

const ROOT = __dirname;
const UI_DIR = path.join(ROOT, 'ui');
const OUTPUT_DIR = path.join(ROOT, '.output');
const GUIDES_DIR = path.join(OUTPUT_DIR, 'guides');
const FORMS_DIR = path.join(OUTPUT_DIR, 'forms');
const ATTACHMENTS_DIR = path.join(OUTPUT_DIR, 'attachments');
const AUTOFILL_DIR = path.join(OUTPUT_DIR, 'autofill');
const AUTOFILL_UPLOADS_DIR = path.join(AUTOFILL_DIR, 'uploads');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');
const SCRIPT_PATH = path.join(ROOT, 'uscoa-login.js');
const BROWSER_STATE_PATH = path.join(OUTPUT_DIR, 'browser-state.json');
const LIVE_PREVIEW_PATH = path.join(OUTPUT_DIR, 'live-page.jpg');
const HOST = process.env.USCOA_UI_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.USCOA_UI_PORT || '4321', 10);

const ENV_KEYS = [
  'USCOA_USERNAME',
  'USCOA_PASSWORD',
  'USCOA_URL',
  'USCOA_TARGET_URL',
  'USCOA_MENU_TEXT',
  'USCOA_HEADFUL',
  'USCOA_REUSE_SESSION',
  'USCOA_REMEMBER_ME',
  'USCOA_TIMEOUT_MS',
  'USCOA_BROWSER_PATH',
];

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const MAX_LOG_LINES = 1500;
const MAX_RUNS = 20;
const PREVIEW_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const PREVIEW_TEXT_EXTS = new Set(['.json', '.txt', '.html', '.log', '.md']);

const runs = [];
let currentRunId = null;
let activeChild = null;
let logSequence = 0;

main().catch((error) => {
  console.error('[fatal]', error);
  process.exitCode = 1;
});

async function main() {
  await ensureDirectories();

  const server = http.createServer((req, res) => {
    routeRequest(req, res).catch((error) => {
      sendJson(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[ui] USCOA console is running at http://${HOST}:${PORT}`);
  });
}

async function routeRequest(req, res) {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/api/config') {
    const config = await readConfig();
    return sendJson(res, 200, { config });
  }

  if (method === 'POST' && pathname === '/api/config') {
    const body = await readJsonBody(req);
    const input = body && typeof body.config === 'object' ? body.config : {};
    const saved = await writeConfig(input);
    return sendJson(res, 200, { ok: true, config: saved });
  }

  if (method === 'POST' && pathname === '/api/run') {
    const body = await readJsonBody(req);
    const args = sanitizeArgs(body && body.args);

    if (!args.length && body && body.requireArgs) {
      return sendJson(res, 400, { error: 'No command arguments were provided.' });
    }

    if (getCurrentRun()) {
      return sendJson(res, 409, { error: 'A run is already in progress.' });
    }

    const run = startRun(args);
    return sendJson(res, 202, { run: toPublicRun(run) });
  }

  if (method === 'POST' && pathname === '/api/autofill') {
    if (getCurrentRun()) {
      return sendJson(res, 409, { error: 'A run is already in progress.' });
    }

    const payload = await parseAutofillRequest(req);
    const saved = await saveAutofillPayload(payload);
    const run = startRun(['--autofill-json', saved.relativePath]);

    return sendJson(res, 202, {
      run: toPublicRun(run),
      payloadPath: saved.relativePath,
    });
  }

  if (method === 'POST' && pathname === '/api/run/stop') {
    const run = getCurrentRun();
    if (!run) {
      return sendJson(res, 409, { error: 'No run is in progress.' });
    }

    await stopRun(run);
    return sendJson(res, 202, { ok: true, run: toPublicRun(run) });
  }

  if (method === 'GET' && pathname === '/api/status') {
    const config = await readConfig();
    const artifacts = await collectArtifacts();

    return sendJson(res, 200, {
      currentRun: toPublicRun(getCurrentRun(), false),
      lastRun: toPublicRun(getLastRun(), false),
      runs: runs.map((item) => toPublicRun(item, false)),
      artifacts,
      summary: buildSummary(config, artifacts),
      now: new Date().toISOString(),
    });
  }

  if (method === 'GET' && pathname.startsWith('/api/run/')) {
    const runId = decodeURIComponent(pathname.slice('/api/run/'.length));
    const run = runs.find((item) => item.id === runId);
    if (!run) {
      return sendJson(res, 404, { error: `Run not found: ${runId}` });
    }
    return sendJson(res, 200, { run: toPublicRun(run) });
  }

  if (method === 'GET' && pathname === '/api/artifacts') {
    return sendJson(res, 200, { artifacts: await collectArtifacts() });
  }

  if (method === 'GET' && pathname.startsWith('/output/')) {
    const relativePath = pathname.slice('/output/'.length);
    const absolutePath = resolveWithin(OUTPUT_DIR, relativePath);
    return serveFile(res, absolutePath);
  }

  if (method === 'GET') {
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const absolutePath = resolveWithin(UI_DIR, relativePath);
    return serveFile(res, absolutePath);
  }

  return sendJson(res, 404, { error: `Not found: ${pathname}` });
}

async function ensureDirectories() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.mkdir(GUIDES_DIR, { recursive: true });
  await fsp.mkdir(FORMS_DIR, { recursive: true });
  await fsp.mkdir(ATTACHMENTS_DIR, { recursive: true });
  await fsp.mkdir(AUTOFILL_DIR, { recursive: true });
  await fsp.mkdir(AUTOFILL_UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(UI_DIR, { recursive: true });
}

async function readConfig() {
  const defaults = parseDotEnv(await readFileOrEmpty(ENV_EXAMPLE_PATH));
  const current = parseDotEnv(await readFileOrEmpty(ENV_PATH));
  const merged = { ...defaults, ...current };

  for (const key of ENV_KEYS) {
    if (merged[key] === undefined) {
      merged[key] = '';
    }
  }

  return merged;
}

async function writeConfig(input) {
  const current = parseDotEnv(await readFileOrEmpty(ENV_PATH));
  const next = { ...current };

  for (const key of ENV_KEYS) {
    if (input[key] !== undefined) {
      next[key] = String(input[key]);
    }
  }

  const lines = [];
  for (const key of ENV_KEYS) {
    const value = next[key] === undefined ? '' : normalizeEnvValue(next[key]);
    lines.push(`${key}=${value}`);
  }

  await fsp.writeFile(ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
  return readConfig();
}

function normalizeEnvValue(value) {
  return String(value || '').replace(/\r?\n/g, ' ').trim();
}

function parseDotEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function sanitizeArgs(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item)
    .slice(0, 30);
}

function startRun(args) {
  const run = {
    id: buildRunId(),
    args,
    command: formatCommand(args),
    status: 'running',
    stopRequested: false,
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    signal: null,
    pid: null,
    logs: [],
    _stdoutBuffer: '',
    _stderrBuffer: '',
  };

  runs.unshift(run);
  if (runs.length > MAX_RUNS) {
    runs.splice(MAX_RUNS);
  }

  currentRunId = run.id;

  const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
  });

  activeChild = child;
  run.pid = child.pid || null;
  appendLog(run, 'system', `Run started with command: ${run.command}`);

  child.stdout.on('data', (chunk) => appendChunk(run, 'stdout', chunk));
  child.stderr.on('data', (chunk) => appendChunk(run, 'stderr', chunk));

  child.on('error', (error) => {
    appendLog(run, 'system', `Process error: ${error.message}`);
    finalizeRun(run, 1, null);
  });

  child.on('close', (code, signal) => {
    flushStreamBuffer(run, 'stdout');
    flushStreamBuffer(run, 'stderr');
    finalizeRun(run, code === null ? (run.stopRequested ? 130 : 1) : code, signal || null);
  });

  return run;
}

async function stopRun(run) {
  if (!run || !activeChild || run.id !== currentRunId) {
    return false;
  }

  if (run.stopRequested) {
    return true;
  }

  run.stopRequested = true;
  run.status = 'stopping';
  appendLog(run, 'system', 'Stop requested from the UI.');

  const pid = activeChild.pid;
  if (!pid) {
    return false;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => {
        try {
          activeChild.kill();
        } catch {
          // Ignore kill fallback errors.
        }
        resolve();
      });
      killer.on('close', () => resolve());
    });
    return true;
  }

  try {
    activeChild.kill('SIGTERM');
  } catch {
    return false;
  }

  return true;
}

function finalizeRun(run, exitCode, signal) {
  if (run.status !== 'running' && run.status !== 'stopping') {
    return;
  }

  run.exitCode = exitCode;
  run.signal = signal;
  run.endedAt = new Date().toISOString();

  if (run.stopRequested) {
    run.status = 'stopped';
  } else {
    run.status = exitCode === 0 ? 'succeeded' : 'failed';
  }

  const signalText = signal ? `, signal=${signal}` : '';
  appendLog(run, 'system', `Run finished with exit code ${exitCode}${signalText}`);

  if (currentRunId === run.id) {
    currentRunId = null;
  }

  if (activeChild && activeChild.pid === run.pid) {
    activeChild = null;
  }
}

function appendChunk(run, stream, chunk) {
  const key = stream === 'stdout' ? '_stdoutBuffer' : '_stderrBuffer';
  run[key] += String(chunk || '');

  while (true) {
    const lineBreak = run[key].indexOf('\n');
    if (lineBreak < 0) {
      break;
    }

    const line = run[key].slice(0, lineBreak).replace(/\r$/, '');
    run[key] = run[key].slice(lineBreak + 1);
    if (line.trim()) {
      appendLog(run, stream, line);
    }
  }
}

function flushStreamBuffer(run, stream) {
  const key = stream === 'stdout' ? '_stdoutBuffer' : '_stderrBuffer';
  const line = run[key].replace(/\r/g, '').trim();
  run[key] = '';

  if (line) {
    appendLog(run, stream, line);
  }
}

function appendLog(run, stream, text) {
  run.logs.push({
    seq: ++logSequence,
    at: new Date().toISOString(),
    stream,
    text,
  });

  if (run.logs.length > MAX_LOG_LINES) {
    run.logs.shift();
  }
}

function getCurrentRun() {
  if (!currentRunId) {
    return null;
  }
  return runs.find((item) => item.id === currentRunId) || null;
}

function getLastRun() {
  if (!runs.length) {
    return null;
  }

  const running = getCurrentRun();
  if (running && runs[0] && runs[0].id === running.id && runs.length > 1) {
    return runs[1];
  }

  return runs[0];
}

function toPublicRun(run, includeLogs = true) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    args: run.args,
    command: run.command,
    status: run.status,
    stopRequested: run.stopRequested,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode,
    signal: run.signal,
    pid: run.pid,
    durationMs: getDurationMs(run),
    logTail: run.logs.slice(-60),
    logs: includeLogs ? run.logs : [],
  };
}

function getDurationMs(run) {
  const startedAt = Date.parse(run.startedAt || '');
  if (!Number.isFinite(startedAt)) {
    return null;
  }

  const endedAt = Date.parse(run.endedAt || '') || Date.now();
  return Math.max(0, endedAt - startedAt);
}

async function collectArtifacts() {
  const screenshotStat = await statOrNull(path.join(OUTPUT_DIR, 'last-page.png'));
  const livePreviewStat = await statOrNull(LIVE_PREVIEW_PATH);
  const htmlStat = await statOrNull(path.join(OUTPUT_DIR, 'last-page.html'));
  const storageStateStat = await statOrNull(path.join(OUTPUT_DIR, 'storage-state.json'));
  const meta = await readJsonOrNull(path.join(OUTPUT_DIR, 'last-page.json'));
  const browserState = await readJsonOrNull(BROWSER_STATE_PATH);

  const recentOutput = await listFiles(OUTPUT_DIR, '/output');
  const guides = await listFiles(GUIDES_DIR, '/output/guides');
  const forms = await listFiles(FORMS_DIR, '/output/forms');
  const attachments = await listFiles(ATTACHMENTS_DIR, '/output/attachments');
  const researchSealGuide = await readJsonOrNull(path.join(GUIDES_DIR, 'usc_yzgl_kyyy_guide.json'));

  return {
    screenshotUrl: screenshotStat ? `/output/last-page.png?ts=${screenshotStat.mtimeMs}` : '',
    livePreviewUrl: livePreviewStat ? `/output/live-page.jpg?ts=${livePreviewStat.mtimeMs}` : '',
    htmlUrl: htmlStat ? `/output/last-page.html?ts=${htmlStat.mtimeMs}` : '',
    storageStateUrl: storageStateStat ? `/output/storage-state.json?ts=${storageStateStat.mtimeMs}` : '',
    screenshotModifiedAt: screenshotStat ? screenshotStat.mtime.toISOString() : null,
    livePreviewModifiedAt: livePreviewStat ? livePreviewStat.mtime.toISOString() : null,
    meta,
    browserState,
    recentOutput,
    guides,
    forms,
    attachments,
    researchSealGuide,
  };
}

function buildSummary(config, artifacts) {
  const allFiles = [
    ...(artifacts.recentOutput || []),
    ...(artifacts.guides || []),
    ...(artifacts.forms || []),
    ...(artifacts.attachments || []),
  ];

  const latestArtifact = allFiles
    .map((item) => item.modifiedAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || null;

  return {
    configReady: Boolean(config.USCOA_USERNAME && config.USCOA_PASSWORD && config.USCOA_URL),
    hasCredentials: Boolean(config.USCOA_USERNAME && config.USCOA_PASSWORD),
    hasBrowserPath: Boolean(config.USCOA_BROWSER_PATH),
    hasTargetPreset: Boolean(config.USCOA_TARGET_URL || config.USCOA_MENU_TEXT),
    hasSession: Boolean(artifacts.storageStateUrl),
    hasScreenshot: Boolean(artifacts.screenshotUrl),
    hasLivePreview: Boolean(artifacts.livePreviewUrl),
    hasBrowserState: Boolean(artifacts.browserState && artifacts.browserState.updatedAt),
    browserUpdatedAt: artifacts.browserState && artifacts.browserState.updatedAt
      ? artifacts.browserState.updatedAt
      : null,
    latestArtifact,
    counts: {
      recentOutput: (artifacts.recentOutput || []).length,
      guides: (artifacts.guides || []).length,
      forms: (artifacts.forms || []).length,
      attachments: (artifacts.attachments || []).length,
      total: allFiles.length,
    },
  };
}

async function listFiles(dir, webBase) {
  const stat = await statOrNull(dir);
  if (!stat || !stat.isDirectory()) {
    return [];
  }

  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const itemStat = await statOrNull(fullPath);
    if (!itemStat) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    files.push({
      name: entry.name,
      size: itemStat.size,
      ext,
      kind: getPreviewKind(ext),
      modifiedAt: itemStat.mtime.toISOString(),
      url: `${webBase}/${encodeURIComponent(entry.name)}?ts=${itemStat.mtimeMs}`,
    });
  }

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return files;
}

function getPreviewKind(ext) {
  if (PREVIEW_IMAGE_EXTS.has(ext)) {
    return 'image';
  }

  if (PREVIEW_TEXT_EXTS.has(ext)) {
    return 'text';
  }

  return 'download';
}

async function statOrNull(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

async function readJsonOrNull(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readFileOrEmpty(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function serveFile(res, filePath) {
  const stat = await statOrNull(filePath);
  if (!stat || !stat.isFile()) {
    return sendJson(res, 404, { error: `File not found: ${filePath}` });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });

  fs.createReadStream(filePath).pipe(res);
}

function resolveWithin(baseDir, requestedPath) {
  let decoded = '';
  try {
    decoded = decodeURIComponent(requestedPath);
  } catch {
    throw new Error('Invalid path encoding.');
  }

  const normalized = path.normalize(decoded).replace(/^([\\/])+/, '');
  const resolved = path.resolve(baseDir, normalized);

  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error('Path is outside the allowed directory.');
  }

  return resolved;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error('Payload too large.');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

async function readFormDataBody(req) {
  const request = new Request(`http://${req.headers.host || `${HOST}:${PORT}`}${req.url || '/'}`, {
    method: req.method || 'POST',
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: 'half',
  });

  try {
    return await request.formData();
  } catch {
    throw createHttpError(400, 'Invalid form-data payload.');
  }
}

async function parseAutofillRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    const formData = await readFormDataBody(req);
    const payload = {
      guide_key: String(formData.get('guide_key') || '').trim(),
      subject: String(formData.get('subject') || '').trim(),
      contract_amount: String(formData.get('contract_amount') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      remark: String(formData.get('remark') || '').trim(),
      action: String(formData.get('action') || '').trim(),
      seal_types: formData.getAll('seal_types').map((item) => String(item || '').trim()).filter(Boolean),
      attachments: await storeAutofillFiles(formData.getAll('attachments')),
    };

    return normalizeAutofillPayload(payload);
  }

  const body = await readJsonBody(req);
  return normalizeAutofillPayload(body && body.payload);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function buildRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `run_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAutofillPayload(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const normalizeText = (value) => String(value || '').trim();

  const sealTypes = Array.isArray(payload.seal_types)
    ? payload.seal_types.map((item) => normalizeText(item)).filter(Boolean)
    : normalizeText(payload.seal_types)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .map((item) => {
          if (typeof item === 'string') {
            const trimmed = normalizeText(item);
            return trimmed ? { path: trimmed } : null;
          }

          if (!item || typeof item !== 'object') {
            return null;
          }

          const attachment = {
            name: normalizeText(item.name),
            path: normalizeText(item.path),
          };

          if (!attachment.path) {
            return null;
          }

          if (!attachment.name) {
            delete attachment.name;
          }

          return attachment;
        })
        .filter(Boolean)
    : [];

  const normalized = {
    guide_key: normalizeText(payload.guide_key) || 'research-seal',
    subject: normalizeText(payload.subject),
    seal_types: sealTypes,
    contract_amount: normalizeText(payload.contract_amount),
    description: normalizeText(payload.description),
    phone: normalizeText(payload.phone),
    remark: normalizeText(payload.remark),
    action: normalizeText(payload.action) || 'save_draft',
    attachments,
  };

  if (!normalized.subject) {
    throw createHttpError(400, 'Missing required field: subject');
  }

  if (!normalized.seal_types.length) {
    throw createHttpError(400, 'Missing required field: seal_types');
  }

  if (!normalized.description) {
    throw createHttpError(400, 'Missing required field: description');
  }

  if (!normalized.phone) {
    throw createHttpError(400, 'Missing required field: phone');
  }

  if (!['fill_only', 'save_draft'].includes(normalized.action)) {
    throw createHttpError(400, `Unsupported autofill action: ${normalized.action}`);
  }

  return normalized;
}

async function storeAutofillFiles(files) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const uploads = normalizedFiles.filter((item) => item && typeof item === 'object' && typeof item.arrayBuffer === 'function');

  if (!uploads.length) {
    return [];
  }

  const uploadDir = path.join(AUTOFILL_UPLOADS_DIR, buildRunId().replace(/^run_/, 'files_'));
  await fsp.mkdir(uploadDir, { recursive: true });

  const saved = [];
  for (const file of uploads) {
    const originalName = String(file.name || '').trim();
    if (!originalName) {
      continue;
    }

    const safeName = makeSafeFilename(originalName);
    const targetPath = await ensureUniqueFilePath(path.join(uploadDir, safeName));
    const buffer = Buffer.from(await file.arrayBuffer());
    await fsp.writeFile(targetPath, buffer);

    saved.push({
      name: originalName,
      path: targetPath,
      size: buffer.length,
      type: String(file.type || '').trim(),
    });
  }

  return saved;
}

function makeSafeFilename(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return cleaned || `attachment_${Date.now()}`;
}

async function ensureUniqueFilePath(filePath) {
  let candidate = filePath;
  let index = 1;

  while (true) {
    try {
      await fsp.access(candidate);
      const ext = path.extname(filePath);
      const stem = filePath.slice(0, filePath.length - ext.length);
      candidate = `${stem}_${index}${ext}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function saveAutofillPayload(payload) {
  const fileName = `${buildRunId().replace(/^run_/, 'autofill_')}.json`;
  const filePath = path.join(AUTOFILL_DIR, fileName);
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    filePath,
    relativePath: path.relative(ROOT, filePath),
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatCommand(args) {
  const command = [path.basename(process.execPath), path.basename(SCRIPT_PATH), ...args]
    .map((item) => quoteArg(item))
    .join(' ');

  return command;
}

function quoteArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}





