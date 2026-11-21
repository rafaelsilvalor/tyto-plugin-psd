import type { HostDecoding } from '@tyto/plugin-api';
import { describe, expect, it } from 'vitest';

import { FILE_PART_BYTES } from '../src/limits.js';
import { readWholeFile } from '../src/read-file.js';

function disk(bytes: Uint8Array) {
  const parts: { offset: number; length: number }[] = [];
  const decoding: HostDecoding = {
    read(_token, part) {
      parts.push(part);
      return Promise.resolve(bytes.slice(part.offset, part.offset + part.length));
    },
  };
  return { decoding, parts };
}

describe('readWholeFile', () => {
  it('reads the file in parts no longer than the advised 8 MiB', async () => {
    const size = FILE_PART_BYTES * 2 + 5;
    const bytes = new Uint8Array(size);
    for (let index = 0; index < size; index++) bytes[index] = index % 251;
    const { decoding, parts } = disk(bytes);
    const read = await readWholeFile(decoding, { token: 't', name: 'arte.psd', size });
    expect(parts).toEqual([
      { offset: 0, length: FILE_PART_BYTES },
      { offset: FILE_PART_BYTES, length: FILE_PART_BYTES },
      { offset: FILE_PART_BYTES * 2, length: 5 },
    ]);
    expect(read).toEqual(bytes);
  });

  it('stops at a short part, when the file shrank since the host measured it', async () => {
    const { decoding } = disk(new Uint8Array([1, 2, 3]));
    const read = await readWholeFile(decoding, { token: 't', name: 'arte.psd', size: 10 });
    expect(Array.from(read)).toEqual([1, 2, 3]);
  });
});
