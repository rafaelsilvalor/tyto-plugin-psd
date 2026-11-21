import type { DecodeFile, HostDecoding } from '@tyto/plugin-api';

import { FILE_PART_BYTES } from './limits.js';

/**
 * The whole file the call's token names, read in the advised part size (ADR 0223, ADR 0212).
 * The PSD reader needs the file in one buffer, so the plugin holds it whole; the host does not.
 * A part that comes back short before `size` ends the read: the file shrank since the host
 * measured it, and the reader then reports the truncated file in its own words.
 */
export async function readWholeFile(decoding: HostDecoding, file: DecodeFile): Promise<Uint8Array> {
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  while (offset < file.size) {
    const length = Math.min(FILE_PART_BYTES, file.size - offset);
    const part = await decoding.read(file.token, { offset, length });
    const read = Math.min(part.length, length);
    bytes.set(part.subarray(0, read), offset);
    offset += read;
    if (read < length) return bytes.subarray(0, offset);
  }
  return bytes;
}
