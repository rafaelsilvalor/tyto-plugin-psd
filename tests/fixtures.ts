import { initializeCanvas, writePsd, type Layer, type Psd } from 'ag-psd';
import { PNG } from 'pngjs';

/**
 * Neutral PSD fixtures, written by `ag-psd`'s own writer in the test run: flat colours on
 * small canvases, so a pixel check reads which layer landed where. Files saved by real
 * Photoshop (a smart object among them) come from the maintainer later.
 */

export type Rgba = readonly [number, number, number, number];

export const RED: Rgba = [255, 0, 0, 255];
export const GREEN: Rgba = [0, 255, 0, 255];
export const BLUE: Rgba = [0, 0, 255, 255];
export const CLEAR: Rgba = [0, 0, 0, 0];

interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  colorSpace: 'srgb';
}

export function filled(width: number, height: number, colour: Rgba): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set(colour, index * 4);
  return { width, height, data, colorSpace: 'srgb' };
}

/** Pixels no compressor can shrink, for an answer over the 32 MiB ceiling. */
export function noise(width: number, height: number): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = 0x2545f491;
  for (let index = 0; index < data.length; index++) {
    // xorshift: deterministic, and incompressible enough for deflate.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[index] = index % 4 === 3 ? 255 : state & 0xff;
  }
  return { width, height, data, colorSpace: 'srgb' };
}

let initialised = false;

export function psd(document: Psd): Uint8Array {
  if (!initialised) {
    // The writer never draws, but shares the reader's module state; the plugin's own stand-in
    // lives in its bundle, so this one is the test's.
    initializeCanvas(
      () => {
        throw new Error('the fixtures need no canvas');
      },
      (width, height) => filled(width, height, CLEAR) as never,
    );
    initialised = true;
  }
  return new Uint8Array(writePsd(document as never));
}

export function layer(name: string, fields: Omit<Layer, 'name'> = {}): Layer {
  return { name, ...fields };
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  at(x: number, y: number): Rgba;
}

/** Read with `pngjs`, a decoder the plugin does not use, so a pixel check is independent. */
export function readPng(bytes: Uint8Array): DecodedPng {
  const png = PNG.sync.read(Buffer.from(bytes));
  return {
    width: png.width,
    height: png.height,
    at(x, y) {
      const index = (y * png.width + x) * 4;
      return [
        png.data[index] ?? -1,
        png.data[index + 1] ?? -1,
        png.data[index + 2] ?? -1,
        png.data[index + 3] ?? -1,
      ];
    },
  };
}
