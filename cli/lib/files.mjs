// Files a course points at (figures, linked handouts). Only regular files inside the course folder are
// allowed, so a lesson can never publish something from elsewhere on the machine or write outside dist.
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Checks a course-relative path. Returns { file, rel } for a file inside the course folder, or
 * { error } saying why it is refused.
 */
export function courseFile(dir, path) {
  const raw = String(path ?? '').split('#')[0].split('?')[0];
  if (!raw.trim()) return { error: 'empty path' };
  if (raw.includes('\0')) return { error: 'invalid path' };
  if (isAbsolute(raw) || /^[a-z]:[\\/]/i.test(raw) || raw.startsWith('\\') || raw.startsWith('~')) return { error: `absolute path not allowed: ${raw}` };
  const root = resolve(dir);
  const file = resolve(root, raw);
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return { error: `path leaves the course folder: ${raw}` };
  if (rel.split(sep).some((part) => part.startsWith('.'))) return { error: `hidden files and folders are not published: ${raw}` };
  if (!existsSync(file)) return { error: `file not found: ${raw}` };
  if (!statSync(file).isFile()) return { error: `not a file: ${raw}` };
  return { file, rel: rel.split(sep).join('/') };
}
