import { readFileSync } from 'node:fs';

import { PLUGIN_API_VERSION, createPluginHost, type Disposable } from '@tyto/plugin-api';
import { testPlugin } from '@tyto/plugin-api/testing';
import { describe, expect, it } from 'vitest';

import { activate } from '../src/index.js';

/**
 * The plugin as Tyto loads it: the manifest's text checked by install against the
 * `@tyto/plugin-api` this repository installed, and the committed `dist/index.js` — the file
 * Tyto copies and never builds — activated over the isolation protocol (Tyto ADR 0150).
 */
const manifest = readFileSync(new URL('../tyto-plugin.json', import.meta.url), 'utf8');
const entry = new URL('../dist/index.js', import.meta.url).href;
const load = (): Promise<unknown> => import(entry);

describe('tyto-plugin.json', () => {
  it(`is a plugin the installed plugin API (${PLUGIN_API_VERSION}) installs and activates`, async () => {
    const loaded = await testPlugin({ manifest, load });
    expect(loaded.ok ? [] : loaded.error.map((item) => `${item.code}: ${item.message}`)).toEqual(
      [],
    );
    if (loaded.ok) await loaded.value.close();
  });

  it('asks for no permission: a decode reads only the one file its token names', async () => {
    const loaded = await testPlugin({ manifest, load });
    if (!loaded.ok) throw new Error('not loaded');
    const plugin = loaded.value;
    // Not `psd`: Tyto's built-in PSD exporter holds that name, and install refuses a second
    // plugin of a name already built in (`E_PLUGIN_DUPLICATE`).
    expect(plugin.manifest.name).toBe('psd-decoder');
    expect(plugin.manifest.contributes).toEqual(['image-decoder']);
    expect(plugin.manifest.permissions).toEqual([]);
    // The engine moves with the plugin API the plugin is built against (Tyto ADR 0154): 0.28
    // brought `image-decoder` and protocol 30, which a host before it refuses.
    expect(plugin.manifest.engine).toBe('>=0.28');
    await plugin.close();
  });

  it('carries the version package.json carries', async () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect((JSON.parse(manifest) as { version: string }).version).toBe(packageJson.version);
  });
});

describe('activate', () => {
  it('registers one decoder, for .psd', () => {
    const host = createPluginHost();
    let registered: Disposable | undefined;
    const activated = host.tryActivate({
      id: 'psd-decoder',
      manifest: JSON.parse(manifest) as unknown,
      activate(pluginHost) {
        registered = activate(pluginHost);
        return registered;
      },
    });
    expect(activated.ok).toBe(true);
    expect(host.registry.imageDecoders().map((item) => item.source.extensions)).toEqual([['.psd']]);
    registered?.dispose();
    expect(host.registry.imageDecoders()).toEqual([]);
  });
});
