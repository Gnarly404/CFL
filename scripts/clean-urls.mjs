import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const isFile = (path) => existsSync(path) && statSync(path).isFile();

/**
 * Maps a clean URL path to the HTML file that serves it, the way the live site does (firebase.json cleanUrls):
 * `/gallery` -> `/gallery.html`, `/programmes` -> `/programmes/index.html`. Returns null when the path is not a page.
 */
export function resolveCleanUrl(pathname, root) {
  if (!pathname.startsWith('/') || pathname.includes('..') || pathname.includes('\\')) return null;
  const clean = pathname.replace(/\/+$/, '');
  if (!clean || /\.[A-Za-z0-9]+$/.test(clean)) return null;
  if (isFile(join(root, `${clean}.html`))) return `${clean}.html`;
  if (isFile(join(root, clean, 'index.html'))) return `${clean}/index.html`;
  return null;
}

/** Vite plugin: without it, the dev and preview servers answer `/programmes` with the home page. */
export function cleanUrls({ srcRoot, distRoot }) {
  const make = (root) => (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const [path, query = ''] = (req.url ?? '').split('?');
      const target = resolveCleanUrl(path, root);
      if (target) req.url = query ? `${target}?${query}` : target;
    }
    next();
  };
  return {
    name: 'cfl-clean-urls',
    configureServer(server) { server.middlewares.use(make(srcRoot)); },
    configurePreviewServer(server) { server.middlewares.use(make(distRoot)); },
  };
}
