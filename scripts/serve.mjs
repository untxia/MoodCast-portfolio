// Serveur local : fichiers de dist/ + fonction Netlify « coach » branchée en direct.
// MOCK_AI=1 démarre un faux serveur Anthropic (tests E2E et démo sans clé).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

if (process.env.MOCK_AI === '1') {
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (process.env.MOCK_AI_FAIL === '1') { res.statusCode = 500; res.end('{"error":"boom"}'); return; }
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'Conseil de test : respire, tu fais de ton mieux 🌿' }] }));
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_URL = `http://127.0.0.1:${fake.address().port}/v1/messages`;
  process.env.ANTHROPIC_API_KEY ||= 'test-key';
}

const { handler } = await import('../netlify/functions/coach.js');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === '/.netlify/functions/coach') {
    let body = '';
    for await (const c of req) body += c;
    const out = await handler({ httpMethod: req.method, body });
    res.writeHead(out.statusCode, out.headers);
    res.end(out.body);
    return;
  }

  let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => console.log(`MoodCast sur http://localhost:${port}/`));
