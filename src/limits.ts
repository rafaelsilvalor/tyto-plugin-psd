/**
 * The plugin API's two limits a decoder works within, written here rather than imported: a
 * value import of `@tyto/plugin-api` would bundle the whole host side (Tyto's core, Zod, a font
 * reader) into `dist/index.js`, which Tyto copies and never builds. `tests/limits.test.ts`
 * holds them equal to the installed API's.
 */

/** The advised size of one `host.decoding.read` part (`PLUGIN_FILE_PART_BYTES`, ADR 0212). */
export const FILE_PART_BYTES = 8 * 2 ** 20;

/** The most a decoded picture may weigh (`IMAGE_DECODER_MAX_BYTES`, ADR 0223). */
export const DECODED_MAX_BYTES = 32 * 2 ** 20;
