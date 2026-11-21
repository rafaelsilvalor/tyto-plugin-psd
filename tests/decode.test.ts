import { readFileSync } from 'node:fs';

import { testPlugin } from '@tyto/plugin-api/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BLUE, CLEAR, GREEN, RED, filled, layer, noise, psd, readPng } from './fixtures.js';

/**
 * Real decodes, as Tyto asks them: the committed `dist/index.js` activated over the isolation
 * protocol, each call given a token for one file and the file read back through
 * `host.decoding` (Tyto ADR 0223, ADR 0150).
 */
const manifest = readFileSync(new URL('../tyto-plugin.json', import.meta.url), 'utf8');
const entry = new URL('../dist/index.js', import.meta.url).href;

type Plugin = Extract<Awaited<ReturnType<typeof testPlugin>>, { ok: true }>['value'];
let plugin: Plugin;

beforeAll(async () => {
  const loaded = await testPlugin({ manifest, load: () => import(entry) });
  if (!loaded.ok) throw new Error(loaded.error.map((item) => item.message).join('\n'));
  plugin = loaded.value;
});

afterAll(async () => {
  await plugin.close();
});

async function decoded(bytes: Uint8Array, layerName?: string) {
  const answer = await plugin.decode(
    'arte.psd',
    bytes,
    layerName === undefined ? {} : { layer: layerName },
  );
  if (!answer.ok) throw new Error(answer.error.map((item) => item.message).join('\n'));
  return readPng(answer.value.bytes);
}

async function refusal(bytes: Uint8Array, layerName?: string): Promise<string> {
  const answer = await plugin.decode(
    'arte.psd',
    bytes,
    layerName === undefined ? {} : { layer: layerName },
  );
  if (answer.ok)
    throw new Error(`the decoder answered a picture of ${answer.value.bytes.length} bytes`);
  return answer.error.map((item) => `${item.code}: ${item.message}`).join('\n');
}

describe('without a layer', () => {
  it('answers the stored composite as a PNG of the document', async () => {
    const file = psd({
      width: 6,
      height: 4,
      imageData: filled(6, 4, BLUE),
      children: [layer('arte', { imageData: filled(6, 4, BLUE) })],
    });
    const png = await decoded(file);
    expect([png.width, png.height]).toEqual([6, 4]);
    expect(png.at(0, 0)).toEqual(BLUE);
    expect(png.at(5, 3)).toEqual(BLUE);
  });

  it('refuses a fully transparent composite and asks for a layer, never a blank picture', async () => {
    // What Photoshop stores when "maximize compatibility" is off.
    const file = psd({
      width: 6,
      height: 4,
      imageData: filled(6, 4, CLEAR),
      children: [layer('arte', { imageData: filled(6, 4, RED) })],
    });
    const message = await refusal(file);
    expect(message).toContain('E_ASSET_DECODE_FAILED');
    expect(message).toContain('arte.psd: its stored composite is fully transparent');
    expect(message).toContain("'arte.psd#layer'");
  });

  it('refuses bytes that are not a PSD in its own words', async () => {
    const message = await refusal(new TextEncoder().encode('not a photoshop file'));
    expect(message).toContain('arte.psd: the file could not be read as a PSD');
  });
});

describe('with a layer', () => {
  it('places the layer at its offsets on a canvas of the document size', async () => {
    const file = psd({
      width: 8,
      height: 6,
      imageData: filled(8, 6, BLUE),
      children: [layer('arte', { left: 3, top: 2, imageData: filled(2, 3, RED) })],
    });
    const png = await decoded(file, 'arte');
    expect([png.width, png.height]).toEqual([8, 6]);
    expect(png.at(3, 2)).toEqual(RED);
    expect(png.at(4, 4)).toEqual(RED);
    // Outside the layer's bounds the answer is transparent, not the composite.
    expect(png.at(2, 2)).toEqual(CLEAR);
    expect(png.at(5, 2)).toEqual(CLEAR);
    expect(png.at(3, 5)).toEqual(CLEAR);
    expect(png.at(0, 0)).toEqual(CLEAR);
  });

  it('clips a layer that hangs past the document edge', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [layer('arte', { left: -1, top: 2, imageData: filled(3, 4, GREEN) })],
    });
    const png = await decoded(file, 'arte');
    expect([png.width, png.height]).toEqual([4, 4]);
    expect(png.at(0, 2)).toEqual(GREEN);
    expect(png.at(1, 3)).toEqual(GREEN);
    expect(png.at(2, 3)).toEqual(CLEAR);
    expect(png.at(0, 1)).toEqual(CLEAR);
  });

  it('reads the layer even when the composite is transparent', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, CLEAR),
      children: [layer('arte', { imageData: filled(4, 4, RED) })],
    });
    expect((await decoded(file, 'arte')).at(1, 1)).toEqual(RED);
  });

  it('draws a hidden layer, which is how one file keeps several pieces of art', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [layer('arte', { hidden: true, imageData: filled(4, 4, GREEN) })],
    });
    expect((await decoded(file, 'arte')).at(2, 2)).toEqual(GREEN);
  });

  it('names a layer inside a group as group/layer', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [
        layer('fundo', { imageData: filled(4, 4, BLUE) }),
        layer('grupo', { children: [layer('arte', { imageData: filled(4, 4, RED) })] }),
      ],
    });
    expect((await decoded(file, 'grupo/arte')).at(0, 0)).toEqual(RED);
    expect(await refusal(file, 'arte')).toContain(
      "no layer is named 'arte' at the top of the file; did you mean 'grupo/arte'?",
    );
    expect(await refusal(file, 'grupo')).toContain("'grupo' is a group");
  });

  it('refuses a name two layers share, never drawing the first', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [
        layer('arte', { imageData: filled(4, 4, RED) }),
        layer('arte', { imageData: filled(4, 4, GREEN) }),
      ],
    });
    expect(await refusal(file, 'arte')).toContain("2 layers are named 'arte'");
  });

  it('matches names exactly, case included', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [layer('Arte', { imageData: filled(4, 4, RED) })],
    });
    expect(await refusal(file, 'arte')).toContain("no layer is named 'arte'");
  });

  it('refuses a layer whose pixels all lie outside the document', async () => {
    const file = psd({
      width: 4,
      height: 4,
      imageData: filled(4, 4, BLUE),
      children: [layer('arte', { left: 10, top: 10, imageData: filled(2, 2, RED) })],
    });
    expect(await refusal(file, 'arte')).toContain('draws nothing inside the document');
  });

  // A smart object's own stored composite can be transparent, and its layer pixels are what
  // Photoshop draws. ag-psd's writer cannot make a smart object, so this waits for a file
  // saved by real Photoshop, which the maintainer supplies (TYTO-742's Left open).
  it.todo('draws a smart-object layer from a file saved by Photoshop');
});

describe('the answer ceiling', () => {
  it('refuses a picture over 32 MiB as a PNG and says what to do', async () => {
    // 3,000 × 3,000 of opaque noise measured 30,881,273 bytes of PNG, under the 33,554,432
    // allowed; 3,200 × 3,200 is about 35 MB, over it.
    const file = psd({ width: 3200, height: 3200, imageData: noise(3200, 3200) });
    const message = await refusal(file);
    expect(message).toMatch(
      /arte\.psd: the picture is 3\d\.\d MiB as a PNG, more than the 32 MiB/u,
    );
  }, 60_000);
});
