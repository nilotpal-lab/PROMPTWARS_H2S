/**
 * @fileoverview Zero-dependency script to mirror isomorphic domain modules from lib/ into public/lib/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT_DIR, 'lib');
const DEST_DIR = path.join(ROOT_DIR, 'public', 'lib');
const FILES = ['aqi.js', 'impact.js', 'recommender.js', 'validation.js'];

async function syncLib() {
  await fs.mkdir(DEST_DIR, { recursive: true });
  for (const file of FILES) {
    const srcPath = path.join(SRC_DIR, file);
    const destPath = path.join(DEST_DIR, file);
    await fs.copyFile(srcPath, destPath);
  }
}

await syncLib();
