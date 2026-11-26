import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB_DIR = path.join(ROOT_DIR, 'lib');
const PUBLIC_LIB_DIR = path.join(ROOT_DIR, 'public', 'lib');

describe('lib/ <-> public/lib/ isomorphic mirror parity', () => {
  it('keeps every module in lib/ 100% byte-identical in public/lib/', async () => {
    const libFiles = (await fs.readdir(LIB_DIR)).filter((name) => name.endsWith('.js')).sort();
    const publicLibFiles = (await fs.readdir(PUBLIC_LIB_DIR)).filter((name) => name.endsWith('.js')).sort();

    assert.deepEqual(libFiles, ['aqi.js', 'impact.js', 'recommender.js', 'validation.js']);
    assert.deepEqual(publicLibFiles, libFiles);

    for (const file of libFiles) {
      const [srcBuf, destBuf] = await Promise.all([
        fs.readFile(path.join(LIB_DIR, file)),
        fs.readFile(path.join(PUBLIC_LIB_DIR, file))
      ]);
      assert.equal(
        Buffer.compare(srcBuf, destBuf),
        0,
        `public/lib/${file} is out of sync with lib/${file}; run npm run sync:lib`
      );
    }
  });
});
