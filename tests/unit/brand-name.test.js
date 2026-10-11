import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const files = ['src', 'partials', 'functions/src'].flatMap((d) => walk(join(root, d))).filter((f) => /\.(html|js|json)$/.test(f));

describe('brand name', () => {
  it('is always "Centre of Foreign Learning"', () => {
    const wrong = /cent(?:re|er) (?:of|for) foreign (?!learning\b)\w+|center (?:of|for) foreign learning|centre for foreign learning/i;
    const bad = files.filter((f) => wrong.test(readFileSync(f, 'utf8'))).map((f) => f.replace(`${root}/`, ''));
    expect(bad).toEqual([]);
  });
});
