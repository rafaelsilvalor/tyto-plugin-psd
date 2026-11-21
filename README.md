# tyto-plugin-psd

A [Tyto](https://github.com/rafaelsilvalor/tyto) plugin that turns a Photoshop file into a
picture a brief can draw. With it installed, a brief may cite a `.psd` where it would cite a
`.png`, and Tyto draws either the file's stored composite or one of its layers (Tyto ADR 0223).
Tyto knows no file format of a vendor (Tyto ADR 0011): reading PSD lives here, in its own
repository, and reaches Tyto only through the plugin API. This repository is public and
unlicensed; see [Third-party code](#third-party-code) for what its bundle carries.

The plugin is called `psd-decoder`, because Tyto's own PSD exporter, which writes the guides
of `tyto render --guide`, is the built-in plugin `psd`.

## Install

From Tyto's plugin gallery, once its entry is listed, or straight from this repository:

```
tyto plugin install git+https://github.com/rafaelsilvalor/tyto-plugin-psd.git
```

Tyto copies the folder and never builds it, so `dist/index.js` is committed. The plugin needs
Tyto 0.28 of the plugin API or newer (`engine: ">=0.28"`), which brought `image-decoder`.

### What it may reach

Nothing: the manifest asks for no permission. For each picture, Tyto hands the plugin a token
for the one file the brief cites, good only until that decode answers, and the plugin reads
the file through it in parts of at most 8 MiB. It never sees the file's path, and it cannot
read any other file, the workspace or the network.

## In a brief

```
fundo: ./arte.psd
fundo: ./arte.psd#arte
fundo: ./arte.psd#grupo/arte
```

- **`arte.psd`** draws the stored composite: the whole document as Photoshop last saved it.
- **`arte.psd#arte`** draws the layer named `arte`, at the document's size, the layer's pixels
  where they sit in the document and transparent elsewhere, so it lines up with the composite.
  A hidden layer can be named: hiding a layer is how one file keeps several pieces of art.
- **`arte.psd#grupo/arte`** draws the layer `arte` inside the group `grupo`.

Names are exact, case included. A name two layers share is an error, never the first of them.
A group's own name is an error too: name a layer inside it.

**A file saved without "maximize compatibility" stores a fully transparent composite**, and
citing it without a layer is an error that asks you to name one, never a blank picture. Name a
layer after `#`, or save the file again with the option on.

An error reaches the author as Tyto's `E_ASSET_DECODE_FAILED`, carrying the plugin's message;
the slot stays empty, as for a missing file, and the rest of the brief renders.

## Trust and the cache

Tyto, not the plugin, keeps the decoded PNG, in `TYTO_HOME/cache/decoded/psd-decoder/`, keyed by
the file's content, the layer and the plugin's version, so saving the PSD again redraws it and
an unchanged file is never decoded twice. **A folder you have not trusted decodes nothing new**:
it serves a picture already in the cache, and a miss is an error that says to trust the folder
(Tyto ADR 0223, decision 8). A `--folder` delivery carries the decoded PNG, not the PSD.

## Limits

- **One picture is at most 32 MiB as a PNG.** A larger answer is an error that says so; make
  the document smaller or name a smaller layer.
- **The whole PSD is held in the plugin's memory while it decodes**: the reader needs it in one
  buffer. Tyto's side reads it in parts and never holds it whole.
- **A layer is drawn as its own pixels and its opacity.** Blend modes, layer masks, clipping,
  layer effects and adjustment layers are not applied; the composite is what has them all.
- 8-bit and 16-bit files are drawn; a 16-bit file keeps the high byte of each channel. A 32-bit
  file is an error.
- Smart objects have not been checked against a file saved by Photoshop yet.

## Developing

The plugin API comes from GitHub Packages, which needs a token even to read:

```
pnpm install --config.//npm.pkg.github.com/:_authToken=$(gh auth token)
pnpm build
pnpm check
```

`pnpm check` is Prettier, TypeScript, ESLint and Vitest. The tests load the committed
`dist/index.js` through `@tyto/plugin-api/testing` and decode PSD files written by `ag-psd`'s
own writer, so run `pnpm build` after changing `src/`. CI fails when `dist/` is not what `src/`
builds to.

## Third-party code

`dist/index.js` bundles [`ag-psd`](https://github.com/Agamnentzar/ag-psd) 34.2.2 (MIT),
[`pako`](https://github.com/nodeca/pako) 2.1.0 (MIT and Zlib) and
[`base64-js`](https://github.com/beatgammit/base64-js) 1.5.1 (MIT). Their licence texts are in
[`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md).
