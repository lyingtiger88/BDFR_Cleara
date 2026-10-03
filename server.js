import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectors } from './src/connectors/catalog.js';
import { validateGitHubToken, listGists, deleteGist } from './src/connectors/github.js';
import { filterItems } from './src/core/filter-engine.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4177);
const MAX_BODY = 1024 * 1024;

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, app: 'Cleara', version: '0.1.0' });
  if (req.method === 'GET' && url.pathname === '/api/connectors') return json(res, 200, { connectors });

  if (req.method === 'POST' && url.pathname === '/api/github/validate') {
    const { token } = await body(req);
    if (!token) return json(res, 400, { error: 'Token is required.' });
    return json(res, 200, await validateGitHubToken(token));
  }

  if (req.method === 'POST' && url.pathname === '/api/github/scan') {
    const { token, filter = {} } = await body(req);
    if (!token) return json(res, 400, { error: 'Token is required.' });
    const items = await listGists(token);
    return json(res, 200, { total: items.length, matched: filterItems(items, filter) });
  }

  if (req.method === 'POST' && url.pathname === '/api/github/delete') {
    const { token, ids, confirmation } = await body(req);
    if (!token || !Array.isArray(ids)) return json(res, 400, { error: 'Token and ids are required.' });
    if (confirmation !== 'DELETE') return json(res, 400, { error: 'Explicit DELETE confirmation is required.' });
    const results = [];
    for (const id of ids) {
      try { results.push(await deleteGist(token, id)); }
      catch (error) { results.push({ id, deleted: false, error: error.message }); }
    }
    return json(res, 200, { results });
  }
  return false;
}

async function staticFile(req, res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  pathname = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const file = join(PUBLIC, pathname);
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await api(req, res, url);
        if (handled === false) json(res, 404, { error: 'API route not found' });
        return;
      }
      await staticFile(req, res, url);
    } catch (error) {
      json(res, error.status || 500, { error: error.message || 'Unexpected error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, '127.0.0.1', () => console.log(`Cleara v0.1 running at http://127.0.0.1:${PORT}`));
}
