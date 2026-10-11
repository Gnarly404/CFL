import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { includePartials } from './scripts/html-partials.mjs';
import { cleanUrls } from './scripts/clean-urls.mjs';

const projectRoot = import.meta.dirname;
const srcRoot = resolve(projectRoot, 'src');

/** Every .html file under src/ becomes a build entry, so a page cannot silently drop out of the build. */
function htmlEntries(dir) {
  const entries = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.html')) {
        const key = relative(srcRoot, full).split(sep).join('/').replace(/\.html$/, '');
        entries[key] = full;
      }
    }
  };
  walk(dir);
  return entries;
}

export default defineConfig({
  root: srcRoot,
  plugins: [includePartials(resolve(projectRoot, 'partials')), cleanUrls({ srcRoot, distRoot: resolve(projectRoot, 'dist') })],
  publicDir: resolve(projectRoot, 'public'),
  envDir: projectRoot,
  resolve: { alias: { '@': resolve(srcRoot, 'js') } },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: htmlEntries(srcRoot) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
