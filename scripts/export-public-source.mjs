import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sourceRoot, verifyPublicSource } from './verify-public-source.mjs';

const files = await verifyPublicSource();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const parent = resolve(sourceRoot, 'output', 'open-source');
const destination = resolve(parent, `meowhook-source-${stamp}`);
await mkdir(parent, { recursive: true });
await mkdir(destination); // Never replace an existing export.
for (const file of files) {
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(sourceRoot, file), target, constants.COPYFILE_EXCL);
}
await writeFile(`${destination}.manifest.json`, JSON.stringify({ exportedAt: new Date().toISOString(), license: 'Apache-2.0', files }, null, 2) + '\n', { flag: 'wx' });
console.log(`Exported ${files.length} files to ${destination}`);
console.log('This folder excludes Git history and ignored local configuration, data, logs, and notes.');
