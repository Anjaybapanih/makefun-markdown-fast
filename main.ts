// Driver for the markdown-render-speed-02 entry: reads every case from
// /input/cases.json, renders each one alone with parse(), and writes the
// HTML strings, in order, to /output/html.json.
//
// Contract: one parse() call per case, no cross-case state (each case is
// rendered in isolation, exactly as the scorer expects). The driver does
// no Markdown work itself; all parsing lives in parse.js.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Set MAKEFUN_DEBUG=1 to log per-run timing to stderr (off by default so
// the timed grading runs stay quiet).
const DEBUG = process.env.MAKEFUN_DEBUG === '1';

interface Case {
  id: string;
  markdown: string;
}

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as Case[];
if (!Array.isArray(cases)) throw new Error('cases.json must contain an array of cases');
for (const c of cases) {
  if (typeof c?.id !== 'string' || typeof c?.markdown !== 'string') {
    throw new Error('each case needs a string id and markdown');
  }
}
const started = DEBUG ? performance.now() : 0;
const html: string[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i]!.markdown);
}
if (DEBUG) console.error(`[main] ${cases.length} cases in ${(performance.now() - started).toFixed(1)} ms`);
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
// Sanity check: the scorer pairs output entries to cases by index, so a
// short write would silently misalign every case after it. Fail loudly.
const written = JSON.parse(readFileSync(join(OUTPUT_DIR, 'html.json'), 'utf8')) as unknown[];
if (!Array.isArray(written) || written.length !== cases.length) {
  throw new Error(`output length ${Array.isArray(written) ? written.length : 'n/a'} != ${cases.length} cases`);
}
