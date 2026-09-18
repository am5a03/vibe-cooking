import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const id = config.d1_databases?.find(d => d.binding === 'DB')?.database_id;
if (!id || id === '00000000-0000-0000-0000-000000000000' || !/^[0-9a-f-]{36}$/i.test(id)) {
  console.error('Create D1 with `npx wrangler d1 create vibe-cooking-db`, then set database_id in wrangler.jsonc.');
  process.exit(1);
}
