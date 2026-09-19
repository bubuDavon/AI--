import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import officialApp from './netlify/functions/official-app.mjs';
import {
  AbortError,
  ApiError,
  OpenhexClient,
  extractText,
} from '@openhex-ai/agent-sdk';

const root = fileURLToPath(new URL('.', import.meta.url));
const staticRoot = join(root, 'dist');

function loadLocalEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadLocalEnv();

const port = Number(process.env.PORT || 8787);
const agentId = process.env.OPENHEX_LEARNING_AGENT_ID;
const apiKey = process.env.OPENHEX_LEARNING_API_KEY;
const configured = Boolean(
  apiKey && agentId && !apiKey.includes('请替换') && !agentId.includes('请替换'),
);

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 24_000) throw Object.assign(new Error('请求内容过长'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeRecord(res, record) {
  res.write(`${JSON.stringify(record)}\n`);
}

function publicError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'OpenHex 凭据无效或已过期，请检查服务端配置。';
    if (error.status === 402) return 'OpenHex 账户积分不足，请先补充积分。';
    if (error.status === 429) return '请求过于频繁，请稍后再试。';
    if (error.status >= 500) return 'OpenHex 服务暂时不可用，请稍后再试。';
    return `OpenHex 请求失败（${error.status}）。`;
  }
  if (error instanceof AbortError) return 'Agent 等待超时，请重试或缩短问题。';
  if (error?.name === 'AbortError') return '本次生成已停止。';
  return '实时助教暂时无法连接，请稍后再试。';
}

async function chat(req, res) {
  if (!configured) {
    json(res, 503, { error: '服务端尚未配置学习 Agent 的 API Key 和 Agent ID。' });
    return;
  }

  let input;
  try {
    input = await readJson(req);
  } catch (error) {
    json(res, error.status || 400, { error: error.message === '请求内容过长' ? error.message : '请求格式不正确。' });
    return;
  }

  const message = String(input.message || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  if (!message || message.length > 2000) {
    json(res, 400, { error: '问题不能为空，且不能超过 2000 个字符。' });
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-content-type-options': 'nosniff',
  });

  const client = new OpenhexClient({ apiKey, agentId, timeoutMs: 30_000 });
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const sent = await client.chat.send(
      conversationId
        ? { message, conversationId }
        : { message, targetAgentIds: [agentId], newConversation: true },
      { signal: controller.signal },
    );
    writeRecord(res, { type: 'meta', conversationId: sent.conversationId });

    for await (const record of client.chat.resumeTurn(sent.conversationId, {
      lastEventId: sent.userEventId,
      signal: controller.signal,
      idleTimeoutMs: 240_000,
    })) {
      if (record.sender === 'assistant' || record.sender === 'agent') {
        const text = extractText(record);
        if (text) writeRecord(res, { type: 'delta', text });
      }
    }
    writeRecord(res, { type: 'done', conversationId: sent.conversationId });
  } catch (error) {
    if (!res.writableEnded) writeRecord(res, { type: 'error', error: publicError(error) });
    console.error('[openhex]', error);
  } finally {
    res.end();
  }
}

async function serveStatic(url, res) {
  const requestedPath = url.pathname === '/learning' ? '/learning/' : url.pathname;
  const pathname = decodeURIComponent(
    requestedPath === '/' ? '/index.html' : requestedPath.endsWith('/') ? `${requestedPath}index.html` : requestedPath,
  );
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = join(staticRoot, relative);
  if (!filePath.startsWith(staticRoot)) {
    json(res, 403, { error: '禁止访问。' });
    return;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error('not file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mime[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    json(res, 404, { error: '页面不存在。' });
  }
}

async function handleOfficial(req, res, url) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  const response = await officialApp(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/openhex/status' && req.method === 'GET') {
    json(res, 200, { configured });
    return;
  }
  if (url.pathname === '/api/openhex/chat' && req.method === 'POST') {
    await chat(req, res);
    return;
  }
  if (url.pathname === '/api/official') {
    await handleOfficial(req, res, url);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: '不支持的请求方法。' });
    return;
  }
  await serveStatic(url, res);
});

server.listen(port, () => {
  console.log(`智多星已启动：http://localhost:${port}`);
  console.log(configured ? 'OpenHex Agent 已配置。' : 'OpenHex 尚未配置：复制 .env.example 为 .env 并填写凭据。');
});
