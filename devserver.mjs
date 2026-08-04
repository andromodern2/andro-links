/* Local stand-in for Vercel: serves the static files and routes /api/* to the
   same handler files Vercel will run. Used only for testing. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const verify = (await import('./api/verify.js')).default;
const photo  = (await import('./api/photo.js')).default;
const save   = (await import('./api/save.js')).default;

const MIME = { '.html':'text/html', '.json':'application/json', '.jpg':'image/jpeg', '.js':'text/javascript' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const c of req) raw += c;
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch (_) { body = {}; } }
    const shim = {
      code: 200, _headers: {},
      setHeader(k, v){ this._headers[k] = v; },
      status(c){ this.code = c; return this; },
      json(o){ res.writeHead(this.code, { ...this._headers, 'Content-Type': 'application/json' });
               res.end(JSON.stringify(o)); return this; }
    };
    const h = url.pathname === '/api/verify' ? verify : url.pathname === '/api/save' ? save : null;
    if (!h) { res.writeHead(404); return res.end('no route'); }
    try { await h({ method: req.method, body }, shim); }
    catch (e) { res.writeHead(500); res.end(JSON.stringify({ crashed: String(e && e.message) })); }
    return;
  }

  if (url.pathname === '/photo.jpg' || url.pathname === '/api/photo') {
    const shim = {
      code: 200, _h: {},
      setHeader(k, v){ this._h[k] = v; },
      status(c){ this.code = c; return this; },
      send(b){ res.writeHead(this.code, this._h); res.end(b); return this; },
      end(){ res.writeHead(this.code, this._h); res.end(); return this; }
    };
    photo({ method: req.method, headers: req.headers }, shim);
    return;
  }

  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const buf = await readFile('.' + path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(buf);
  } catch (_) { res.writeHead(404); res.end('not found'); }
});

server.listen(3210, () => console.log('dev server on 3210'));
