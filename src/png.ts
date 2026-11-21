import { deflate } from 'pako';

/**
 * RGBA pixels as a PNG, in plain JavaScript: the plugin runs wherever Tyto runs a plugin, so
 * it cannot reach Node's zlib, and `pako` is already in the bundle because the PSD reader
 * inflates with it.
 */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Straight (not premultiplied) RGBA, four bytes a pixel, row after row. */
  readonly data: Uint8Array | Uint8ClampedArray;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPE_RGBA = 6;
const FILTER_NONE = 0;

export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const rowLength = width * 4;
  // Each row is preceded by its filter byte. No filter: a decoded artwork is mostly flat
  // colour or photographic, and deflate alone keeps the encoder small and its output exact.
  const raw = new Uint8Array((rowLength + 1) * height);
  for (let row = 0; row < height; row++) {
    raw[row * (rowLength + 1)] = FILTER_NONE;
    raw.set(data.subarray(row * rowLength, (row + 1) * rowLength), row * (rowLength + 1) + 1);
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = COLOUR_TYPE_RGBA;
  // compression, filter method and interlace are all 0

  const chunks = [
    chunk('IHDR', header),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = SIGNATURE.length + chunks.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  png.set(SIGNATURE, 0);
  let offset = SIGNATURE.length;
  for (const part of chunks) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value++) {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
