import { initializeCanvas, readPsd, type Layer, type PixelData, type Psd } from 'ag-psd';

import type { RgbaImage } from './png.js';

/**
 * The PSD side of the decoder: the file's bytes in, straight RGBA out, or the reason why not in
 * words an author can act on. Nothing here knows about tokens or PNG.
 */
export type Drawn = { readonly ok: true; readonly image: RgbaImage } | Refusal;
export interface Refusal {
  readonly ok: false;
  readonly problem: string;
}

let canvasStandIn = false;

/**
 * `ag-psd` builds a picture through `createImageData`, which only a browser has, even when it
 * is asked for image data rather than a canvas: without this its reader throws "Canvas not
 * initialized" on the smallest file. A canvas itself is never needed for what this plugin
 * reads; if a file asks for one (a JPEG-compressed thumbnail, which the reader is told to
 * skip), the stand-in says so instead of drawing nothing.
 */
function ensureCanvasStandIn(): void {
  if (canvasStandIn) return;
  initializeCanvas(
    () => {
      throw new Error('this part of the file needs a canvas, which the plugin does not have');
    },
    (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
        colorSpace: 'srgb',
      }) as never, // `ImageData` as ag-psd declares it; the plugin's TypeScript has no DOM
  );
  canvasStandIn = true;
}

/** The stored composite, the whole document as Photoshop last saved it. */
export function drawComposite(bytes: Uint8Array): Drawn {
  const psd = read(bytes, { skipLayerImageData: true });
  if (!psd.ok) return psd;
  const composite = psd.value.imageData;
  if (composite === undefined) {
    return refuse(`the file stores no composite image; ${NAME_A_LAYER}`);
  }
  const image = straightRgba(composite);
  if (!image.ok) return image;
  // A PSD saved without "maximize compatibility" stores a composite that is fully transparent.
  // Drawing it would put a blank picture in the artwork with no warning.
  if (fullyTransparent(image.image)) {
    return refuse(
      `its stored composite is fully transparent, as Photoshop saves it without "maximize ` +
        `compatibility"; ${NAME_A_LAYER}, or save the file again with that option on`,
    );
  }
  return image;
}

const NAME_A_LAYER = "name a layer after '#' in the brief, as in 'arte.psd#layer'";

/**
 * One layer, placed where it sits on the document: the answer is the document's size, the
 * layer's pixels at its offsets and transparent elsewhere, so the picture lines up with the
 * composite whichever layer the brief names. Hidden layers can be named: hiding a layer in
 * Photoshop is how a designer keeps several pieces of art in one file.
 */
export function drawLayer(bytes: Uint8Array, path: string): Drawn {
  const psd = read(bytes, {});
  if (!psd.ok) return psd;
  const found = findLayer(psd.value, path);
  if (!found.ok) return found;
  const layer = found.layer;
  if (layer.children !== undefined) {
    return refuse(`'${path}' is a group; name a layer inside it, as in '${path}/<layer>'`);
  }
  if (layer.imageData === undefined || layer.imageData.width === 0) {
    return refuse(`the layer '${path}' has no pixels to draw`);
  }
  const pixels = straightRgba(layer.imageData);
  if (!pixels.ok) return pixels;
  const image = placed(psd.value, layer, pixels.image);
  if (fullyTransparent(image)) {
    return refuse(`the layer '${path}' draws nothing inside the document`);
  }
  return { ok: true, image };
}

type Read = { readonly ok: true; readonly value: Psd } | Refusal;

function read(bytes: Uint8Array, options: { readonly skipLayerImageData?: boolean }): Read {
  ensureCanvasStandIn();
  try {
    const value = readPsd(bytes, {
      ...options,
      useImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
    });
    return { ok: true, value };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return refuse(`the file could not be read as a PSD (${reason.replace(/\.+$/u, '')})`);
  }
}

type Found = { readonly ok: true; readonly layer: Layer } | Refusal;

/**
 * The layer a path names: `arte` for a layer at the top of the file, `group/arte` for one
 * inside a group. Names are exact, case included. Two layers at the same path are an error,
 * never the first of them, because the brief could be drawing either.
 */
export function findLayer(psd: Psd, path: string): Found {
  const matches: Layer[] = [];
  const nested: string[] = [];
  const visit = (layers: readonly Layer[], prefix: string): void => {
    for (const layer of layers) {
      const name = layer.name ?? '';
      const full = prefix === '' ? name : `${prefix}/${name}`;
      if (full === path) matches.push(layer);
      else if (prefix !== '' && name === path) nested.push(full);
      if (layer.children !== undefined) visit(layer.children, full);
    }
  };
  visit(psd.children ?? [], '');
  const [only] = matches;
  if (only !== undefined && matches.length === 1) return { ok: true, layer: only };
  if (matches.length > 1) {
    return refuse(
      `${matches.length} layers are named '${path}'; rename them so the brief names one`,
    );
  }
  if (nested.length > 0) {
    return refuse(
      `no layer is named '${path}' at the top of the file; did you mean '${nested[0]}'?`,
    );
  }
  return refuse(`no layer is named '${path}'`);
}

/** The layer's pixels on a transparent canvas of the document's size, at the layer's offsets. */
function placed(psd: Psd, layer: Layer, pixels: RgbaImage): RgbaImage {
  const width = psd.width;
  const height = psd.height;
  const data = new Uint8ClampedArray(width * height * 4);
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const opacity = layer.opacity ?? 1;
  // Clip to the document: a layer may hang past any edge, and only what is inside is drawn.
  const fromX = Math.max(0, left);
  const toX = Math.min(width, left + pixels.width);
  for (let y = Math.max(0, top); y < Math.min(height, top + pixels.height); y++) {
    if (toX <= fromX) break;
    const sourceRow = (y - top) * pixels.width;
    for (let x = fromX; x < toX; x++) {
      const source = (sourceRow + (x - left)) * 4;
      const target = (y * width + x) * 4;
      data[target] = pixels.data[source] ?? 0;
      data[target + 1] = pixels.data[source + 1] ?? 0;
      data[target + 2] = pixels.data[source + 2] ?? 0;
      data[target + 3] = Math.round((pixels.data[source + 3] ?? 0) * opacity);
    }
  }
  return { width, height, data };
}

/**
 * Eight-bit RGBA, whatever depth the file holds. A 16-bit file's channels keep their high byte;
 * a 32-bit file holds linear floating-point light, which this plugin does not convert.
 */
function straightRgba(pixels: PixelData): Drawn {
  const { width, height, data } = pixels;
  if (data instanceof Uint8ClampedArray || data instanceof Uint8Array) {
    return { ok: true, image: { width, height, data } };
  }
  if (data instanceof Uint16Array) {
    const eight = new Uint8ClampedArray(data.length);
    for (let index = 0; index < data.length; index++) eight[index] = (data[index] ?? 0) >>> 8;
    return { ok: true, image: { width, height, data: eight } };
  }
  return refuse(
    'the file is 32 bits per channel, which the plugin does not draw; save it at 8 or 16',
  );
}

function fullyTransparent(image: RgbaImage): boolean {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] !== 0) return false;
  }
  return true;
}

function refuse(problem: string): Refusal {
  return { ok: false, problem };
}
