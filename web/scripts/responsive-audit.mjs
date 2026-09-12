#!/usr/bin/env node
/**
 * Responsive / page-cutting audit.
 *
 * Scans the interface source for the patterns that actually cause horizontal
 * overflow and cut-off content on real devices, and prints what it finds with a
 * file and line. It is deliberately narrow: it reports *risky* markup, not every
 * use of a width, so the output stays actionable.
 *
 *   node scripts/responsive-audit.mjs          # report
 *   node scripts/responsive-audit.mjs --fail   # exit 1 when a blocking finding exists
 *
 * Rules
 *  • `w-[<large>px]` / `min-w-[<large>px>]` on a layout element — a fixed width
 *    wider than a small phone, which pushes the page sideways.
 *  • `overflow-x-scroll`/`overflow-x-auto` on something that is not a table
 *    wrapper (tables are meant to scroll inside their card).
 *  • `<table` without a `table-scroll` ancestor in the same file.
 *  • Grids with `grid-cols-<n>` for n ≥ 3 and no responsive prefix.
 *  • `h-screen`/`min-h-screen` (mobile viewport is smaller than 100vh because of
 *    the browser chrome — `dvh` is the correct unit).
 *  • A modal/dialog without a `max-h-` and an internal `overflow-y-auto`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');
const failOnFinding = process.argv.includes('--fail');

const findings = [];
const add = (level, file, line, message, snippet) => findings.push({ level, file: relative(root, file), line, message, snippet: snippet.trim().slice(0, 120) });

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) check(full);
  }
}

// `w-[...]` / `min-w-[...]`, but not `max-w-[...]` (a maximum is a guard, not a risk).
const LARGE_FIXED = /(?<![-a-z:])(?:w|min-w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;
const BREAKPOINTS = ['sm:', 'md:', 'lg:', 'xl:', '2xl:'];
const GRID_UNPREFIXED = /(?<![:a-z-])grid-cols-([3-9]|1[0-2])\b/g;

function check(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((raw, index) => {
    const line = index + 1;

    for (const match of raw.matchAll(LARGE_FIXED)) {
      const size = Number(match[1]);
      const unit = match[2];
      const px = unit === 'rem' ? size * 16 : size;
      if (px <= 320) continue;
      // A width scoped to a breakpoint cannot squeeze a phone.
      if (BREAKPOINTS.some((bp) => raw.includes(`${bp}${match[0]}`))) continue;
      add('warn', file, line, `fixed ${size}${unit} width at every viewport`, raw);
    }

    for (const match of raw.matchAll(GRID_UNPREFIXED)) {
      if (/sm:grid-cols|md:grid-cols|lg:grid-cols|xl:grid-cols|2xl:grid-cols/.test(raw)) continue;
      add('warn', file, line, `grid-cols-${match[1]} without a responsive prefix`, raw);
    }

    if (/h-screen|min-h-screen/.test(raw)) {
      add('warn', file, line, 'uses the 100vh unit instead of dvh', raw);
    }

    if (/<table\b/.test(raw) && !/table-scroll/.test(text)) {
      add('block', file, line, 'table rendered without a .table-scroll container', raw);
    }

    if (/overflow-x-(scroll|auto)/.test(raw) && !/table-scroll|tabs-scroll|no-scrollbar/.test(raw)) {
      add('warn', file, line, 'horizontal scroll container outside a table/tab wrapper', raw);
    }

    if (/role="dialog"/.test(raw) && !/max-h-|overflow-y-auto/.test(raw) && !/overflow-y-auto/.test(text)) {
      add('block', file, line, 'dialog without a height limit and internal scroll', raw);
    }
  });
}

walk(srcDir);

const blocking = findings.filter((finding) => finding.level === 'block');
const warnings = findings.filter((finding) => finding.level === 'warn');

console.log('MAMA CARE — responsive audit\n');
if (findings.length === 0) {
  console.log('No overflow risks found in src/.');
} else {
  for (const finding of [...blocking, ...warnings]) {
    console.log(`${finding.level === 'block' ? '✖' : '•'} ${finding.file}:${finding.line} — ${finding.message}`);
    console.log(`    ${finding.snippet}`);
  }
}
console.log(`\n${blocking.length} blocking, ${warnings.length} to review.`);
if (failOnFinding && blocking.length > 0) process.exit(1);
