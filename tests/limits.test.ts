import { IMAGE_DECODER_MAX_BYTES, PLUGIN_FILE_PART_BYTES } from '@tyto/plugin-api';
import { describe, expect, it } from 'vitest';

import { DECODED_MAX_BYTES, FILE_PART_BYTES } from '../src/limits.js';

describe('the limits the plugin writes down', () => {
  it('are the installed plugin API’s', () => {
    expect(FILE_PART_BYTES).toBe(PLUGIN_FILE_PART_BYTES);
    expect(DECODED_MAX_BYTES).toBe(IMAGE_DECODER_MAX_BYTES);
  });
});
