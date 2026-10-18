#!/usr/bin/env node
/** Fail-closed guard for the independently initialized PUBLIC code-only repo. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFE = new Set([
  '.gitignore', '.github/workflows/deploy.yml', 'README.md',
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.json',
  'vite.config.ts',
  'scripts/verify-code-only.mjs', 'scripts/verify-code-only.test.mjs',
  'src/country-options.ts', 'src/duplicate-picker.css',
  'src/duplicate-report-picker.tsx', 'src/duplicate-selection.ts',
  'src/gallery-enhancements.css', 'src/main.tsx', 'src/pagination.ts',
  'src/postcard-image.ts', 'src/postcard-order.ts', 'src/style.css',
  'src/timezone.ts', 'src/vite-env.d.ts',
]);
const forbiddenPath = /(?:^|\/)(?:public|ops|data|images|postcards|worker|android|admin-mac|\.env(?:\..*)?|\.dev\.vars(?:\..*)?|10160[^/]*)(?:\/|$)|postcard-recycle\.json$|postcards\.json$|\.(?:apk|aab|p12|pfx|jks|keystore|pem|key|webp|jpe?g|png|gif|avif|zip|rtf|sqlite|db)$/i;
const secretPatterns = [
  /-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE|ENCRYPTED) PRIVATE KEY-----/i,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /(?:CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|MINMAY_RELEASE_PASSWORD)\s*[:=]\s*["']?(?!\$|\{)[A-Za-z0-9_\-/]{16,}/,
];
function safeRelative(name) {
  assert.equal(typeof name, 'string');
  assert(!name.startsWith('/') && !name.includes('\\') && !name.includes('..'));
  assert(!forbiddenPath.test(name), `Forbidden private-data path: ${name}`);
}
function gitTracked() {
  const bytes = execFileSync('git', ['ls-files', '--cached', '-z'], {cwd: ROOT});
  return bytes.toString('utf8').split('\0').filter(Boolean);
}
export async function checkTree({ trackedFiles = gitTracked(), root = ROOT } = {}) {
  assert(trackedFiles.length >= 18, 'Incomplete code-only git index');
  assert.equal(new Set(trackedFiles).size, trackedFiles.length, 'Duplicate tracked paths');
  for (const name of trackedFiles) {
    safeRelative(name);
    assert(SAFE.has(name), `Unreviewed file in public repo: ${name}`);
    const target = path.join(root, name);
    const stat = await lstat(target);
    assert(stat.isFile() && !stat.isSymbolicLink(), `Non-regular tracked file: ${name}`);
    assert(stat.size < 800_000, `Unexpectedly large public source: ${name}`);
    const data = await readFile(target);
    assert(!data.includes(0), `Binary content in code-only seed: ${name}`);
    const text = data.toString('utf8');
    for (const pattern of secretPatterns) {
      assert(!pattern.test(text), `Potential secret in reviewed source: ${name}`);
    }
  }
  assert(trackedFiles.includes('vite.config.ts') && trackedFiles.includes('.gitignore'));
  return {files: trackedFiles.length};
}
async function walk(directory) {
  const found = [];
  async function scan(abs, relative) {
    const stat = await lstat(abs);
    assert(!stat.isSymbolicLink(), `Symbolic link in artifact: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of await readdir(abs)) await scan(path.join(abs,name), relative ? relative+'/'+name : name);
    } else {
      assert(stat.isFile(), `Unexpected file type: ${relative}`);
      found.push({relative, size:stat.size, abs});
    }
  }
  await scan(directory,'');
  return found;
}
export async function checkDist(dist=path.join(ROOT,'dist')) {
  const files = await walk(dist);
  assert(files.length >= 2, 'Incomplete Pages artifact');
  assert(files.some(x => x.relative==='index.html'), 'Missing Pages entrypoint');
  for (const file of files) {
    assert(!forbiddenPath.test(file.relative), `Private-data path in Pages: ${file.relative}`);
    assert(file.relative==='index.html' || /^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(file.relative),
      `Unexpected public asset type or path: ${file.relative}`);
    assert(file.size <= 1_500_000, `Large unexpected Pages asset: ${file.relative}`);
    const text = await readFile(file.abs, 'utf8');
    for (const pattern of secretPatterns) assert(!pattern.test(text), `Secret embedded in Pages asset: ${file.relative}`);
  }
  return {files: files.length};
}

if (path.resolve(process.argv[1]||'') === fileURLToPath(import.meta.url)) {
  const task = process.argv[2];
  try {
    const result = task==='check-tree' ? await checkTree() :
      task==='check-dist' ? await checkDist(path.resolve(process.argv[3]||'dist')) :
      null;
    assert(result, 'Usage: verify-code-only.mjs check-tree | check-dist [dist]');
    console.log(`PASS ${task}: ${result.files} files; no old public postcard data or binaries.`);
  } catch (error) {
    console.error('CODE_ONLY_SEED_REJECTED:', error.message);
    process.exitCode=1;
  }
}
