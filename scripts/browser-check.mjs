// Each cohort gets a disposable local D1 and real sessions; never reset the user's kitchen.
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Authentication workflows deliberately consume the real per-client login budget.
// Keep new feature workflows isolated instead of weakening limits or faking cookies.
const specs = readdirSync(resolve('tests/browser')).filter((name) => name.endsWith('.spec.ts')).sort();
const cohorts = [
  { name: 'existing-kitchen', files: specs.filter((name) => name !== 'zz-flavors.spec.ts') },
  { name: 'flavour-library', files: specs.filter((name) => name === 'zz-flavors.spec.ts') },
];
let status = 0;
for (const cohort of cohorts) {
  if (!cohort.files.length) throw new Error(`Missing browser specifications for ${cohort.name}.`);
  const directory = mkdtempSync(join(tmpdir(), 'vibe-kitchen-test-'));
  const configPath = join(directory, 'wrangler.json');
  const statePath = join(directory, 'state');
  const token = randomBytes(32).toString('hex');
  if (process.env.CI) console.log(`::add-mask::${token}`);
  console.log(`Browser cohort: ${cohort.name} (${cohort.files.length} specification files)`);
  writeFileSync(configPath, JSON.stringify({
    name: 'vibe-cooking-test', main: resolve('.open-next/worker.js'),
    compatibility_date: '2026-09-17', compatibility_flags: ['nodejs_compat'],
    assets: { binding: 'ASSETS', directory: resolve('.open-next/assets') },
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'vibe-cooking-test' }],
    vars: { API_TOKEN: token, KITCHEN_ORIGIN: 'http://127.0.0.1:8787' },
    d1_databases: [{ binding: 'DB', database_name: 'kitchen-e2e', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: resolve('drizzle/migrations'), remote: false }],
  }));
  const env = {
    ...process.env,
    KITCHEN_TEST_TOKEN: token, KITCHEN_TEST_CONFIG: configPath, KITCHEN_TEST_STATE: statePath,
    WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_ACCOUNT_ID: '',
  };
  try {
    const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', configPath, '--persist-to', statePath], { stdio: 'inherit', env });
    if (migrate.status !== 0) throw new Error('Isolated test migration failed.');
    // Separate output folders preserve failure artifacts from both invocations.
    const result = spawnSync('npx', ['playwright', 'test', ...cohort.files, '--output', `test-results/${cohort.name}`], { stdio: 'inherit', env });
    if (result.status !== 0) status = result.status ?? 1;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
process.exitCode = status;
