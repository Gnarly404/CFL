// Build-time HTML includes. Pages stay plain static HTML (no flash, no script needed to see the header or
// footer); the shared markup lives once in /partials and is pasted in by the build and dev server.
//
//   <!-- @include site-nav -->      is replaced with partials/site-nav.html
//
// The same expansion is used by the Vite plugin, the route check and the tests.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MARKER = /^[ \t]*<!--\s*@include\s+([a-z0-9-]+)\s*-->[ \t]*\r?\n?/gm;

export function expandIncludes(html, dir) {
  return html.replace(MARKER, (_, name) => {
    const file = resolve(dir, `${name}.html`);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      throw new Error(`Missing HTML partial "${name}" (looked for ${file})`);
    }
    return `${text.replace(/\r\n/g, '\n').replace(/\n*$/, '')}\n`;
  });
}

export function includePartials(dir) {
  return {
    name: 'cfl-html-partials',
    transformIndexHtml: { order: 'pre', handler: (html) => expandIncludes(html, dir) },
    configureServer(server) {
      server.watcher.add(dir);
      server.watcher.on('change', (file) => {
        if (resolve(file).startsWith(resolve(dir))) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
