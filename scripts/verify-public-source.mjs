import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateRoots = new Set(['.git', '.env', '.vercel', '.data', '.codex', '.cursor', '.impeccable', '.next', 'node_modules', 'output', 'playwright-report', 'test-results']);
const privateNames = new Set(['CONTEXT.md', 'MEMORY.md', 'actualcontext.md', 'whatdidido.md', 'miscohook_spec.md', 'AUDIT.md', 'DESIGN.md', 'lint_results.txt', 'check.mjs', '.npmrc', '.git-credentials']);
const secretPatterns = [
  /https?:\/\/(?:\w+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{15,}\/[\w-]{30,}/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

export async function verifyPublicSource(root = sourceRoot) {
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
  if (resolve(gitRoot).toLowerCase() !== root.toLowerCase()) throw new Error('Run this check from a Git checkout of the source, not inside another repository.');
  // Include new application files without staging or changing the developer's index.
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  const candidates = [...new Set(output.split('\0').filter(Boolean))].sort();
  const files = [], problems = [];
  for (const file of candidates) {
    const normalized = file.replaceAll('\\', '/');
    const path = resolve(root, file);
    const inside = relative(root, path);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('../') || inside.startsWith('..\\')) { problems.push(`${file}: outside source root`); continue; }
    const stat = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) continue; // A deletion awaiting commit is not part of the release.
    if (stat.isSymbolicLink() || !stat.isFile()) { problems.push(`${file}: release entries must be regular files`); continue; }
    const privatePath = normalized.split('/').some(part => privateRoots.has(part) || part.startsWith('.playwright'))
      || (normalized.split('/').some(part => part.startsWith('.env')) && normalized !== '.env.example')
      || /\.(?:log|pem|key|p12|pfx|sqlite\w*|db(?:-[\w-]+)?)$/i.test(normalized)
      || privateNames.has(normalized) || ['src/app/docs/DESIGN.md', 'docs/FEATURE_AUDIT.md'].includes(normalized)
      || (!normalized.includes('/') && (/\.png$/i.test(normalized) || /^(?:test-|run-br)/.test(normalized)));
    if (privatePath) { problems.push(`${file}: private or development-only artifact is still included by Git`); continue; }
    const bytes = await readFile(path);
    if (!bytes.includes(0)) {
      const content = bytes.toString('utf8');
      if (secretPatterns.some(pattern => pattern.test(content))) problems.push(`${file}: possible credential (value withheld)`);
      if (file === '.env.example' && content.split(/\r?\n/).some(line => /^\s*[A-Z][A-Z\d_]*\s*=\s*\S/.test(line))) problems.push('.env.example: example values must be blank');
    }
    files.push(normalized);
  }
  for (const required of ['LICENSE', 'NOTICE', 'README.md', '.env.example', 'package.json', 'package-lock.json']) if (!files.includes(required)) problems.push(`${required}: missing from release`);
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (pkg.license !== 'Apache-2.0') problems.push('package.json: expected Apache-2.0 license');
  if (problems.length) throw new Error(`Public-source check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`);
  return files;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const files = await verifyPublicSource();
  console.log(`Verified ${files.length} public source files. No private artifacts or recognized credential patterns found.`);
  console.log('This checks the current source only. Scan Git history separately before publishing an existing repository.');
}
