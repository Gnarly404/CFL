// Route integrity gate. Run after `npm run build`.
//  - every internal link, script, stylesheet and image in the built pages resolves to a real file;
//  - hosting redirects point at pages that exist;
//  - source file and folder names are lowercase with no spaces;
//  - every page parses without HTML errors;
//  - every page under /student, /admin and /instructor ships hidden until the sign-in guard runs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parse } from 'parse5';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const problems = [];
const warnings = [];

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full, found);
    } else found.push(full);
  }
  return found;
}
const rel = (file, base = root) => relative(base, file).split(sep).join('/');

// 0. markup must parse cleanly (stray quotes and unclosed attributes silently break pages)
for (const file of walk(join(root, 'src')).filter((f) => f.endsWith('.html'))) {
  const source = readFileSync(file, 'utf8');
  parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => problems.push(`markup: ${rel(file)}:${error.startLine}:${error.startCol} ${error.code}`),
  });
}

// 1. naming rules
for (const base of ['src', 'public']) {
  for (const file of walk(join(root, base))) {
    const bad = rel(file).split('/').find((part) => /[A-Z\s]/.test(part));
    if (bad) problems.push(`naming: "${rel(file)}" (segment "${bad}") must be lowercase with no spaces`);
  }
}

// 2. hosting redirects
const hosting = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting ?? {};
const redirectSources = new Set((hosting.redirects ?? []).map((r) => r.source));

function resolves(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  return [clean, `${clean}.html`, join(clean, 'index.html')].some((candidate) => {
    const full = join(dist, candidate);
    return existsSync(full) && statSync(full).isFile();
  });
}

for (const { source, destination } of hosting.redirects ?? []) {
  if (destination.startsWith('/') && !resolves(destination)) problems.push(`redirect: ${source} -> ${destination} does not exist`);
}

// 3. built pages
const pages = walk(dist).filter((file) => file.endsWith('.html'));
let checked = 0;
let placeholders = 0;
for (const page of pages) {
  const name = rel(page, dist);
  const html = readFileSync(page, 'utf8');

  for (const match of html.matchAll(/\s(?:href|src|action)=["']([^"']*)["']/g)) {
    const ref = match[1];
    if (ref === '#') { placeholders += 1; continue; }
    if (!ref || ref.startsWith('#') || /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(ref)) continue;
    checked += 1;
    if (!ref.startsWith('/')) { problems.push(`${name}: relative reference "${ref}" (use absolute paths)`); continue; }
    if (redirectSources.has(ref.split(/[?#]/)[0])) { warnings.push(`${name}: links to legacy path ${ref}`); continue; }
    if (!resolves(ref)) problems.push(`${name}: broken reference ${ref}`);
    else if (ref.split(/[?#]/)[0].endsWith('.html')) warnings.push(`${name}: link ${ref} should omit .html`);
  }

  if (!/<html[^>]*\blang=/.test(html)) warnings.push(`${name}: <html> has no lang attribute`);
  if (!/<title>[^<]+<\/title>/.test(html)) warnings.push(`${name}: missing <title>`);
  if (/^(student|admin|instructor)\//.test(name) && !/<html[^>]*data-auth="pending"/.test(html)) {
    problems.push(`${name}: protected page must start with <html data-auth="pending">`);
  }
}
if (placeholders) warnings.push(`${placeholders} placeholder links (href="#") across pages: replaced when each page is redesigned`);

console.log(`Checked ${pages.length} pages and ${checked} references.`);
for (const warning of warnings) console.log(`  warning: ${warning}`);
for (const problem of problems) console.error(`  PROBLEM: ${problem}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log('Route check passed.');
