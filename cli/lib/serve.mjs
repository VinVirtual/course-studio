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

/**
 * One byte range from a Range header ("bytes=0-99", "bytes=100-", "bytes=-100"), clamped to the file.
 * Null when it cannot be satisfied or is malformed (several ranges are not supported).
 */
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '') || size === 0) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
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
    const send = (status, extra, options) => {
      response.writeHead(status, { ...headers, ...extra });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(file, options);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    };
    if (request.headers.range) {
      const range = parseRange(request.headers.range, size);
      if (!range) {
        response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
        return;
      }
      send(206, { 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': range.end - range.start + 1 }, range);
      return;
    }
    send(200, { 'content-length': size });
  });
  server.on('clientError', (error, socket) => socket.destroy());
  server.on('error', (error) => {
    log(`course: cannot serve on port ${port}: ${error.code === 'EADDRINUSE' ? 'it is in use (try --port)' : error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => log(`serving ${root} on http://127.0.0.1:${server.address().port}/  (Ctrl+C stops)`));
  return server;
}
