import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkDist, checkTree } from './verify-code-only.mjs';

async function tempDir() {return mkdtemp(path.join(os.tmpdir(), 'minmay-public-seed-test-'));}

test('strict reviewed source list prohibits personal data and unreviewed files', async()=>{
  const root=await tempDir();
  try {
    await assert.rejects(checkTree({root,trackedFiles:['public/data/postcards.json']}), /Incomplete|Forbidden/);
    const selected=Array(18).fill('src/main.tsx');
    await assert.rejects(checkTree({root,trackedFiles:selected}), /Duplicate/);
  } finally {await rm(root,{recursive:true,force:true})}
});

test('clean Pages bundle includes only HTML, JS, and CSS', async()=>{
  const dir=await tempDir();
  try {
    await mkdir(path.join(dir,'assets'));
    await writeFile(path.join(dir,'index.html'), '<!doctype html>');
    await writeFile(path.join(dir,'assets/app.js'), 'console.log("website")');
    assert.equal((await checkDist(dir)).files, 2);
  } finally {await rm(dir,{recursive:true,force:true})}
});

test('any data JSON, hidden personal artifacts, images, and backup files abort publication',async()=>{
  const prohibited=['data/postcards.json','images/postcards/legacy.webp','101602.json','ops/postcard-recycle.json','secret.env','assets/image.png','assets/record.zip'];
  for (const relative of prohibited) {
    const dir=await tempDir();
    try {
      await writeFile(path.join(dir,'index.html'),'<html/>');
      await mkdir(path.dirname(path.join(dir,relative)),{recursive:true});
      await writeFile(path.join(dir,relative),'private');
      await assert.rejects(checkDist(dir), /private|Unexpected|Incomplete|asset|path/i, relative);
    } finally {await rm(dir,{recursive:true,force:true})}
  }
});

test('symlinks cannot follow outside of inspected archive',async()=>{
  const dir=await tempDir();
  try {
    await writeFile(path.join(dir,'index.html'),'<html/>');
    await symlink('/etc/hosts',path.join(dir,'stealth.txt'));
    await assert.rejects(checkDist(dir), /Symbolic link/);
  } finally {await rm(dir,{recursive:true,force:true})}
});

test('real source tree is strict allowlist',async()=>{
  const actual=await checkTree();
  assert(actual.files>=18);
});
