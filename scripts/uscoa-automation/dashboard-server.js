'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');

const PROJECT_ROOT = __dirname;
const UI_DIR = path.join(PROJECT_ROOT, 'ui');
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.output');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(PROJECT_ROOT, '.env.example');
const MAIN_SCRIPT = path.join(PROJECT_ROOT, 'uscoa-login.js');
const HOST = process.env.USCOA_UI_HOST || '127.0.0.1';
const PORT = Number(process.env.USCOA_UI_PORT || 3030);
const MAX_LOG_LINES = 3000;
const MAX_BODY_SIZE = 1024 * 1024;
const KNOWN_ENV_KEYS = [
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

const runState = {
  id: 0,
  status: 'idle',
  action: '',
  args: [],
  startedAt: null,
  endedAt: null,
  exitCode: null,
  logs: [],
};

let activeChild = null;
let nextRunId = 1;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      const config = await loadConfig();
      return sendJson(res, 200, config);
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
      const payload = await readJsonBody(req);
      await saveConfig(payload || {});
      const config = await loadConfig();
      return sendJson(res, 200, { ok: true, config });
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      const payload = await readJsonBody(req);
      if (activeChild) {
        return sendJson(res, 409, { ok: false, message: '当前已有任务在运行，请等待完成后再启动。' });
      }

      const action = String(payload?.action || '').trim();
      const value = String(payload?.value || '').trim();
      const headful = Boolean(payload?.headful);
      const args = buildActionArgs(action, value, headful);
      await startRun(action, args);
      return sendJson(res, 200, { ok: true, runId: runState.id, action: runState.action, args: runState.args });
    }

    if (req.method === 'GET' && url.pathname === '/api/run/current') {
      return sendJson(res, 200, summarizeRunState());
    }

    if (req.method === 'GET' && url.pathname === '/api/artifacts') {
      const files = await listArtifacts();
      return sendJson(res, 200, { files });
    }

    if (req.method === 'GET' && url.pathname === '/api/file') {
      const relPath = String(url.searchParams.get('path') || '');
      return serveOutputFile(res, relPath);
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    if (error && error.statusCode) {
      return sendJson(res, error.statusCode, { ok: false, message: error.message });
    }

    console.error('[ui-server:error]', error);
    return sendJson(res, 500, { ok: false, message: '服务器内部错误。' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ui] Dashboard: http://${HOST}:${PORT}`);
  console.log('[ui] Press Ctrl+C to stop');
});

async function startRun(action, args) {
  runState.id = nextRunId++;
  runState.status = 'running';
  runState.action = action;
  runState.args = args.slice();
  runState.startedAt = new Date().toISOString();
  runState.endedAt = null;
  runState.exitCode = null;
  runState.logs = [];
  pushLog(`[ui] Started run #${runState.id}`);
  pushLog(`[cmd] node uscoa-login.js ${args.join(' ')}`.trim());

  activeChild = spawn(process.execPath, [MAIN_SCRIPT, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  wireChildStream(activeChild.stdout, 'stdout');
  wireChildStream(activeChild.stderr, 'stderr');

  activeChild.on('error', (error) => {
    pushLog(`[ui:error] ${error.message}`);
  });

  activeChild.on('close', (code) => {
    runState.exitCode = code;
    runState.endedAt = new Date().toISOString();
    runState.status = code === 0 ? 'success' : 'failed';
    pushLog(`[ui] Finished with exit code ${code}`);
    activeChild = null;
  });
}

function wireChildStream(stream, label) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      pushLog(`[${label}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      pushLog(`[${label}] ${buffer}`);
      buffer = '';
    }
  });
}

function summarizeRunState() {
  return {
    id: runState.id,
    status: runState.status,
    action: runState.action,
    args: runState.args,
    startedAt: runState.startedAt,
    endedAt: runState.endedAt,
    exitCode: runState.exitCode,
    logs: runState.logs,
    running: Boolean(activeChild),
  };
}

function pushLog(line) {
  const stamp = new Date().toISOString();
  runState.logs.push(`${stamp} ${line}`);
  if (runState.logs.length > MAX_LOG_LINES) {
    runState.logs.splice(0, runState.logs.length - MAX_LOG_LINES);
  }
}

function buildActionArgs(action, value, headful) {
  const args = [];

  switch (action) {
    case 'probe':
      args.push('--probe');
      break;
    case 'login':
      break;
    case 'fresh-login':
      args.push('--fresh-login');
      break;
    case 'menu':
      assertRequiredValue(value, '菜单文字不能为空。');
      args.push('--menu', value);
      break;
    case 'target-url':
      assertRequiredValue(value, '目标 URL 不能为空。');
      args.push('--target-url', value);
      break;
    case 'dump-menu':
      assertRequiredValue(value, '导出菜单名称不能为空。');
      args.push('--dump-menu', value);
      break;
    case 'extract-guide':
      assertRequiredValue(value, '须知关键字不能为空。');
      args.push('--extract-guide-json', value);
      break;
    case 'inspect-form':
      assertRequiredValue(value, '表单关键字不能为空。');
      args.push('--inspect-form', value);
      break;
    case 'autofill':
      assertRequiredValue(value, 'autofill JSON 路径不能为空。');
      args.push('--autofill-json', value);
      break;
    default:
      throw badRequest('未知动作类型。');
  }

  if (headful && !args.includes('--headful')) {
    args.push('--headful');
  }

  return args;
}

async function loadConfig() {
  const template = await readEnvFileFallback();
  const map = parseEnvMap(template);
  return KNOWN_ENV_KEYS.reduce((acc, key) => {
    acc[key] = map.get(key) || '';
    return acc;
  }, {});
}

async function saveConfig(payload) {
  const clean = {};
  for (const key of KNOWN_ENV_KEYS) {
    clean[key] = String(payload[key] ?? '').replace(/\r?\n/g, ' ').trim();
  }

  const output = KNOWN_ENV_KEYS.map((key) => `${key}=${clean[key]}`).join('\n') + '\n';
  await fsp.writeFile(ENV_PATH, output, 'utf8');
}

async function readEnvFileFallback() {
  try {
    return await fsp.readFile(ENV_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fsp.readFile(ENV_EXAMPLE_PATH, 'utf8');
    }
    throw error;
  }
}

function parseEnvMap(content) {
  const map = new Map();
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    map.set(key, value);
  }
  return map;
}

async function listArtifacts() {
  const items = [];
  await walkArtifacts(OUTPUT_DIR, items);
  items.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return items;
}

async function walkArtifacts(dir, bucket) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkArtifacts(absPath, bucket);
      continue;
    }

    const stat = await fsp.stat(absPath);
    const relativePath = toProjectRelative(absPath);
    bucket.push({
      path: relativePath,
      name: path.basename(absPath),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ext: path.extname(absPath).toLowerCase(),
    });
  }
}

async function serveOutputFile(res, relativePath) {
  if (!relativePath) {
    throw badRequest('缺少 path 参数。');
  }

  const safePath = resolveArtifactPath(relativePath);
  const stat = await fsp.stat(safePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw notFound('文件不存在。');
  }

  const ext = path.extname(safePath).toLowerCase();
  const mime = getMimeType(ext);
  const stream = fs.createReadStream(safePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  stream.pipe(res);
}

function resolveArtifactPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absPath = path.resolve(PROJECT_ROOT, normalized);
  if (!absPath.startsWith(path.resolve(OUTPUT_DIR))) {
    throw badRequest('只允许访问 .output 目录下的文件。');
  }
  return absPath;
}

function getMimeType(ext) {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function serveStatic(req, res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const absPath = path.resolve(UI_DIR, `.${requestPath}`);
  if (!absPath.startsWith(path.resolve(UI_DIR))) {
    throw badRequest('非法路径。');
  }

  const stat = await fsp.stat(absPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw notFound('页面不存在。');
  }

  const ext = path.extname(absPath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.html') contentType = 'text/html; charset=utf-8';
  if (ext === '.css') contentType = 'text/css; charset=utf-8';
  if (ext === '.js') contentType = 'application/javascript; charset=utf-8';

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(absPath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_SIZE) {
      throw badRequest('请求体过大。');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw badRequest('请求体不是有效的 JSON。');
  }
}

function toProjectRelative(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

function assertRequiredValue(value, message) {
  if (!value) {
    throw badRequest(message);
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}
