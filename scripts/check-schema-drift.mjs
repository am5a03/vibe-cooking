// Compare against copied metadata; this command never connects to D1 or edits migrations.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const directory = mkdtempSync(join(tmpdir(), 'kitchen-schema-check-'));
const output = join(directory, 'migrations');
function fingerprints() {
  return readdirSync(output, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return `${path.slice(output.length)}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
    }).sort();
}
try {
  cpSync(resolve('drizzle/migrations'), output, { recursive: true });
  const before = fingerprints();
  const result = spawnSync(process.execPath, [
    resolve('node_modules/drizzle-kit/bin.cjs'), 'generate',
    '--config=drizzle.config.ts', `--out=${output}`, '--name=ci_schema_drift',
  ], { encoding: 'utf8', input: '', timeout: 45000 });
  if (result.status !== 0 || result.error) {
    throw new Error(`Drizzle schema comparison failed.\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  if (JSON.stringify(before) !== JSON.stringify(fingerprints())) {
    throw new Error(`Schema differs from committed Drizzle metadata. Run npm run db:generate, review the SQL and snapshots, and commit them together.\n${result.stdout}`);
  }
  console.log('Drizzle schema matches committed metadata; no new migration generated.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
