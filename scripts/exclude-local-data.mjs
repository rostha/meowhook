import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Next's trace exclusion globs can miss Windows paths. Remove only files that
// the production runtime explicitly never uses, then run the independent gate.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let removed = 0;
async function clean(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['cache', 'dev', 'static'].includes(item.name)) continue;
    const path = resolve(directory, item.name);
    if (item.isDirectory()) { await clean(path); continue; }
    if (!item.name.endsWith('.nft.json')) continue;
    const trace = JSON.parse(await readFile(path, 'utf8'));
    const files = trace.files.filter(entry => {
      const parts = relative(root, resolve(dirname(path), entry)).split(sep);
      return !['.data', 'output'].includes(parts[0].toLowerCase()) && !(parts.length === 1 && parts[0].startsWith('.env'));
    });
    removed += trace.files.length - files.length;
    if (files.length !== trace.files.length) await writeFile(path, JSON.stringify({ ...trace, files }));
  }
}
await clean(resolve(root, '.next'));
if (removed) console.log(`Excluded ${removed} development-only file references from deployment traces.`);
