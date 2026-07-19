#!/usr/bin/env node
// Prints the next free batch number, scanning HEAD and origin/main.
// Usage: node scripts/next-batch.mjs [--fetch]
// Pass --fetch (or run `git fetch` yourself first) so origin/main is current —
// two sessions once collided on the same number (2026-07-17, Batch 183).
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (process.argv.includes('--fetch')) run('git fetch --quiet');

let max = 0;
for (const ref of ['HEAD', 'origin/main']) {
  let subjects = '';
  try {
    subjects = run(`git log ${ref} --pretty=%s -1000`);
  } catch {
    continue; // ref may not exist (fresh clone edge cases)
  }
  for (const m of subjects.matchAll(/^Batch (\d+)/gm)) {
    max = Math.max(max, Number(m[1]));
  }
}

if (max === 0) {
  console.error('No "Batch N" commits found on HEAD or origin/main.');
  process.exit(1);
}
console.log(max + 1);
