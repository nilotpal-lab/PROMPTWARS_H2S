import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = path.resolve('public');
const DISALLOWED_RASTER_EXT = /\.(png|jpe?g|gif)$/i;
const DISALLOWED_REF_RE = /\.(png|jpe?g|gif)(?:[?#"' )\s]|$)/i;

async function listFilesRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

describe('public/ WebP-only & SVG asset policy', () => {
  it('contains zero .png, .jpg, .jpeg, or .gif files or references across public/', async () => {
    const files = await listFilesRecursive(PUBLIC_DIR);
    const badFiles = files.filter((f) => DISALLOWED_RASTER_EXT.test(f));
    assert.deepEqual(badFiles, [], `Disallowed raster files found: ${badFiles.join(', ')}`);

    for (const filePath of files) {
      if (!/\.(html|css|js|svg)$/i.test(filePath)) {
        continue;
      }
      const text = await fs.readFile(filePath, 'utf8');
      assert.equal(
        DISALLOWED_REF_RE.test(text),
        false,
        `Disallowed raster reference found in ${path.relative(PUBLIC_DIR, filePath)}`
      );
    }
  });

  it('verifies every referenced .webp asset exists, is lightweight, and has RIFF....WEBP magic bytes', async () => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const webpRefs = Array.from(html.matchAll(/["']\/?(assets\/[a-z0-9._-]+\.webp)["']/gi), (m) => m[1]);
    assert.ok(webpRefs.includes('assets/winter-inversion-layers.webp'));
    assert.ok(webpRefs.includes('assets/diy-corsi-rosenthal-230v.webp'));

    for (const relRef of new Set(webpRefs)) {
      const fullPath = path.join(PUBLIC_DIR, relRef);
      const buf = await fs.readFile(fullPath);
      assert.ok(buf.length > 100 && buf.length < 100 * 1024, `${relRef} unexpected byte length: ${buf.length}`);
      assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `${relRef} missing RIFF header`);
      assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', `${relRef} missing WEBP signature`);
    }

    assert.match(html, /winter-inversion-layers\.webp"[^>]*width="800"[^>]*height="450"/s);
    assert.match(html, /diy-corsi-rosenthal-230v\.webp"[^>]*width="640"[^>]*height="420"/s);
  });

  it('verifies SVG favicon and modulepreload links are present and valid', async () => {
    const favicon = await fs.readFile(path.join(PUBLIC_DIR, 'favicon.svg'), 'utf8');
    assert.ok(favicon.length > 50);
    assert.ok(favicon.includes('<svg'));

    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/);
    assert.match(html, /<link[^>]+rel="modulepreload"[^>]+href="\/js\/state\.js"/);
    assert.match(html, /<link[^>]+rel="modulepreload"[^>]+href="\/js\/renderers\.js"/);
  });
});
