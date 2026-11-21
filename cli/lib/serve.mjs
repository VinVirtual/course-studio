// A small static server for trying a built course on this machine. Local use only.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Maps a request path to a file inside `root`, or null. Refuses dot-files and anything outside the folder. */
export function fileFor(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (path.split('/').some((part) => part.startsWith('.'))) return null;
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function serve(folder, { port = 4180, log = () => {} } = {}) {
  const root = resolve(folder);
  const server = createServer((request, response) => {
    if (!LOCAL_HOSTS.test(request.headers.host ?? '')) {
      response.writeHead(403).end('local use only');
      return;
    }
    const url = request.url ?? '/';
    const clean = url.split('?')[0];
    if (!clean.endsWith('/') && !extname(clean) && fileFor(root, `${clean}/`)) {
      response.writeHead(301, { location: `${url}/` }).end();
      return;
    }
    const file = fileFor(root, url);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    const size = statSync(file).size;
    const headers = { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'accept-ranges': 'bytes' };
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      response.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { ...headers, 'content-length': size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  });
  server.listen(port, '127.0.0.1', () => log(`serving ${root} on http://127.0.0.1:${server.address().port}/  (Ctrl+C stops)`));
  return server;
}
