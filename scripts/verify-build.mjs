import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = resolve(root, '.next');
async function traces(directory) {
  const found = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === 'cache' || item.name === 'dev' || item.name === 'static') continue;
    const path = resolve(directory, item.name);
    if (item.isDirectory()) found.push(...await traces(path));
    else if (item.name.endsWith('.nft.json')) found.push(path);
  }
  return found;
}
const manifests = await traces(build);
if (!manifests.length) throw new Error('No deployment traces found. Run a production build first.');
const privateFiles = [];
for (const manifest of manifests) {
  const data = JSON.parse(await readFile(manifest, 'utf8'));
  for (const entry of data.files || []) {
    const path = relative(root, resolve(dirname(manifest), entry));
    const parts = path.split(sep);
    if (['.data', 'output'].includes(parts[0].toLowerCase()) || (parts.length === 1 && parts[0].startsWith('.env'))) privateFiles.push(path);
  }
}
if (privateFiles.length) throw new Error(`Deployment traces include private development files: ${[...new Set(privateFiles)].join(', ')}`);
console.log(`Verified ${manifests.length} deployment traces: no local accounts, uploads, or environment files.`);
